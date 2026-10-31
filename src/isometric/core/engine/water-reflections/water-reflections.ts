import { Container, Matrix, MeshSimple, Rectangle, RenderTexture, Sprite, Texture } from "pixi.js";
import { chunkFromKey, chunkKey } from "../grid";
import { projectBoxesToIsometric } from "../projection";
import { createBlockViews, createSpritePool, getBlockDepth } from "../render";
import { type EntityView, SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import {
  composeInto,
  getFaceUvs,
  getReflectedFaces,
  getReflectionMatrix,
  getWaterPlaneMatrix,
  getWaterTopMatrix,
  groupWaterLevels,
  REFLECTION_PIXELS_PER_TILE,
  type ReflectedFace,
  type ReflectionArea,
  type ReflectionFoot,
  reflectsOn,
} from "./reflection";
import type { ChunkKey, TerrainMaterial } from "../../types";

/** Opacity of what the water mirrors. */
export const REFLECTION_ALPHA = 0.62;

/** Colour the water lays over what it mirrors: a little darker and bluer than the real thing. */
export const REFLECTION_TINT = 0xc4dbe4;

/**
 * The sky mirrored where nothing else is: a faint brightening of the open water. Tinted by the
 * scene's light like every view.
 */
export const SKY_REFLECTION = { color: 0xdcf2ff, alpha: 0.14 } as const;

// What a render texture is cleared to: premultiplied by its alpha, as Pixi blends.
const SKY_CLEAR = [
  (((SKY_REFLECTION.color >> 16) & 0xff) / 255) * SKY_REFLECTION.alpha,
  (((SKY_REFLECTION.color >> 8) & 0xff) / 255) * SKY_REFLECTION.alpha,
  ((SKY_REFLECTION.color & 0xff) / 255) * SKY_REFLECTION.alpha,
  SKY_REFLECTION.alpha,
];

/**
 * Chunks whose reflections are drawn again per frame after the entities around them change (a
 * chunk shown or hidden next to them): each is one render to a small texture.
 */
export const REFLECTION_BAKES_PER_FRAME = 1;

/** One reflection map: the water tops of one level of a chunk, and what they mirror. */
type ReflectionMap = {
  readonly area: ReflectionArea;
  readonly texture: RenderTexture;
  /** What the map draws: the mirrored sides of the terrain, then the mirrored entities. */
  readonly content: Container;
  readonly meshes: readonly MeshSimple[];
  mirrors: Container[];
  /** Whether the last draw had the player in it. */
  withPlayer: boolean;
};

/** A shown chunk with water. */
type ReflectedChunk = {
  readonly key: ChunkKey;
  readonly maps: readonly ReflectionMap[];
};

/**
 * Scene module of the reflections on the water. Each shown chunk with water gets one small render
 * texture per level of its water tops, in the water's plane ({@link REFLECTION_PIXELS_PER_TILE}
 * texels a column), and one view per water column that lays its square of it on the column's
 * top, in the draw order like a ground shadow: what stands in front of the water covers its
 * reflection, without masks. The map shows the sky, the camera-facing sides of the terrain blocks
 * behind the water (a mesh per material, built once) and the sprites of the entities around it
 * (`entityViews`), each mirrored in the water's plane (`getReflectionMatrix()`), and is drawn
 * once: again only when the entities around it change ({@link REFLECTION_BAKES_PER_FRAME} chunks a
 * frame), or every frame while the player (`movingCasters`) is near enough to show in it. Without
 * those services it mirrors the sky and the terrain. The scene's light tints it like any view.
 */
export function createWaterReflections(): SceneModule {
  return {
    id: "water-reflections",
    async setup({ app, terrain, metrics, projection, columnAt, topInsetAt, assets, services, profile }) {
      const materials = (Object.keys(terrain) as TerrainMaterial[]).filter((material) => material !== "water");
      const loaded = await Promise.all(materials.map((material) => assets.loadSvg(terrain[material].textureSource)));
      const blocks = new Map<TerrainMaterial, Texture>();
      materials.forEach((material, index) => {
        const texture = loaded[index];
        if (texture) blocks.set(material, texture);
      });
      const entityViews = services.get("entityViews");
      const movingCasters = services.get("movingCasters");
      const sprites = createSpritePool();
      const chunks = new Map<ChunkKey, ReflectedChunk>();
      const pending = new Set<ChunkKey>();
      // The entity views of each chunk as last seen: a change asks the chunks around to redraw.
      const seen = new Map<ChunkKey, readonly EntityView[]>();
      const playerMirror = new Sprite();
      // Written for each sprite mirrored, read at once by `setFromMatrix()`.
      const reflection = new Matrix();
      const placement = new Matrix();
      const turned = new Matrix();

      const facesMesh = (material: TerrainMaterial, faces: readonly ReflectedFace[]) => {
        const texture = blocks.get(material);
        if (!texture) return undefined;
        const vertices = new Float32Array(faces.length * 8);
        const uvs = new Float32Array(faces.length * 8);
        const indices = new Uint32Array(faces.length * 6);
        faces.forEach(({ side, corners, cut }, index) => {
          vertices.set(corners, index * 8);
          uvs.set(getFaceUvs(side, texture, metrics, cut), index * 8);
          const first = index * 4;
          indices.set([first, first + 1, first + 2, first, first + 2, first + 3], index * 6);
        });
        const mesh = new MeshSimple({ texture, vertices, uvs, indices });
        mesh.autoUpdate = false;
        return mesh;
      };

      const buildMeshes = (area: ReflectionArea): MeshSimple[] => {
        const byMaterial = new Map<TerrainMaterial, ReflectedFace[]>();
        for (const face of getReflectedFaces(area, columnAt, metrics, topInsetAt)) {
          const list = byMaterial.get(face.material);
          if (list) list.push(face);
          else byMaterial.set(face.material, [face]);
        }
        return [...byMaterial].flatMap(([material, faces]) => facesMesh(material, faces) ?? []);
      };

      /** Mirrors in `map` the sprite `view` standing on `foot`, into `mirror`. */
      /**
       * Mirrors in `map` the sprite `view` standing on `foot`, into `mirror`: flipped straight down
       * or, with `turnAt` (a scene `x`), also left to right about it, which turns it half a circle.
       */
      const mirrorInto = (mirror: Sprite, view: Sprite, foot: ReflectionFoot, map: ReflectionMap, turnAt?: number) => {
        mirror.texture = view.texture;
        mirror.anchor.set(view.anchor.x, view.anchor.y);
        mirror.tint = view.tint;
        view.updateLocalTransform();
        getReflectionMatrix(foot, map.area, metrics, reflection);
        const local =
          turnAt === undefined
            ? view.localTransform
            : composeInto({ a: -1, b: 0, c: 0, d: 1, tx: 2 * turnAt, ty: 0 }, view.localTransform, turned);
        mirror.setFromMatrix(composeInto(reflection, local, placement));
      };

      // The reflection SVGs of the entities that have one (`reflectionSource`), by source: loaded
      // the first time a chunk needs one, then the chunks that waited for it are drawn again.
      const arts = new Map<string, Texture | undefined>();
      const waiting = new Map<string, Set<ChunkKey>>();
      /** The reflection SVG `source`, if loaded; otherwise loads it for chunk `key`. */
      const artOf = (source: string, key: ChunkKey): Texture | undefined => {
        if (arts.has(source)) return arts.get(source);
        const keys = waiting.get(source);
        if (keys) keys.add(key);
        else {
          waiting.set(source, new Set([key]));
          void assets.loadSvg(source).then((texture) => {
            arts.set(source, texture);
            waiting.get(source)?.forEach((waiter) => {
              if (chunks.has(waiter)) pending.add(waiter);
            });
            waiting.delete(source);
          });
        }
        return undefined;
      };

      /** Mirrors of the entities around `map` that may show in its water, furthest first. */
      const mirrorEntities = (map: ReflectionMap, key: ChunkKey): Container[] => {
        if (!entityViews) return [];
        const { cx, cy } = chunkFromKey(key);
        const around: EntityView[] = [];
        for (let x = cx - 1; x <= cx + 1; x += 1)
          for (let y = cy - 1; y <= cy + 1; y += 1)
            entityViews.get(chunkKey(x, y))?.forEach((view) => {
              if (reflectsOn(map.area, view.entity.x, view.entity.y)) around.push(view);
            });
        around.sort((behind, front) => behind.entity.baseScreenY - front.entity.baseScreenY);
        return around.flatMap(({ entity, views }): Container[] => {
          const { length, lengthAxis, reflectionSource } = entity.box;
          // An entity with a reflection SVG (its model mirrored by its generator: a pier's posts
          // under themselves, its deck below them): that SVG, placed as the sprite would be, laid
          // on the water's plane as it is, with no flip.
          const art = reflectionSource === undefined ? undefined : artOf(reflectionSource, key);
          if (art) {
            const laid = new Container();
            laid.setFromMatrix(getWaterPlaneMatrix(map.area, metrics, placement));
            // Placed as `entity-view` places its sprite, so the two canvases line up.
            const options = { height: entity.box.height, surfaceAligned: true, length, lengthAxis };
            createBlockViews({ texture: art, box: entity, metrics, ...options }).forEach(({ view }) =>
              laid.addChild(view),
            );
            return [laid];
          }
          // Otherwise every sprite of it (the strips of a long one, the parts of a cut one) mirrored as
          // one, upside down and touching it: one tile flipped straight down about its middle, a long
          // one turned half a circle about its anchor and the middle of its sprite, which keeps the
          // diagonal of its row and its shape (a flip reverses the diagonal).
          const turnAt =
            length > 1
              ? entity.screenX + (lengthAxis === "y" ? -1 : 1) * ((length - 1) / 2) * (metrics.tileWidth / 2)
              : undefined;
          const anchor: ReflectionFoot = {
            x: entity.x,
            y: entity.y,
            elevation: entity.box.elevation,
            screenX: entity.screenX,
            screenY: entity.screenY,
          };
          return views.flatMap(({ view }) => {
            if (!(view instanceof Sprite)) return [];
            const mirror = new Sprite();
            mirrorInto(mirror, view, anchor, map, turnAt);
            return [mirror];
          });
        });
      };

      /** The player, mirrored in `map` when it stands near enough to show in it. */
      const playerIn = (map: ReflectionMap): Sprite | undefined => {
        const caster = movingCasters?.[0];
        if (!caster || !(caster.view instanceof Sprite)) return undefined;
        const { ground, screen } = caster.foot();
        if (!reflectsOn(map.area, ground.x, ground.y)) return undefined;
        const foot = { ...ground, screenX: screen.x, screenY: screen.y };
        mirrorInto(playerMirror, caster.view, foot, map);
        return playerMirror;
      };

      const draw = (map: ReflectionMap, player: Sprite | undefined) => {
        if (player) map.content.addChild(player);
        app.renderer.render({ container: map.content, target: map.texture, clear: true, clearColor: SKY_CLEAR });
        if (player) map.content.removeChild(player);
        map.withPlayer = player !== undefined;
      };

      /** Mirrors the entities around `chunk` again and draws its maps. */
      const bake = (chunk: ReflectedChunk) =>
        chunk.maps.forEach((map) => {
          map.mirrors.forEach((mirror) => {
            map.content.removeChild(mirror);
            mirror.destroy({ children: true });
          });
          map.mirrors = mirrorEntities(map, chunk.key);
          map.mirrors.forEach((mirror) => map.content.addChild(mirror));
          draw(map, playerIn(map));
        });

      /** Asks the shown chunks around chunk `key` to mirror their entities again. */
      const touch = (key: ChunkKey) => {
        const { cx, cy } = chunkFromKey(key);
        for (let x = cx - 1; x <= cx + 1; x += 1)
          for (let y = cy - 1; y <= cy + 1; y += 1) {
            const near = chunkKey(x, y);
            if (chunks.has(near)) pending.add(near);
          }
      };

      return {
        showChunk: (chunk) => {
          const areas = groupWaterLevels(chunk.columns);
          if (areas.length === 0) return { views: [], destroy: () => {} };
          const textures: Texture[] = [];
          const views: SceneView[] = [];
          const maps = areas.map((area): ReflectionMap => {
            const { rect } = area;
            const texture = RenderTexture.create({
              width: (rect.maxX - rect.minX + 1) * REFLECTION_PIXELS_PER_TILE,
              height: (rect.maxY - rect.minY + 1) * REFLECTION_PIXELS_PER_TILE,
            });
            const content = new Container();
            content.alpha = REFLECTION_ALPHA;
            content.tint = REFLECTION_TINT;
            const meshes = buildMeshes(area);
            meshes.forEach((mesh) => content.addChild(mesh));
            projectBoxesToIsometric(area.columns, projection).forEach((top) => {
              const frame = new Texture({
                source: texture.source,
                frame: new Rectangle(
                  (top.x - rect.minX) * REFLECTION_PIXELS_PER_TILE,
                  (top.y - rect.minY) * REFLECTION_PIXELS_PER_TILE,
                  REFLECTION_PIXELS_PER_TILE,
                  REFLECTION_PIXELS_PER_TILE,
                ),
              });
              textures.push(frame);
              const view = sprites.take(frame);
              view.tint = 0xffffff;
              view.setFromMatrix(getWaterTopMatrix({ x: top.screenX, y: top.screenY }, metrics, placement));
              views.push({ view, depth: getBlockDepth(top, metrics), layer: SCENE_LAYER.ground });
            });
            return { area, texture, content, meshes, mirrors: [], withPlayer: false };
          });
          const reflected = { key: chunk.key, maps };
          chunks.set(chunk.key, reflected);
          bake(reflected);
          return {
            views,
            keepsViews: true,
            destroy: () => {
              chunks.delete(chunk.key);
              pending.delete(chunk.key);
              sprites.give(views.map(({ view }) => view));
              maps.forEach(({ texture, content, meshes }) => {
                // The render texture first: its frames listen to its source (see `createTexturePool()`).
                texture.destroy(true);
                meshes.forEach((mesh) => mesh.geometry.destroy());
                content.destroy({ children: true });
              });
              textures.forEach((texture) => texture.destroy());
            },
          };
        },
        update: () => {
          if (entityViews) {
            entityViews.forEach((views, key) => {
              if (seen.get(key) === views) return;
              seen.set(key, views);
              touch(key);
            });
            seen.forEach((_, key) => {
              if (entityViews.has(key)) return;
              seen.delete(key);
              touch(key);
            });
          }
          let baked = 0;
          for (const key of pending) {
            if (baked === REFLECTION_BAKES_PER_FRAME) break;
            pending.delete(key);
            profile("water-reflections:bake", () => bake(chunks.get(key) as ReflectedChunk));
            baked += 1;
          }
          if (!movingCasters) return;
          chunks.forEach(({ maps }) =>
            maps.forEach((map) => {
              const player = playerIn(map);
              if (player || map.withPlayer) profile("water-reflections:player", () => draw(map, player));
            }),
          );
        },
        destroy: () => {
          playerMirror.destroy();
          sprites.destroy();
        },
      };
    },
  };
}
