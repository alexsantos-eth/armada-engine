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
import { createSpritePool, getBlockDepth } from "../render";
import { type BuiltScene, type EntityView, SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import { CLOCK_PART, getSunState } from "../time";
import type { WorldChunk } from "../world";
import type { ChunkKey, OcclusionTerrain, ShadowProjection, WorldRect } from "../../types";
import { pairShadows } from "./pairs";
import { createReceivedShadows, type ReceivedShadows } from "./received-shadow";
import { createTexturePool } from "./texture-pool";
import {
  createGroundShadowView,
  createSilhouettes,
  createSilhouetteSprite,
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

/**
 * Gathering steps per frame, once the scene is built: showing a chunk makes it and its eight
 * neighbours gather their casters again, and gathering them all in one frame froze the game. A
 * chunk gathers in two steps, on two frames: its maps' casters ({@link ShadowGathering}
 * `"maps"`), then the shadows its entities receive (`"received"`). The chunks never gathered
 * go first; the others keep their old shadows a few frames.
 */
export const SHADOW_GATHERS_PER_FRAME = 1;

/** The gathering step a chunk is waiting for: see {@link SHADOW_GATHERS_PER_FRAME}. */
export type ShadowGathering = "maps" | "received";

/** One shadow map and the fixed layer it is drawn from. */
type ShadowLayer = {
  readonly level: number;
  readonly map: RenderTexture;
  /** Ambient occlusion of the level at the bottom, then the casters (if any reach it). */
  readonly root: Container;
  readonly occlusion: Texture;
  /** Silhouettes of the entities on this level or higher, with the shared filters. */
  casters?: Container;
  /** Those that may reach the map, each with its sprite in `casters`. */
  silhouettes: readonly { silhouette: Silhouette; lift: number; sprite: Sprite }[];
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
  received?: { readonly shadows: ReceivedShadows; readonly views: readonly SceneView[]; readonly target: ShadowTarget };
  /** Its maps, drawn from the casters gathered last. */
  maps: ShadowTarget[];
  /** Its next gathering step: it, or a neighbour, was just shown or hidden. */
  gathering?: ShadowGathering;
  /** Whether it has gathered both steps once. */
  gathered: boolean;
};

const targetsOf = ({ maps, received }: ShadowChunk) => (received ? [...maps, received.target] : maps);

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
 * A chunk's maps are drawn when it gathers its casters, at sunrise and at sunset (without
 * silhouettes at night); by day one map per frame is redrawn, the stalest of every shown chunk,
 * once it is `SHADOW_REFRESH_TICKS` old. When a chunk is shown or hidden, it and its neighbours
 * gather their casters again, in two steps (maps, then received shadows): all of them when the
 * scene is built, then {@link SHADOW_GATHERS_PER_FRAME} step per frame, the chunks never
 * gathered first. A map only takes the casters whose shadow may reach it, and each entity view's
 * silhouettes are made once. The caster textures of the received shadows are pooled
 * (`createTexturePool()`), never destroyed one by one. The casters come from the `entityViews`
 * service: without it, the maps hold the occlusion only.
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
      // Caster textures of the received shadows, reused as chunks gather again.
      const textures = createTexturePool();
      // Sprites of the ground shadows, a chunk's given back when it is hidden for the next one.
      const groundSprites = createSpritePool();
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

      // Silhouettes of each entity view, made once: its sprites never move.
      const silhouettesByView = new WeakMap<EntityView, readonly Silhouette[]>();
      const silhouettesOf = (view: EntityView) => {
        const cached = silhouettesByView.get(view);
        if (cached) return cached;
        const { entity, views } = view;
        const made = createSilhouettes(views, entity, metrics, entity.box.length, entity.box.lengthAxis ?? "x");
        silhouettesByView.set(view, made);
        return made;
      };
      // Sprites of silhouettes no map draws any more, reused by the next gathering instead of
      // destroyed and made again: a chunk's maps hold thousands.
      const spares: Sprite[] = [];
      const spriteFor = (silhouette: Silhouette) => {
        const sprite = spares.pop();
        if (!sprite) return createSilhouetteSprite(silhouette);
        sprite.texture = silhouette.texture;
        return sprite;
      };
      /** A layer's container of silhouettes, with the shared filters, on top of its occlusion. */
      const castersFor = (layer: ShadowLayer) => {
        const casters = new Container();
        casters.filters = [blurFilter, alphaFilter];
        // The whole map: known up front, so Pixi does not measure the silhouettes on every redraw.
        casters.filterArea = new Rectangle(0, 0, layer.map.width, layer.map.height);
        layer.root.addChild(casters);
        layer.casters = casters;
        return casters;
      };
      /** Takes the silhouette sprites out of a map's layer, to be reused. */
      const spareCasters = (layer: ShadowLayer) => {
        layer.casters?.removeChildren().forEach((sprite) => spares.push(sprite as Sprite));
      };
      /**
       * Whether `silhouette`'s shadow may fall on `area` (or its blur spill into it), `lift` blocks
       * above it, with the sun as low as shadows get: within its reach, plus how far it spreads
       * across the shadow, plus a tile.
       */
      const reaches = ({ worldFoot, screenFoot, display }: Silhouette, lift: number, area: WorldRect) => {
        const across =
          (Math.max(screenFoot.x - display.left, display.left + display.width - screenFoot.x) * Math.SQRT2) /
          metrics.tileWidth;
        const dx = Math.max(area.minX - 0.5 - worldFoot.x, 0, worldFoot.x - area.maxX - 0.5);
        const dy = Math.max(area.minY - 0.5 - worldFoot.y, 0, worldFoot.y - area.maxY - 0.5);
        return Math.hypot(dx, dy) <= getShadowReach(display.height, lift, metrics) + across + RECEIVER_SPAN;
      };

      const drawLayer = (layer: ShadowLayer, area: WorldRect, light: ShadowProjection | null) => {
        if (light && layer.casters) {
          const mapOrigin = { x: area.minX - 0.5, y: area.minY - 0.5 };
          layer.silhouettes.forEach(({ silhouette, lift, sprite }) => {
            const ground = getSilhouetteMatrix(light, silhouette.worldFoot, lift, metrics);
            placeSilhouette(sprite, silhouette, ground, mapOrigin, pixelsPerTile);
          });
        }
        app.renderer.render({ container: layer.root, target: layer.map, clear: true, clearColor: [0, 0, 0, 0] });
      };
      const drawTarget = (target: ShadowTarget, light: ShadowProjection | null) => {
        if (light) alphaFilter.alpha = light.alpha;
        target.draw(light);
        target.drawnTick = tick;
      };

      /** Gathers the casters of a chunk's maps again; returns the maps, to draw. */
      const gatherMaps = (shadow: ShadowChunk): ShadowTarget[] => {
        const area = areaOf(shadow.chunk.rect);
        const { near } = nearbyViews(shadow.chunk);
        shadow.maps = shadow.layers.map((layer) => {
          spareCasters(layer);
          // Casters standing on this level or higher (shadows onto higher ground are not drawn)
          // whose shadow may reach the map.
          layer.silhouettes = near
            .filter(({ entity }) => entity.box.elevation >= layer.level)
            .flatMap((caster) => {
              const lift = caster.entity.box.elevation - layer.level;
              return silhouettesOf(caster)
                .filter((silhouette) => reaches(silhouette, lift, area))
                .map((silhouette) => ({ silhouette, lift, sprite: spriteFor(silhouette) }));
            });
          if (layer.silhouettes.length === 0) {
            // An empty container would still run its filters on every redraw.
            layer.casters?.destroy();
            layer.casters = undefined;
          } else {
            const casters = layer.casters ?? castersFor(layer);
            layer.silhouettes.forEach(({ sprite }) => casters.addChild(sprite));
          }
          return { casters: layer.casters, draw: (light) => drawLayer(layer, area, light), drawnTick: tick };
        });
        return shadow.maps;
      };

      /**
       * Gathers the shadows the entities of a chunk cast on each other again: each sprite of the
       * chunk receives the silhouettes of the nearby entities whose shadow could reach it with the
       * sun at its lowest. Returns their atlas, to draw (none when nothing shades them).
       */
      const gatherReceived = (shadow: ShadowChunk): ShadowTarget[] => {
        if (shadow.received) {
          shadow.received.shadows.destroy();
          scene.remove(shadow.received.views);
          shadow.received = undefined;
        }
        const { own, near } = nearbyViews(shadow.chunk);
        const receiving = new Set(own);
        const receivers = pairShadows(
          near.map((view) => ({ view, elevation: view.entity.box.elevation, silhouettes: silhouettesOf(view) })),
          ({ view }) => receiving.has(view),
          (height, lift) => getShadowReach(height, lift, metrics) + RECEIVER_SPAN,
        );
        if (receivers.length === 0) return [];
        const shadows = createReceivedShadows(receivers, app.renderer, [blurFilter, alphaFilter], textures);
        const views = shadows.views.map((view) => ({ ...view, layer: SCENE_LAYER.onObject }));
        scene.add(views);
        const target: ShadowTarget = {
          casters: shadows.casters,
          draw: (light) =>
            shadows.draw(
              light && ((caster, receiver, lift) => getCastShadowOffset(light, caster, receiver, lift, metrics)),
            ),
          drawnTick: tick,
        };
        shadow.received = { shadows, views, target };
        return [target];
      };

      /** Runs the next gathering step of a chunk; returns what it gathered, to draw. */
      const gather = (shadow: ShadowChunk): ShadowTarget[] => {
        if (shadow.gathering === "maps") {
          shadow.gathering = "received";
          return gatherMaps(shadow);
        }
        shadow.gathering = undefined;
        shadow.gathered = true;
        return gatherReceived(shadow);
      };

      /** Marks `chunk` and its shown neighbours to gather their casters again. */
      const touch = (chunk: WorldChunk) =>
        around(chunk).forEach((other) => {
          other.gathering = "maps";
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
            ...createGroundShadowView(
              frame,
              tileTop,
              metrics,
              getBlockDepth(top, metrics),
              pixelsPerTile,
              groundSprites,
            ),
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

        const shadow: ShadowChunk = { chunk, layers, maps: [], gathering: "maps", gathered: false };
        chunks.set(chunk.key, shadow);
        touch(chunk);
        return {
          views,
          keepsViews: true,
          destroy: () => {
            groundSprites.give(views.map(({ view }) => view));
            chunks.delete(chunk.key);
            touch(chunk);
            if (shadow.received) {
              shadow.received.shadows.destroy();
              scene.remove(shadow.received.views);
            }
            layers.forEach((layer) => {
              spareCasters(layer);
              const { root, occlusion } = layer;
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
        // When built, both steps of every chunk; then a few steps per frame, the chunks never
        // gathered first.
        const stale = shadows
          .filter(({ gathering }) => gathering !== undefined)
          .sort((a, b) => Number(a.gathered) - Number(b.gathered));
        const fresh =
          daytime === undefined
            ? stale.flatMap((shadow) => [...gather(shadow), ...gather(shadow)])
            : stale.slice(0, SHADOW_GATHERS_PER_FRAME).flatMap(gather);
        // When built, at sunrise and at sunset: every map (casters only by day); otherwise the maps
        // of the chunks that just gathered their casters.
        const turned = isDay !== daytime;
        daytime = isDay;
        const targets = shadows.flatMap(targetsOf);
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
        destroy: () => {
          spares.forEach((sprite) => sprite.destroy());
          groundSprites.destroy();
        },
      };
    },
  };
}
