import {
  AlphaFilter,
  BlurFilter,
  BufferImageSource,
  Container,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from "pixi.js";
import {
  AO_PIXELS_PER_TILE,
  buildOcclusionMap,
  getCastShadowOffset,
  getShadowProjection,
  getShadowReach,
  getSilhouetteMatrix,
  SHADOW_REFRESH_TICKS,
} from "../lighting";
import { projectBoxesToIsometric } from "../projection";
import { getBlockDepth } from "../render";
import { type BuiltScene, type EntityView, SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import { CLOCK_PART, getSunState } from "../time";
import type { WorldChunk } from "../world";
import type { ChunkKey, OcclusionTerrain, ShadowProjection, WorldRect } from "../../types";
import { createReceivedShadows, type ReceivedShadows, type ShadowReceiver } from "./received-shadow";
import {
  createGroundShadowView,
  createSilhouettes,
  placeSilhouette,
  SHADOW_BLUR,
  SHADOW_MAP_PIXELS_PER_TILE,
  type Silhouette,
} from "./silhouette";

/**
 * Tiles a chunk's shadow maps reach past the chunk on every side: the blur of a shadow that
 * crosses a chunk edge does not fade at the edge of the map.
 */
export const SHADOW_MAP_MARGIN = 1;

/** One shadow map and the fixed layer it is drawn from. */
type ShadowLayer = {
  readonly level: number;
  readonly map: RenderTexture;
  /** Ambient occlusion of the level at the bottom, then the casters (if any reach it). */
  readonly root: Container;
  readonly occlusion: Texture;
  /** Silhouettes of the entities on this level or higher, with the shared filters. */
  casters?: Container;
  silhouettes: readonly { silhouette: Silhouette; lift: number }[];
};

/** Something drawn from the sun into a texture: a shadow map, or the shadows entities receive. */
type ShadowTarget = {
  /** Its casters, hidden at night (none when nothing casts on it). */
  readonly casters?: Container;
  readonly draw: (sun: ShadowProjection | null) => void;
  /** Tick it was last drawn for. */
  drawnTick: number;
};

/** The shadows of one shown chunk. */
type ShadowChunk = {
  readonly chunk: WorldChunk;
  readonly layers: readonly ShadowLayer[];
  received?: { readonly shadows: ReceivedShadows; readonly views: readonly SceneView[] };
  targets: ShadowTarget[];
  /** Its casters must be gathered again: it, or a neighbour, was just shown or hidden. */
  stale: boolean;
};

/**
 * Tiles beyond a caster's shadow reach that a receiver may still stand and be shaded: the
 * shadow and the receiver are as wide as a tile.
 */
const RECEIVER_SPAN = 1;

/**
 * Scene module of the shadows, drawn onto the terrain chunk by chunk: every column's top shows its
 * square of its chunk's shadow map of its own elevation, right after its top block (a sand top, its
 * `topInset` lower). Each map covers its chunk and {@link SHADOW_MAP_MARGIN} tiles around it, and
 * is drawn from a fixed layer: the level's ambient occlusion (computed once per chunk, with the
 * neighbours' columns, so it has no seam) and the silhouettes of the entities standing on it or
 * higher in the chunk and its eight neighbours, laid on the ground by the sun: shadows cross chunk
 * edges.
 *
 * Entities also shade each other: every entity sprite within reach of another entity's shadow
 * (`getShadowReach()`), searched among the entities of its chunk and the neighbouring ones, shows
 * its square of its chunk's atlas right after it (`createReceivedShadows()`), where the other
 * silhouettes land as `getCastShadowOffset()` says. The atlas takes its turn among the maps.
 *
 * A chunk's maps are drawn as soon as it is shown, at sunrise and at sunset (without silhouettes
 * at night); by day one map per frame is redrawn, the stalest of every shown chunk, once it is
 * `SHADOW_REFRESH_TICKS` old. When a chunk is shown or hidden, the casters of its neighbours are
 * gathered again. The casters come from the `entityViews` service: without it, the maps hold the
 * occlusion only.
 */
export function createShadows(): SceneModule {
  return {
    id: "shadows",
    setup({ app, world, columnAt, topInsetAt, projection, metrics, services }) {
      const pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE;
      // Silhouettes are drawn into shadow textures, never into the scene: blurred for soft edges,
      // with the sun's opacity applied to each group as a whole so overlaps do not darken twice.
      const blurFilter = new BlurFilter({ strength: SHADOW_BLUR, quality: 2 });
      const alphaFilter = new AlphaFilter({ alpha: 1 });
      const chunks = new Map<ChunkKey, ShadowChunk>();
      // Set by `start()`, before any chunk gathers its casters.
      let scene!: BuiltScene;
      let daytime: boolean | undefined;
      let sun: ShadowProjection | null = null;
      let tick = 0;

      const areaOf = ({ minX, minY, maxX, maxY }: WorldRect): WorldRect => ({
        minX: minX - SHADOW_MAP_MARGIN,
        minY: minY - SHADOW_MAP_MARGIN,
        maxX: maxX + SHADOW_MAP_MARGIN,
        maxY: maxY + SHADOW_MAP_MARGIN,
      });
      const occlusionTerrain = (bounds: WorldRect): OcclusionTerrain => ({
        bounds,
        topHeightAt: (x, y) => {
          const column = columnAt.get(x, y);
          return column === undefined ? undefined : column.elevation - topInsetAt(x, y);
        },
        levelAt: (x, y) => columnAt.get(x, y)?.elevation,
      });

      /** The shown chunks next to `chunk` (diagonals included), and itself. */
      const around = ({ coord }: WorldChunk) =>
        [...chunks.values()].filter(
          ({ chunk: { coord: other } }) => Math.max(Math.abs(other.cx - coord.cx), Math.abs(other.cy - coord.cy)) <= 1,
        );
      /** The entity views of `chunk` (`own`) and of it and its shown neighbours (`near`). */
      const nearbyViews = (chunk: WorldChunk) => {
        const byChunk = services.get("entityViews");
        if (!byChunk) return { own: [], near: [] };
        const near = around(chunk).flatMap((other) => byChunk.get(other.chunk.key) ?? []);
        return { own: byChunk.get(chunk.key) ?? [], near };
      };

      const silhouettesOf = ({ entity, views }: EntityView) =>
        createSilhouettes(views, entity, metrics, entity.box.length, entity.box.lengthAxis ?? "x");

      const drawLayer = (layer: ShadowLayer, area: WorldRect, light: ShadowProjection | null) => {
        if (light && layer.casters) {
          const mapOrigin = { x: area.minX - 0.5, y: area.minY - 0.5 };
          layer.silhouettes.forEach(({ silhouette, lift }) => {
            const ground = getSilhouetteMatrix(light, silhouette.worldFoot, lift, metrics);
            placeSilhouette(silhouette, ground, mapOrigin, pixelsPerTile);
          });
        }
        app.renderer.render({ container: layer.root, target: layer.map, clear: true, clearColor: [0, 0, 0, 0] });
      };
      const drawTarget = (target: ShadowTarget, light: ShadowProjection | null) => {
        if (light) alphaFilter.alpha = light.alpha;
        target.draw(light);
        target.drawnTick = tick;
      };

      /** Gathers the casters of a chunk's maps and atlas again; returns its targets, to draw. */
      const gather = (shadow: ShadowChunk): ShadowTarget[] => {
        shadow.stale = false;
        const area = areaOf(shadow.chunk.rect);
        const { own, near } = nearbyViews(shadow.chunk);

        shadow.layers.forEach((layer) => {
          layer.casters?.destroy({ children: true });
          layer.casters = undefined;
          // Casters standing on this level or higher: shadows onto higher ground are not drawn.
          layer.silhouettes = near
            .filter(({ entity }) => entity.box.elevation >= layer.level)
            .flatMap((caster) =>
              silhouettesOf(caster).map((silhouette) => ({
                silhouette,
                lift: caster.entity.box.elevation - layer.level,
              })),
            );
          if (layer.silhouettes.length === 0) return;
          const casters = new Container();
          casters.filters = [blurFilter, alphaFilter];
          // The whole map: known up front, so Pixi does not measure the silhouettes on every redraw.
          casters.filterArea = new Rectangle(0, 0, layer.map.width, layer.map.height);
          layer.silhouettes.forEach(({ silhouette }) => casters.addChild(silhouette.sprite));
          layer.root.addChild(casters);
          layer.casters = casters;
        });

        // Shadows entities cast on each other: each sprite of the chunk receives the silhouettes of
        // the nearby entities whose shadow could reach it with the sun at its lowest.
        if (shadow.received) {
          shadow.received.shadows.destroy();
          scene.remove(shadow.received.views);
          shadow.received = undefined;
        }
        const bodies = near.map((view) => ({ view, silhouettes: silhouettesOf(view) }));
        const receivers: ShadowReceiver[] = bodies
          .filter(({ view }) => own.includes(view))
          .flatMap((body) =>
            body.silhouettes.map((silhouette) => ({
              own: silhouette,
              casters: bodies
                .filter((other) => other !== body)
                .flatMap((other) => {
                  const lift = other.view.entity.box.elevation - body.view.entity.box.elevation;
                  return other.silhouettes
                    .filter(
                      ({ worldFoot, display }) =>
                        Math.hypot(silhouette.worldFoot.x - worldFoot.x, silhouette.worldFoot.y - worldFoot.y) <=
                        getShadowReach(display.height, lift, metrics) + RECEIVER_SPAN,
                    )
                    .map((caster) => ({ silhouette: caster, lift }));
                }),
            })),
          )
          .filter(({ casters }) => casters.length > 0);
        if (receivers.length > 0) {
          const received = createReceivedShadows(receivers, app.renderer, [blurFilter, alphaFilter]);
          const views = received.views.map((view) => ({ ...view, layer: SCENE_LAYER.onObject }));
          shadow.received = { shadows: received, views };
          scene.add(views);
        }

        shadow.targets = shadow.layers.map((layer) => ({
          casters: layer.casters,
          draw: (light) => drawLayer(layer, area, light),
          drawnTick: tick,
        }));
        const received = shadow.received?.shadows;
        if (received) {
          shadow.targets.push({
            casters: received.casters,
            draw: (light) =>
              received.draw(
                light && ((caster, receiver, lift) => getCastShadowOffset(light, caster, receiver, lift, metrics)),
              ),
            drawnTick: tick,
          });
        }
        return shadow.targets;
      };

      /** Marks `chunk` and its shown neighbours to gather their casters again. */
      const touch = (chunk: WorldChunk) =>
        around(chunk).forEach((other) => {
          other.stale = true;
        });

      const showChunk = (chunk: WorldChunk) => {
        // Shadow maps: one render texture per top elevation of the chunk, a square of
        // `SHADOW_MAP_PIXELS_PER_TILE` texels per column of its area, texel (0, 0) at its corner.
        const area = areaOf(chunk.rect);
        const columnsWide = area.maxX - area.minX + 1;
        const columnsDeep = area.maxY - area.minY + 1;
        const maps = new Map<number, RenderTexture>();
        const mapFor = (level: number) => {
          const existing = maps.get(level);
          if (existing) return existing;
          const map = RenderTexture.create({ width: columnsWide * pixelsPerTile, height: columnsDeep * pixelsPerTile });
          maps.set(level, map);
          return map;
        };
        const views: SceneView[] = projectBoxesToIsometric(chunk.columns, projection).map((top) => {
          const frame = new Texture({
            source: mapFor(top.box.elevation).source,
            frame: new Rectangle(
              (top.x - area.minX) * pixelsPerTile,
              (top.y - area.minY) * pixelsPerTile,
              pixelsPerTile,
              pixelsPerTile,
            ),
          });
          const tileTop = { x: top.screenX, y: top.screenY + topInsetAt(top.x, top.y) * metrics.boxHeight };
          return {
            ...createGroundShadowView(frame, tileTop, metrics, getBlockDepth(top, metrics)),
            layer: SCENE_LAYER.ground,
          };
        });

        // Ambient occlusion: computed once per chunk (the terrain is static).
        const terrain = occlusionTerrain(area);
        const layers: ShadowLayer[] = [...maps].map(([level, map]) => {
          const root = new Container();
          const occlusion = new Texture({
            source: new BufferImageSource({
              resource: buildOcclusionMap(terrain, level, AO_PIXELS_PER_TILE),
              width: columnsWide * AO_PIXELS_PER_TILE,
              height: columnsDeep * AO_PIXELS_PER_TILE,
            }),
          });
          const occlusionSprite = new Sprite(occlusion);
          occlusionSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
          root.addChild(occlusionSprite);
          return { level, map, root, occlusion, silhouettes: [] };
        });

        const shadow: ShadowChunk = { chunk, layers, targets: [], stale: true };
        chunks.set(chunk.key, shadow);
        touch(chunk);
        return {
          views,
          destroy: () => {
            chunks.delete(chunk.key);
            touch(chunk);
            if (shadow.received) {
              shadow.received.shadows.destroy();
              scene.remove(shadow.received.views);
            }
            layers.forEach(({ root, occlusion }) => {
              root.destroy({ children: true });
              occlusion.destroy(true);
            });
            maps.forEach((map) => map.destroy(true));
          },
        };
      };

      const update = (now: number) => {
        tick = now;
        sun = getShadowProjection(getSunState(now));
        const isDay = sun !== null;
        const shadows = [...chunks.values()];
        const fresh = shadows.filter(({ stale }) => stale).flatMap(gather);
        // When built, at sunrise and at sunset: every map (casters only by day); otherwise the maps
        // of the chunks that just gathered their casters.
        const turned = isDay !== daytime;
        daytime = isDay;
        const targets = shadows.flatMap(({ targets: own }) => own);
        (turned ? targets : fresh).forEach((target) => {
          if (target.casters) target.casters.visible = isDay;
          drawTarget(target, sun);
        });
        if (turned || !sun) return;

        // By day, one map per frame: the stalest, so no frame pays for all of them and, in turns,
        // all keep moving even when a refresh falls due on every frame.
        let stalest: ShadowTarget | undefined;
        let stalestAge = SHADOW_REFRESH_TICKS - 1;
        targets.forEach((target) => {
          const age = Math.abs(now - target.drawnTick);
          if (target.casters && age > stalestAge) {
            stalest = target;
            stalestAge = age;
          }
        });
        if (stalest) drawTarget(stalest, sun);
      };

      return {
        showChunk,
        start: (built) => {
          scene = built;
          update(world.parts.get(CLOCK_PART).tick);
        },
        update: ({ tick: now }) => update(now),
        destroy: () => {},
      };
    },
  };
}
