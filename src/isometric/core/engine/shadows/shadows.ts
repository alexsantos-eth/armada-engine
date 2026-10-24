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
import type { AffineTarget, ChunkKey, OcclusionTerrain, ShadowProjection, WorldRect } from "../../types";
import { pairShadows } from "./pairs";
import { createReceivedShadows, type ReceivedShadows, type ShadowReceiver } from "./received-shadow";
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
 * chunk gathers in three steps, on three frames: its maps' casters ({@link ShadowGathering}
 * `"maps"`), then which of its entities' sprites the others shade (`"pairs"`), then the atlas of
 * those shadows (`"received"`): pairing and building the atlas in one frame took up to 15 ms with
 * the zoom out (#72). The chunks never gathered go first; the others keep their old shadows a few
 * frames.
 */
export const SHADOW_GATHERS_PER_FRAME = 1;

/**
 * Shadow textures redrawn per frame after sunrise and sunset, until all are: drawing every map
 * and atlas of the shown chunks in that one frame took tens of milliseconds with the zoom out
 * (#72). The sun is on the horizon then and shadows are faded out, so the turns do not show.
 */
export const SHADOW_TURN_DRAWS_PER_FRAME = 4;

/** The gathering step a chunk is waiting for: see {@link SHADOW_GATHERS_PER_FRAME}. */
export type ShadowGathering = "maps" | "pairs" | "received";

/** What a shadow target draws: a chunk's map (`"maps"`) or the atlas of its received shadows (`"received"`). */
type ShadowTargetKind = Exclude<ShadowGathering, "pairs">;

/**
 * One level of a chunk's shadow map: the fixed layers its columns' squares are drawn from. The
 * level is drawn whole into the module's scratch texture, then copied into the chunk's map over
 * its own columns only, so one map holds every level (#53).
 */
type ShadowLayer = {
  readonly level: number;
  /**
   * The chunk's columns of this level, as a rectangle: only their squares of the map show, so a
   * caster whose shadow cannot reach it is left out of the map.
   */
  readonly bounds: WorldRect;
  /**
   * Drawn into the scratch texture: the chunk's ambient occlusion at the bottom, then the casters
   * (if any reach it), then the other levels' columns erased.
   */
  readonly root: Container;
  /** Drawn into the chunk's map: this level's columns erased, then the scratch texture over them. */
  readonly copy: Container;
  /** The scratch texture of its map's size. */
  readonly scratch: RenderTexture;
  /** Its two masks' textures: its own columns, and the other levels'. */
  readonly masks: readonly Texture[];
  /** Silhouettes of the entities on this level or higher, with the shared filters. */
  casters?: Container;
  /** Those that may reach the map, each with its sprite in `casters`. */
  silhouettes: readonly { silhouette: Silhouette; lift: number; sprite: Sprite }[];
};

/** Something drawn from the sun into a texture: a shadow map, or the shadows entities receive. */
type ShadowTarget = {
  /** What it is, for the profiled scene: a shadow map (`maps`) or an atlas (`received`). */
  readonly kind: ShadowTargetKind;
  /** Its casters, hidden at night (none when nothing casts on it). */
  readonly casters?: Container;
  readonly draw: (sun: ShadowProjection | null) => void;
  /** Tick it was last drawn for. */
  drawnTick: number;
  /** Whether it waits to be drawn for the sunrise or the sunset ({@link SHADOW_TURN_DRAWS_PER_FRAME}). */
  turning?: boolean;
};

/** What the profiled scene records a target's draws as: made once, not on every draw. */
const DRAW_LABEL: Readonly<Record<ShadowTargetKind, string>> = { maps: "shadows:maps", received: "shadows:received" };

/** What the profiled scene records each gathering step as. */
const GATHER_LABEL: Readonly<Record<ShadowGathering, string>> = {
  maps: "shadows:gather-maps",
  pairs: "shadows:gather-pairs",
  received: "shadows:gather-received",
};

/** The shadows of one shown chunk. */
type ShadowChunk = {
  readonly chunk: WorldChunk;
  /** Its shadow map: every column's square shows the shadows of its own level. */
  readonly map: RenderTexture;
  readonly layers: readonly ShadowLayer[];
  received?: { readonly shadows: ReceivedShadows; readonly views: readonly SceneView[]; readonly target: ShadowTarget };
  /** The shadows its entities' sprites receive, paired on the step before their atlas is built. */
  pairs?: readonly ShadowReceiver[];
  /** Its maps, drawn from the casters gathered last. */
  maps: ShadowTarget[];
  /** Its next gathering step: it, or a neighbour, was just shown or hidden. */
  gathering?: ShadowGathering;
  /** Whether it has gathered every step once. */
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
 * A chunk's maps are drawn when it gathers its casters and again after sunrise and sunset
 * (without silhouettes at night), {@link SHADOW_TURN_DRAWS_PER_FRAME} per frame; by day one map per frame is redrawn, the stalest of every shown chunk,
 * once it is `SHADOW_REFRESH_TICKS` old. When a chunk is shown or hidden, it and its neighbours
 * gather their casters again, in three steps (maps, pairs, received shadows): all of them when the
 * scene is built, then {@link SHADOW_GATHERS_PER_FRAME} step per frame, the chunks never
 * gathered first. A map only takes the casters whose shadow may reach a column of its level
 * (only those squares of it show), and each entity view's silhouettes are made once. The caster
 * textures of the received shadows are pooled (`createTexturePool()`), never destroyed one by
 * one. The casters come from the `entityViews` service: without it, the maps hold the occlusion
 * only.
 */
export function createShadows(): SceneModule {
  return {
    id: "shadows",
    setup({ app, world, columnAt, topInsetAt, projection, metrics, services, profile }) {
      const pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE;
      // Where each level is drawn whole before its columns are copied into its chunk's map: one per
      // size of map (all chunks but those cut by the edge of a bounded world share one), shared by
      // the chunks, since the draws run one after the other.
      const scratches = new Map<string, RenderTexture>();
      const scratchFor = ({ width, height }: RenderTexture) => {
        const size = `${width}×${height}`;
        const existing = scratches.get(size);
        if (existing) return existing;
        const made = RenderTexture.create({ width, height });
        scratches.set(size, made);
        return made;
      };
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
        casters.filterArea = new Rectangle(0, 0, layer.scratch.width, layer.scratch.height);
        // Over the occlusion, under the eraser of the other levels.
        layer.root.addChildAt(casters, 1);
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

      // Written for each silhouette laid and each pair placed, read at once: a redraw lays hundreds
      // of them, and an object for each one was most of the garbage of a scene at rest.
      const ground: AffineTarget = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };
      const offset = { x: 0, y: 0 };
      const drawLayer = (layer: ShadowLayer, area: WorldRect, map: RenderTexture, light: ShadowProjection | null) => {
        if (light && layer.casters) {
          const mapOrigin = { x: area.minX - 0.5, y: area.minY - 0.5 };
          layer.silhouettes.forEach(({ silhouette, lift, sprite }) => {
            getSilhouetteMatrix(light, silhouette.worldFoot, lift, metrics, ground);
            placeSilhouette(sprite, silhouette, ground, mapOrigin, pixelsPerTile);
          });
        }
        app.renderer.render({ container: layer.root, target: layer.scratch, clear: true, clearColor: [0, 0, 0, 0] });
        app.renderer.render({ container: layer.copy, target: map, clear: false });
      };
      const drawTarget = (target: ShadowTarget, light: ShadowProjection | null) => {
        if (light) alphaFilter.alpha = light.alpha;
        profile(DRAW_LABEL[target.kind], () => target.draw(light));
        target.drawnTick = tick;
        target.turning = false;
      };

      /** Gathers the casters of a chunk's maps again; returns the maps, to draw. */
      const gatherMaps = (shadow: ShadowChunk): ShadowTarget[] => {
        const { map } = shadow;
        const area = areaOf(shadow.chunk.rect);
        const { near } = nearbyViews(shadow.chunk);
        shadow.maps = shadow.layers.map((layer) => {
          spareCasters(layer);
          // Casters standing on this level or higher (shadows onto higher ground are not drawn)
          // whose shadow may reach a column of the level.
          layer.silhouettes = near
            .filter(({ entity }) => entity.box.elevation >= layer.level)
            .flatMap((caster) => {
              const lift = caster.entity.box.elevation - layer.level;
              return silhouettesOf(caster)
                .filter((silhouette) => reaches(silhouette, lift, layer.bounds))
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
          return {
            kind: "maps",
            casters: layer.casters,
            draw: (light) => drawLayer(layer, area, map, light),
            drawnTick: tick,
          };
        });
        return shadow.maps;
      };

      /**
       * Pairs the shadows the entities of a chunk cast on each other again: each sprite of the
       * chunk receives the silhouettes of the nearby entities whose shadow could reach it with the
       * sun at its lowest. The chunk keeps its old atlas until the next step builds the new one.
       */
      const gatherPairs = (shadow: ShadowChunk) => {
        const { own, near } = nearbyViews(shadow.chunk);
        const receiving = new Set(own);
        shadow.pairs = pairShadows(
          near.map((view) => ({ view, elevation: view.entity.box.elevation, silhouettes: silhouettesOf(view) })),
          ({ view }) => receiving.has(view),
          (height, lift) => getShadowReach(height, lift, metrics) + RECEIVER_SPAN,
        );
      };

      /**
       * Trades a chunk's atlas of received shadows for one of the pairs gathered last. Returns it,
       * to draw (none when nothing shades its entities).
       */
      const gatherReceived = (shadow: ShadowChunk): ShadowTarget[] => {
        if (shadow.received) {
          shadow.received.shadows.destroy();
          scene.remove(shadow.received.views);
          shadow.received = undefined;
        }
        // Paired on the step before: touching a chunk starts it over from its maps.
        const receivers = shadow.pairs as readonly ShadowReceiver[];
        shadow.pairs = undefined;
        if (receivers.length === 0) return [];
        const shadows = createReceivedShadows(receivers, app.renderer, [blurFilter, alphaFilter], textures);
        const views = shadows.views.map((view) => ({ ...view, layer: SCENE_LAYER.onObject }));
        scene.add(views);
        const target: ShadowTarget = {
          kind: "received",
          casters: shadows.casters,
          draw: (light) =>
            shadows.draw(
              light &&
                ((caster, receiver, lift) => getCastShadowOffset(light, caster, receiver, lift, metrics, offset)),
            ),
          drawnTick: tick,
        };
        shadow.received = { shadows, views, target };
        return [target];
      };

      /** Runs the next gathering step of a chunk; returns what it gathered, to draw. */
      const gather = (shadow: ShadowChunk): ShadowTarget[] =>
        profile(GATHER_LABEL[shadow.gathering as ShadowGathering], () => gatherStep(shadow));
      const gatherStep = (shadow: ShadowChunk): ShadowTarget[] => {
        if (shadow.gathering === "maps") {
          shadow.gathering = "pairs";
          return gatherMaps(shadow);
        }
        if (shadow.gathering === "pairs") {
          shadow.gathering = "received";
          gatherPairs(shadow);
          return [];
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

      /**
       * A mask of the columns of `area`, a texel per column scaled up to the map's squares: opaque
       * where `holds` says (fully transparent elsewhere), to erase with.
       */
      const columnMask = (area: WorldRect, holds: (level: number | undefined) => boolean) => {
        const width = area.maxX - area.minX + 1;
        const height = area.maxY - area.minY + 1;
        const alpha = new Uint8ClampedArray(width * height * 4);
        for (let y = area.minY; y <= area.maxY; y += 1) {
          for (let x = area.minX; x <= area.maxX; x += 1) {
            if (holds(columnAt.get(x, y)?.elevation)) alpha[((y - area.minY) * width + x - area.minX) * 4 + 3] = 255;
          }
        }
        const texture = new Texture({
          source: new BufferImageSource({ resource: alpha, width, height, scaleMode: "nearest" }),
        });
        const sprite = new Sprite(texture);
        sprite.blendMode = "erase";
        sprite.scale.set(pixelsPerTile);
        return sprite;
      };

      const showChunk = (chunk: WorldChunk) => {
        // The shadow map: one render texture for the chunk, a square of `SHADOW_MAP_PIXELS_PER_TILE`
        // texels per column of its area, texel (0, 0) at its corner. Each column's square shows
        // the shadows of its own elevation (one level of the map per top elevation of the chunk).
        const area = areaOf(chunk.rect);
        const columnsWide = area.maxX - area.minX + 1;
        const columnsDeep = area.maxY - area.minY + 1;
        const map = RenderTexture.create({ width: columnsWide * pixelsPerTile, height: columnsDeep * pixelsPerTile });
        // A square samples its edge texels linearly, half with the next square's: inset half a
        // texel on the sides whose neighbour has another top, whose square holds another level.
        const inset = (x: number, y: number, elevation: number) =>
          columnAt.get(x, y)?.elevation === elevation ? 0 : 0.5;
        const views: SceneView[] = projectBoxesToIsometric(chunk.columns, projection).map((top) => {
          const { x, y, box } = top;
          const left = inset(x - 1, y, box.elevation);
          const up = inset(x, y - 1, box.elevation);
          const frame = new Texture({
            source: map.source,
            frame: new Rectangle(
              (x - area.minX) * pixelsPerTile + left,
              (y - area.minY) * pixelsPerTile + up,
              pixelsPerTile - left - inset(x + 1, y, box.elevation),
              pixelsPerTile - up - inset(x, y + 1, box.elevation),
            ),
          });
          const tileTop = { x: top.screenX, y: top.screenY + topInsetAt(x, y) * metrics.boxHeight };
          return {
            ...createGroundShadowView(frame, tileTop, metrics, getBlockDepth(top, metrics), groundSprites),
            layer: SCENE_LAYER.ground,
          };
        });

        // Ambient occlusion: computed once per chunk (the terrain is static), every column at its own top.
        const occlusion = new Texture({
          source: new BufferImageSource({
            resource: buildOcclusionMap(occlusionTerrain(area), AO_PIXELS_PER_TILE),
            width: columnsWide * AO_PIXELS_PER_TILE,
            height: columnsDeep * AO_PIXELS_PER_TILE,
          }),
        });
        const bounds = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
        chunk.columns.forEach(({ x, y, elevation }) => {
          const rect = bounds.get(elevation);
          if (!rect) bounds.set(elevation, { minX: x, minY: y, maxX: x, maxY: y });
          else {
            rect.minX = Math.min(rect.minX, x);
            rect.minY = Math.min(rect.minY, y);
            rect.maxX = Math.max(rect.maxX, x);
            rect.maxY = Math.max(rect.maxY, y);
          }
        });
        // The masks cover the margin too (the neighbours' columns, at their own level): the edge
        // texels of a square blend with the next square's, so the map has no seam at chunk edges.
        const scratch = scratchFor(map);
        const layers: ShadowLayer[] = [...bounds].map(([level, rect]) => {
          const occlusionSprite = new Sprite(occlusion);
          occlusionSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
          const others = columnMask(area, (other) => other !== level);
          const own = columnMask(area, (other) => other === level);
          const root = new Container();
          root.addChild(occlusionSprite, others);
          const copy = new Container();
          copy.addChild(own, new Sprite(scratch));
          return { level, bounds: rect, root, copy, scratch, masks: [own.texture, others.texture], silhouettes: [] };
        });

        const shadow: ShadowChunk = { chunk, map, layers, maps: [], gathering: "maps", gathered: false };
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
              // The masks' textures are the layer's own; the occlusion and the scratch are shared.
              layer.masks.forEach((mask) => mask.destroy(true));
              layer.root.destroy({ children: true });
              layer.copy.destroy({ children: true });
            });
            occlusion.destroy(true);
            // Its views' textures go with the map's source.
            map.destroy(true);
          },
        };
      };

      const update = (now: number) => {
        tick = now;
        sun = getShadowProjection(getSunState(now));
        const isDay = sun !== null;
        const shadows = [...chunks.values()];
        // When built, every step of every chunk; then a few steps per frame, the chunks never
        // gathered first.
        const stale = shadows
          .filter(({ gathering }) => gathering !== undefined)
          .sort((a, b) => Number(a.gathered) - Number(b.gathered));
        const building = daytime === undefined;
        const fresh = building
          ? stale.flatMap((shadow) => [...gather(shadow), ...gather(shadow), ...gather(shadow)])
          : stale.slice(0, SHADOW_GATHERS_PER_FRAME).flatMap(gather);
        // When built: every map and atlas (casters only by day); otherwise those of the chunks that
        // just gathered their casters.
        const turned = isDay !== daytime;
        daytime = isDay;
        const targets = shadows.flatMap(targetsOf);
        (building ? targets : fresh).forEach((target) => {
          if (target.casters) target.casters.visible = isDay;
          drawTarget(target, sun);
        });
        // At sunrise and at sunset, every map and atlas again (casters only by day), a few per frame.
        if (turned && !building) {
          targets.forEach((target) => {
            if (target.casters) target.casters.visible = isDay;
            target.turning = true;
          });
        }
        let turning = 0;
        for (const target of targets) {
          if (turning === SHADOW_TURN_DRAWS_PER_FRAME) break;
          if (!target.turning) continue;
          drawTarget(target, sun);
          turning += 1;
        }
        if (turning > 0 || !sun) return;

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
          scratches.forEach((scratch) => scratch.destroy(true));
        },
      };
    },
  };
}
