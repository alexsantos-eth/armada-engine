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
  AO_TERRAIN_SHADOW_REACH,
  buildOcclusionMap,
  easeShadowProjection,
  getCastShadowOffset,
  getShadowProjection,
  getShadowReach,
  getSilhouetteMatrix,
  SHADOW_REFRESH_TICKS,
} from "../lighting";
import { projectBoxesToIsometric } from "../projection";
import { createSpritePool, getBlockDepth } from "../render";
import {
  type BuiltScene,
  type EntityView,
  SCENE_LAYER,
  type SceneModule,
  type SceneMovingCaster,
  type SceneView,
} from "../scene";
import { CLOCK_PART, getSunState } from "../time";
import type { WorldChunk } from "../world";
import type { AffineTarget, ChunkKey, OcclusionTerrain, ShadowProjection, WorldRect } from "../../types";
import { pairShadows } from "./pairs";
import {
  createReceivedShadowRig,
  createReceivedShadows,
  type ReceivedShadows,
  type ShadowReceiver,
} from "./received-shadow";
import { createMovingShadow } from "./moving-shadow";
import { createTexturePool } from "./texture-pool";
import {
  createCasterSprites,
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

/** Daylight map refreshes per frame: spread render-target work across frames. */
export const SHADOW_REFRESH_DRAWS_PER_FRAME = 1;

/** The gathering step a chunk is waiting for: see {@link SHADOW_GATHERS_PER_FRAME}. */
export type ShadowGathering = "maps" | "pairs" | "received";

/** What a shadow target draws: a chunk's map (`"maps"`) or the atlas of its received shadows (`"received"`). */
type ShadowTargetKind = Exclude<ShadowGathering, "pairs">;

/**
 * One level of a chunk's shadow map, as data: the level is drawn whole into the module's scratch
 * texture (the chunk's ambient occlusion, then the casters, then the other levels' columns
 * erased), then copied into the chunk's map over its own columns only, so one map holds every
 * level (#53). Every level of every chunk is drawn with the same sprites, one draw after another.
 */
type ShadowLayer = {
  readonly level: number;
  /**
   * The chunk's columns of this level, as a rectangle: only their squares of the map show, so a
   * caster whose shadow cannot reach it is left out of the map.
   */
  readonly bounds: WorldRect;
  /** Mask of its own columns: erased in the map before the copy. */
  readonly own: Texture;
  /** Mask of the other levels' columns: erased in the scratch texture. */
  readonly others: Texture;
  /** Silhouettes of the entities on this level or higher that may reach the map. */
  casters: readonly Silhouette[];
  /** Blocks each of `casters` stands above the level. */
  lifts: readonly number[];
};

/** A texture levels are drawn whole into, shared by the maps of its size. */
type Scratch = {
  readonly texture: RenderTexture;
  /** The whole texture, the casters' filter area: known up front, so Pixi never measures them. */
  readonly area: Rectangle;
};

/** Something drawn from the sun into a texture: a shadow map, or the shadows entities receive. */
type ShadowTarget = {
  /** What it is, for the profiled scene: a shadow map (`maps`) or an atlas (`received`). */
  readonly kind: ShadowTargetKind;
  /** Whether anything casts on it: only then do the sun's moves change it. */
  readonly casts: boolean;
  /** Draws it, with the casters laid by `sun` (none at night). */
  readonly draw: (sun: ShadowProjection | null) => void;
  /** Tick it was last drawn for. */
  drawnTick: number;
  /** Eased projection actually baked into this target. */
  drawnLight?: ShadowProjection | null;
  /** Whether it waits to be drawn for the sunrise or the sunset ({@link SHADOW_TURN_DRAWS_PER_FRAME}). */
  turning?: boolean;
};

/** An entity overlay that follows the terrain's directional occlusion with a short fade. */
type TerrainShadowReceiver = {
  readonly silhouette: Silhouette;
  readonly view: SceneView;
};

/** Narrow vertical slices approximate a soft fade into the lit part without a filter pass. */
const TERRAIN_SHADOW_BANDS = 16;

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
  /** Where its levels are drawn whole, before each is copied into the map. */
  readonly scratch: Scratch;
  /** Its ambient occlusion, at the bottom of every level. */
  readonly occlusion: Texture;
  readonly occlusionSource: BufferImageSource;
  readonly occlusionContacts: readonly { readonly x: number; readonly y: number }[];
  readonly area: WorldRect;
  readonly terrainShadow: Uint8Array;
  readonly terrainReceivers: readonly TerrainShadowReceiver[];
  occlusionProjectionKey?: string;
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
 * (only those squares of it show), and each entity view's silhouettes are made once. Every map is
 * drawn with the same sprites (`createCasterSprites()`), and every atlas with those of its rig
 * (`createReceivedShadowRig()`), one draw after another: the module keeps the sprites of its
 * largest draw, not one per caster of every shown chunk (#97). The caster textures of the received
 * shadows are pooled (`createTexturePool()`), never destroyed one by one. The casters come from
 * the `entityViews` service: without it, the maps hold the occlusion only.
 */
export function createShadows(): SceneModule {
  return {
    id: "shadows",
    setup({ app, world, columnAt, topInsetAt, projection, metrics, services, profile }) {
      const pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE;
      // Where each level is drawn whole before its columns are copied into its chunk's map: one per
      // size of map (all chunks but those cut by the edge of a bounded world share one), shared by
      // the chunks, since the draws run one after the other.
      const scratches = new Map<string, Scratch>();
      const scratchFor = ({ width, height }: RenderTexture) => {
        const size = `${width}×${height}`;
        const existing = scratches.get(size);
        if (existing) return existing;
        const made = { texture: RenderTexture.create({ width, height }), area: new Rectangle(0, 0, width, height) };
        scratches.set(size, made);
        return made;
      };
      // Silhouettes are drawn into shadow textures, never into the scene: blurred for soft edges,
      // with the sun's opacity applied to each group as a whole so overlaps do not darken twice.
      const blurFilter = new BlurFilter({ strength: SHADOW_BLUR, quality: 2 });
      const alphaFilter = new AlphaFilter({ alpha: 1 });
      // What every level of every map is drawn with, one after another: into the scratch, the
      // chunk's occlusion, the casters and the eraser of the other levels' columns; then, into the
      // map, the eraser of the level's own columns and the scratch over them.
      const casters = createCasterSprites([blurFilter, alphaFilter]);
      const occlusionSprite = new Sprite();
      occlusionSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
      const eraser = () => {
        const sprite = new Sprite();
        sprite.blendMode = "erase";
        sprite.scale.set(pixelsPerTile);
        return sprite;
      };
      const othersEraser = eraser();
      const ownEraser = eraser();
      const scratchSprite = new Sprite();
      const levelRoot = new Container();
      levelRoot.addChild(occlusionSprite, casters.container, othersEraser);
      const copyRoot = new Container();
      copyRoot.addChild(ownEraser, scratchSprite);
      // The atlases of received shadows have their own, with the same filters.
      const receivedRig = createReceivedShadowRig(app.renderer, [blurFilter, alphaFilter]);
      // Caster textures of the received shadows, reused from draw to draw.
      const textures = createTexturePool();
      // Slices are shared by every receiver that uses the same sprite frame, avoiding per-entity textures.
      const terrainReceiverTextures = new Map<Texture, readonly Texture[]>();
      const terrainReceiverTexturesOf = (body: Texture) => {
        const cached = terrainReceiverTextures.get(body);
        if (cached) return cached;
        const made = Array.from({ length: TERRAIN_SHADOW_BANDS }, (_, index) => {
          const start = Math.round(body.frame.height * (1 - (index + 1) / TERRAIN_SHADOW_BANDS));
          const end = Math.round(body.frame.height * (1 - index / TERRAIN_SHADOW_BANDS));
          return new Texture({
            source: body.source,
            frame: new Rectangle(body.frame.x, body.frame.y + start, body.frame.width, Math.max(1, end - start)),
          });
        });
        terrainReceiverTextures.set(body, made);
        return made;
      };
      // Sprites of the ground shadows, a chunk's given back when it is hidden for the next one.
      const groundSprites = createSpritePool();
      const chunks = new Map<ChunkKey, ShadowChunk>();
      // The shadows of what moves (the player), each in a small map of its own that follows it (#58).
      const moving = (services.get("movingCasters") ?? []).map((caster) =>
        createMovingShadow(caster, {
          renderer: app.renderer,
          filters: [blurFilter, alphaFilter],
          elevationAt: (x, y) => columnAt.get(x, y)?.elevation,
          topInsetAt,
          projection,
          metrics,
        }),
      );
      const movingViews = moving.flatMap(({ views }) => views);
      const updateMoving = () => {
        if (sun) alphaFilter.alpha = sun.alpha;
        moving.forEach((shadow) => shadow.update(scene, sun, tick));
      };
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
      const movingTerrainAlphas = new WeakMap<SceneMovingCaster, number>();
      const terrainShadowAt = (shadow: ShadowChunk, worldX: number, worldY: number) => {
        const width = (shadow.area.maxX - shadow.area.minX + 1) * AO_PIXELS_PER_TILE;
        const height = (shadow.area.maxY - shadow.area.minY + 1) * AO_PIXELS_PER_TILE;
        const sampleX = Math.min(
          Math.max((worldX - shadow.area.minX + 0.5) * AO_PIXELS_PER_TILE - 0.5, 0),
          width - 1,
        );
        const sampleY = Math.min(
          Math.max((worldY - shadow.area.minY + 0.5) * AO_PIXELS_PER_TILE - 0.5, 0),
          height - 1,
        );
        const left = Math.floor(sampleX);
        const top = Math.floor(sampleY);
        const right = Math.min(left + 1, width - 1);
        const bottom = Math.min(top + 1, height - 1);
        const mixX = sampleX - left;
        const mixY = sampleY - top;
        const topAlpha =
          shadow.terrainShadow[top * width + left] * (1 - mixX) +
          shadow.terrainShadow[top * width + right] * mixX;
        const bottomAlpha =
          shadow.terrainShadow[bottom * width + left] * (1 - mixX) +
          shadow.terrainShadow[bottom * width + right] * mixX;
        return (topAlpha * (1 - mixY) + bottomAlpha * mixY) / 255;
      };
      const drawLayer = (shadow: ShadowChunk, layer: ShadowLayer, area: WorldRect, light: ShadowProjection | null) => {
        // The entity receiver uses this mask at only 8 texels per tile. Rebuilding it for every
        // minute solar movement was needless CPU work; quantize below that spatial resolution.
        const projectionKey = light
          ? `${Math.round(light.dirX * 64)},${Math.round(light.dirY * 64)},${Math.round(light.stretch * 16)},${Math.round(light.alpha * 64)}`
          : "night";
        if (shadow.occlusionProjectionKey !== projectionKey) {
          shadow.occlusionSource.resource = buildOcclusionMap(
            occlusionTerrain(area),
            AO_PIXELS_PER_TILE,
            shadow.occlusionContacts,
            light,
            shadow.terrainShadow,
          );
          shadow.occlusionSource.update();
          shadow.occlusionProjectionKey = projectionKey;
        }
        const shown = light ? layer.casters.length : 0;
        if (light) {
          const mapOrigin = { x: area.minX - 0.5, y: area.minY - 0.5 };
          for (let index = 0; index < shown; index += 1) {
            const silhouette = layer.casters[index];
            getSilhouetteMatrix(light, silhouette.worldFoot, layer.lifts[index], metrics, ground);
            placeSilhouette(casters.sprite(index, silhouette.texture), silhouette, ground, mapOrigin, pixelsPerTile);
          }
        }
        casters.show(shown);
        casters.container.filterArea = shadow.scratch.area;
        occlusionSprite.texture = shadow.occlusion;
        othersEraser.texture = layer.others;
        ownEraser.texture = layer.own;
        scratchSprite.texture = shadow.scratch.texture;
        app.renderer.render({
          container: levelRoot,
          target: shadow.scratch.texture,
          clear: true,
          clearColor: [0, 0, 0, 0],
        });
        app.renderer.render({ container: copyRoot, target: shadow.map, clear: false });
      };

      const updateTerrainReceiverShadows = () => {
        for (const shadow of chunks.values()) {
          for (const { silhouette, view } of shadow.terrainReceivers) {
            const target = sun ? terrainShadowAt(shadow, silhouette.worldFoot.x, silhouette.worldFoot.y) : 0;
            const current = view.view.alpha;
            const alpha = current + (target - current) * 0.16;
            const next = Math.abs(alpha - target) < 0.005 ? target : alpha;
            if (Math.abs(next - current) > 0.001) view.view.alpha = next;
            const visible = next > 0.005;
            if (view.view.visible !== visible) view.view.visible = visible;
          }
        }
      };
      const updateMovingReceiverShadows = () => {
        const receivers = services.get("movingCasters") ?? [];
        receivers.forEach((receiver) => {
          if (!receiver.receiveTerrainShadow) return;
          const { ground } = receiver.foot();
          const tileX = Math.round(ground.x);
          const tileY = Math.round(ground.y);
          let shadow: ShadowChunk | undefined;
          for (const candidate of chunks.values()) {
            const { rect } = candidate.chunk;
            if (tileX < rect.minX || tileX > rect.maxX || tileY < rect.minY || tileY > rect.maxY) continue;
            shadow = candidate;
            break;
          }
          const target = sun && shadow ? terrainShadowAt(shadow, ground.x, ground.y) : 0;
          const current = movingTerrainAlphas.get(receiver) ?? 0;
          const alpha = current + (target - current) * 0.16;
          const next = Math.abs(alpha - target) < 0.005 ? target : alpha;
          movingTerrainAlphas.set(receiver, next);
          if (Math.abs(next - current) > 0.001) receiver.receiveTerrainShadow(next);
        });
      };
      const drawTarget = (target: ShadowTarget, light: ShadowProjection | null) => {
        const eased = easeShadowProjection(target.drawnLight, light);
        if (eased) alphaFilter.alpha = eased.alpha;
        profile(DRAW_LABEL[target.kind], () => target.draw(eased));
        target.drawnLight = eased;
        target.drawnTick = tick;
        target.turning = false;
      };

      /** Gathers the casters of a chunk's maps again; returns the maps, to draw. */
      const gatherMaps = (shadow: ShadowChunk): ShadowTarget[] => {
        const area = areaOf(shadow.chunk.rect);
        const { near } = nearbyViews(shadow.chunk);
        let maxTerrainHeight = -Infinity;
        for (let y = area.minY - AO_TERRAIN_SHADOW_REACH; y <= area.maxY + AO_TERRAIN_SHADOW_REACH; y += 1) {
          for (let x = area.minX - AO_TERRAIN_SHADOW_REACH; x <= area.maxX + AO_TERRAIN_SHADOW_REACH; x += 1) {
            const column = columnAt.get(x, y);
            if (column) maxTerrainHeight = Math.max(maxTerrainHeight, column.elevation - topInsetAt(x, y));
          }
        }
        shadow.maps = shadow.layers.map((layer) => {
          // Casters standing on this level or higher (shadows onto higher ground are not drawn)
          // whose shadow may reach a column of the level.
          const reaching: Silhouette[] = [];
          const lifts: number[] = [];
          near.forEach((caster) => {
            const lift = caster.entity.box.elevation - layer.level;
            if (lift < 0) return;
            silhouettesOf(caster).forEach((silhouette) => {
              if (!reaches(silhouette, lift, layer.bounds)) return;
              reaching.push(silhouette);
              lifts.push(lift);
            });
          });
          layer.casters = reaching;
          layer.lifts = lifts;
          return {
            kind: "maps",
            casts: reaching.length > 0 || maxTerrainHeight >= layer.level + 1,
            draw: (light) => drawLayer(shadow, layer, area, light),
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
        const shadows = createReceivedShadows(receivers, receivedRig, textures);
        const views = shadows.views.map((view) => ({ ...view, layer: SCENE_LAYER.onObject }));
        scene.add(views);
        const target: ShadowTarget = {
          kind: "received",
          casts: true,
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
       * A mask of the columns of `area`, a texel per column (scaled up to the map's squares when
       * drawn): opaque where `holds` says (fully transparent elsewhere), to erase with.
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
        return new Texture({ source: new BufferImageSource({ resource: alpha, width, height, scaleMode: "nearest" }) });
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
            ...createGroundShadowView(
              frame,
              tileTop,
              metrics,
              getBlockDepth(top, metrics),
              groundSprites,
            ),
            layer: SCENE_LAYER.ground,
          };
        });
        const entityViews = services.get("entityViews")?.get(chunk.key) ?? [];
        const terrainReceivers: TerrainShadowReceiver[] = entityViews.flatMap((entityView) =>
          silhouettesOf(entityView).map((silhouette) => {
            const { body, bodyDisplay } = silhouette;
            const height = Math.min(metrics.boxHeight, bodyDisplay.height);
            const bandHeight = height / TERRAIN_SHADOW_BANDS;
            const container = new Container();
            container.alpha = 0;
            container.visible = false;
            const bands = terrainReceiverTexturesOf(body).map((texture, index) => {
              const sprite = new Sprite(texture);
              sprite.position.set(
                bodyDisplay.left,
                bodyDisplay.top + bodyDisplay.height - (index + 1) * bandHeight,
              );
              sprite.setSize(bodyDisplay.width, bandHeight);
              sprite.tint = 0x000000;
              sprite.alpha = (1 - (index + 0.5) / TERRAIN_SHADOW_BANDS) ** 2;
              return sprite;
            });
            container.addChild(...bands);
            return {
              silhouette,
              view: { view: container, depth: silhouette.depth, layer: SCENE_LAYER.onObject },
            };
          }),
        );

        // Ambient occlusion: computed once per chunk (the terrain is static), every column at its own top.
        const occlusionContacts = chunk.entities.flatMap(({ x, y, length, lengthAxis, contactShadow }) => {
          if (contactShadow === false) return [];
          const alongY = Number(lengthAxis === "y");
          return Array.from({ length }, (_, index) => ({
            x: x + index * (1 - alongY),
            y: y + index * alongY,
          }));
        });
        const terrainShadow = new Uint8Array(columnsWide * columnsDeep * AO_PIXELS_PER_TILE * AO_PIXELS_PER_TILE);
        const occlusionSource = new BufferImageSource({
          resource: buildOcclusionMap(occlusionTerrain(area), AO_PIXELS_PER_TILE, occlusionContacts, null, terrainShadow),
          width: columnsWide * AO_PIXELS_PER_TILE,
          height: columnsDeep * AO_PIXELS_PER_TILE,
        });
        const occlusion = new Texture({ source: occlusionSource });
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
        const layers: ShadowLayer[] = [...bounds].map(([level, rect]) => ({
          level,
          bounds: rect,
          own: columnMask(area, (other) => other === level),
          others: columnMask(area, (other) => other !== level),
          casters: [],
          lifts: [],
        }));

        const shadow: ShadowChunk = {
          chunk,
          map,
          scratch: scratchFor(map),
          occlusion,
          occlusionSource,
          occlusionContacts,
          area,
          terrainShadow,
          terrainReceivers,
          layers,
          maps: [],
          gathering: "maps",
          gathered: false,
        };
        chunks.set(chunk.key, shadow);
        touch(chunk);
        return {
          views: [...views, ...terrainReceivers.map(({ view }) => view)],
          keepsViews: true,
          destroy: () => {
            groundSprites.give(views.map(({ view }) => view));
            terrainReceivers.forEach(({ view }) => {
              view.view.destroy({ children: true, texture: false, textureSource: false });
            });
            chunks.delete(chunk.key);
            touch(chunk);
            if (shadow.received) {
              shadow.received.shadows.destroy();
              scene.remove(shadow.received.views);
            }
            layers.forEach(({ own, others }) => {
              own.destroy(true);
              others.destroy(true);
            });
            occlusion.destroy(true);
            // Its views' textures go with the map's source.
            map.destroy(true);
          },
        };
      };

      // The shadows on the parts of sprites that lean (a canopy in the wind) lean with them.
      const follow = () => {
        for (const { received } of chunks.values()) received?.shadows.follow();
      };

      const update = (now: number) => {
        tick = now;
        sun = getShadowProjection(getSunState(now));
        updateTerrainReceiverShadows();
        updateMovingReceiverShadows();
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
        (building ? targets : fresh).forEach((target) => drawTarget(target, sun));
        // At sunrise and at sunset, every map and atlas again (casters only by day), a few per frame.
        if (turned && !building) {
          targets.forEach((target) => {
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

        // Spread map redraws over frames, prioritizing terrain maps that carry the directional
        // occlusion. Two targets per frame shorten the solar update cycle without a full redraw.
        for (let drawn = 0; drawn < SHADOW_REFRESH_DRAWS_PER_FRAME; drawn += 1) {
          let stalest: ShadowTarget | undefined;
          let stalestAge = SHADOW_REFRESH_TICKS - 1;
          targets.forEach((target) => {
            const age = Math.abs(now - target.drawnTick);
            const preferred =
              stalest === undefined ||
              (target.kind === "maps" && stalest.kind !== "maps") ||
              (target.kind === stalest.kind && age > stalestAge);
            if (target.casts && age > SHADOW_REFRESH_TICKS - 1 && preferred) {
              stalest = target;
              stalestAge = age;
            }
          });
          if (!stalest) break;
          drawTarget(stalest, sun);
        }
      };

      return {
        views: movingViews,
        showChunk,
        start: (built) => {
          scene = built;
          // They follow what casts them, which the camera keeps in view.
          movingViews.forEach(({ view }) => {
            view.cullable = false;
          });
          update(world.parts.get(CLOCK_PART).tick);
          updateMoving();
        },
        update: ({ tick: now }) => {
          update(now);
          profile("shadows:follow", follow);
          profile("shadows:moving", updateMoving);
        },
        destroy: () => {
          moving.forEach((shadow) => shadow.destroy());
          // The caster sprites with their containers and filters; their textures are the entities' and the chunks'.
          levelRoot.destroy({ children: true });
          copyRoot.destroy({ children: true });
          receivedRig.destroy();
          terrainReceiverTextures.forEach((receiverTextures) => receiverTextures.forEach((texture) => texture.destroy(false)));
          terrainReceiverTextures.clear();
          blurFilter.destroy();
          alphaFilter.destroy();
          groundSprites.destroy();
          scratches.forEach(({ texture }) => texture.destroy(true));
        },
      };
    },
  };
}
