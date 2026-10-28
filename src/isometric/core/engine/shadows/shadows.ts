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
  AO_TERRAIN_SHADOW_ALPHA,
  SHADOW_ALPHA,
  createTerrainShadowSampler,
  getReceiverPoint,
  getTerrainFaces,
  type TerrainShadowSampler,
  type ShadowPoint,
  buildOcclusionMap,
  getCastShadowOffset,
  getShadowReach,
  getSilhouetteMatrix,
  createPhaseLighting,
  type PhaseLighting,
} from "../lighting";
import { DEFAULT_MIN_ELEVATION } from "../terrain";
import { createTerrainFaceShadows, type TerrainFaceShadows } from "./terrain-faces";
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
  cropSilhouetteAbove,
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
/** Receiver planes baked per frame while a phase changes; completed chunks publish atomically. */
export const SHADOW_PLANES_PER_FRAME = 8;

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
  readonly hasGround: boolean;
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
  /** Bakes this target with the single authored daylight projection. */
  readonly draw: (sun: ShadowProjection) => void;
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
  /** Where its levels are drawn whole, before each is copied into the map. */
  readonly scratch: Scratch;
  /** Its ambient occlusion, at the bottom of every level. */
  readonly occlusion: Texture;
  readonly area: WorldRect;
  readonly terrainShadow: Uint8Array;
  readonly directional: Texture;
  readonly directionalSource: BufferImageSource;
  readonly directionalPixels: Uint8ClampedArray;
  readonly sampleTerrain: TerrainShadowSampler;
  readonly faces: TerrainFaceShadows;
  drawnLight: ShadowProjection;
  drawnKey: string;
  bakeTarget?: RenderTexture;
  readonly gradeViews: readonly SceneView[];
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

/**
 * Tiles beyond a caster's shadow reach that a receiver may still stand and be shaded: the
 * shadow and the receiver are as wide as a tile.
 */
const RECEIVER_SPAN = 1;

/**
 * Bakes static daylight shadows when chunk dependencies change. Maps and received atlases share
 * one projection; explicit phase transitions grade existing views without redrawing textures.
 * Moving casters retain a small map of their own, invalidated only by position or pose changes.
 */
export function createShadows(lighting: PhaseLighting = createPhaseLighting()): SceneModule {
  return {
    id: "shadows",
    setup({ app, columnAt, topInsetAt, projection, metrics, services, profile }) {
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
          strength: () => lighting.current.shadowStrength,
        }),
      );
      const movingViews = moving.flatMap(({ views }) => views);
      const updateMoving = () => {
        alphaFilter.alpha = sun.alpha;
        moving.forEach((shadow) => shadow.update(scene, sun));
      };
      // Set by `start()`, before any chunk gathers its casters.
      let scene!: BuiltScene;
      let sun = lighting.current.shadow;
      let building = true;
      let appliedStrength = lighting.current.shadowStrength;
      const phaseMaps = new Map<string, RenderTexture>();
      const phaseClear = new Container();
      let phaseBake: { shadow: ShadowChunk; light: ShadowProjection; map: RenderTexture; next: number } | undefined;
      const cancelPhaseBake = () => {
        if (!phaseBake) return;
        phaseBake.shadow.bakeTarget = undefined;
        phaseBake.shadow.faces.cancel();
        phaseBake = undefined;
      };

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
      const receiverFeet = new WeakMap<Silhouette, ShadowPoint>();
      const silhouettesByView = new WeakMap<EntityView, readonly Silhouette[]>();
      const silhouettesOf = (view: EntityView) => {
        const cached = silhouettesByView.get(view);
        if (cached) return cached;
        const { entity, views } = view;
        const made = createSilhouettes(views, entity, metrics, entity.box.length, entity.box.lengthAxis ?? "x");
        made.forEach((shape) => receiverFeet.set(shape, { ...shape.worldFoot, elevation: entity.box.elevation }));
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
      const movingTerrainBands = new WeakMap<SceneMovingCaster, Float32Array>();
      const lightKey = (light: ShadowProjection) =>
        `${Math.round(Math.atan2(light.dirY, light.dirX) * 40)},${Math.round(light.stretch * 24)},${Math.round(light.alpha * 255)}`;
      const directionalSprite = new Sprite();
      casters.container.addChild(directionalSprite);
      const bakeTerrain = (shadow: ShadowChunk, light: ShadowProjection) => {
        buildOcclusionMap(occlusionTerrain(shadow.area), AO_PIXELS_PER_TILE, [], light, shadow.terrainShadow);
        const pixels = shadow.directionalPixels;
        const maximum = Math.max(Number.EPSILON, (AO_TERRAIN_SHADOW_ALPHA * light.alpha) / SHADOW_ALPHA);
        for (let i = 0; i < shadow.terrainShadow.length; i += 1)
          pixels[i * 4 + 3] = Math.round(shadow.terrainShadow[i] / maximum);
        shadow.directionalSource.resource = pixels;
        shadow.directionalSource.update();
      };
      const receiverPoint = { x: 0, y: 0, elevation: 0 };
      const terrainOnReceiver = (shadow: ShadowChunk, light: ShadowProjection, own: Silhouette, x: number, y: number) =>
        shadow.sampleTerrain(
          getReceiverPoint(receiverFeet.get(own)!, own.screenFoot, x, y, light, metrics, receiverPoint),
          light,
        );
      const drawLayer = (shadow: ShadowChunk, layer: ShadowLayer, area: WorldRect, light: ShadowProjection) => {
        const shown = layer.casters.length;
        const mapOrigin = { x: area.minX - 0.5, y: area.minY - 0.5 };
        for (let index = 0; index < shown; index += 1) {
          const silhouette = layer.casters[index];
          getSilhouetteMatrix(light, silhouette.worldFoot, layer.lifts[index], metrics, ground);
          placeSilhouette(casters.sprite(index, silhouette.texture), silhouette, ground, mapOrigin, pixelsPerTile);
        }
        casters.show(shown);
        directionalSprite.visible = false;
        casters.container.filterArea = shadow.scratch.area;
        alphaFilter.alpha = 1;
        app.renderer.render({
          container: casters.container,
          target: shadow.scratch.texture,
          clear: true,
          clearColor: [0, 0, 0, 0],
        });
        alphaFilter.alpha = light.alpha;
        shadow.faces.draw(layer.level, light);
        if (!layer.hasGround) return;
        directionalSprite.visible = true;
        directionalSprite.texture = shadow.directional;
        directionalSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
        casters.show(shown);
        casters.container.visible = true;
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
        app.renderer.render({ container: copyRoot, target: shadow.bakeTarget ?? shadow.map, clear: false });
      };

      const updateMovingReceiverShadows = () => {
        const receivers = services.get("movingCasters") ?? [];
        receivers.forEach((receiver) => {
          if (!receiver.receiveTerrainShadow && !receiver.receiveTerrainShadowBands) return;
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
          if (receiver.receiveTerrainShadowBands && receiver.view instanceof Sprite) {
            const samples = movingTerrainBands.get(receiver) ?? new Float32Array(16);
            movingTerrainBands.set(receiver, samples);
            const { view } = receiver;
            const { screen } = receiver.foot();
            const left = view.x - view.anchor.x * view.width;
            const top = view.y - view.anchor.y * view.height;
            for (let band = 0; band < samples.length; band += 1) {
              const point = getReceiverPoint(
                ground,
                screen,
                left + view.width / 2,
                top + view.height * (1 - (band + 0.5) / samples.length),
                sun,
                metrics,
                receiverPoint,
              );
              const target = shadow
                ? shadow.sampleTerrain(point, shadow.drawnLight) *
                  shadow.drawnLight.alpha *
                  lighting.current.shadowStrength
                : 0;
              samples[band] += (target - samples[band]) * 0.16;
            }
            receiver.receiveTerrainShadowBands(samples);
            return;
          }
          const target = shadow
            ? shadow.sampleTerrain(ground, shadow.drawnLight) *
              shadow.drawnLight.alpha *
              lighting.current.shadowStrength
            : 0;
          const current = movingTerrainAlphas.get(receiver) ?? 0;
          const alpha = current + (target - current) * 0.16;
          const next = Math.abs(alpha - target) < 0.005 ? target : alpha;
          movingTerrainAlphas.set(receiver, next);
          if (Math.abs(next - current) > 0.001) receiver.receiveTerrainShadow?.(next);
        });
      };
      const drawTarget = (target: ShadowTarget, light: ShadowProjection) => {
        alphaFilter.alpha = light.alpha;
        profile(DRAW_LABEL[target.kind], () => target.draw(light));
      };

      /** Gathers the casters of a chunk's maps again; returns the maps, to draw. */
      const gatherMaps = (shadow: ShadowChunk): ShadowTarget[] => {
        const area = areaOf(shadow.chunk.rect);
        const { near } = nearbyViews(shadow.chunk);
        shadow.faces.clear();
        shadow.maps = shadow.layers.map((layer) => {
          // Casters standing on this level or higher (shadows onto higher ground are not drawn)
          // whose shadow may reach a column of the level.
          const reaching: Silhouette[] = [];
          const lifts: number[] = [];
          near.forEach((caster) => {
            const lift = caster.entity.box.elevation - layer.level;
            silhouettesOf(caster).forEach((original) => {
              const silhouette = cropSilhouetteAbove(original, -lift * metrics.boxHeight);
              if (!silhouette || !reaches(silhouette, lift, layer.bounds)) return;
              reaching.push(silhouette);
              lifts.push(lift);
            });
          });
          layer.casters = reaching;
          layer.lifts = lifts;
          return {
            kind: "maps",
            draw: (light) => drawLayer(shadow, layer, area, light),
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
        const pairs = pairShadows(
          near.map((view) => ({ view, elevation: view.entity.box.elevation, silhouettes: silhouettesOf(view) })),
          ({ view }) => receiving.has(view),
          (height, lift) => getShadowReach(height, lift, metrics) + RECEIVER_SPAN,
        );
        const paired = new Map(pairs.map((receiver) => [receiver.own, receiver]));
        shadow.pairs = own.flatMap((view) =>
          silhouettesOf(view).map((shape) => paired.get(shape) ?? { own: shape, casters: [] }),
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
        views.forEach(({ view }) => {
          view.alpha = lighting.current.shadowStrength;
        });
        scene.add(views);
        const target: ShadowTarget = {
          kind: "received",
          draw: (light) =>
            shadows.draw(
              (caster, receiver, lift) => getCastShadowOffset(light, caster, receiver, lift, metrics, offset),
              (own, x, y) => terrainOnReceiver(shadow, light, own, x, y),
            ),
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
            const column = columnAt.get(x, y);
            if (holds(column && column.elevation - topInsetAt(x, y)))
              alpha[((y - area.minY) * width + x - area.minX) * 4 + 3] = 255;
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
            ...createGroundShadowView(frame, tileTop, metrics, getBlockDepth(top, metrics), groundSprites),
            layer: SCENE_LAYER.ground,
          };
        });
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
          resource: buildOcclusionMap(
            occlusionTerrain(area),
            AO_PIXELS_PER_TILE,

            occlusionContacts,
            null,
          ),
          width: columnsWide * AO_PIXELS_PER_TILE,
          height: columnsDeep * AO_PIXELS_PER_TILE,
        });
        const occlusion = new Texture({ source: occlusionSource });
        const bounds = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
        chunk.columns.forEach(({ x, y, elevation: raw }) => {
          const elevation = raw - topInsetAt(x, y);
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
        const sampleTerrain = createTerrainShadowSampler(occlusionTerrain(area));
        const faceGeometry = getTerrainFaces(
          chunk.columns.map(({ x, y, elevation }) => ({ x, y, elevation: elevation - topInsetAt(x, y) })),
          (x, y) => occlusionTerrain(area).topHeightAt(x, y),
          DEFAULT_MIN_ELEVATION,
        );
        const faces = createTerrainFaceShadows(faceGeometry, {
          renderer: app.renderer,
          scratch: scratchFor(map).texture,
          filters: [blurFilter, alphaFilter],
          area,
          projection,
          metrics,
          sampleTerrain,
        });
        const levels = [...new Set([...bounds.keys(), ...faces.levels])];
        const layers: ShadowLayer[] = levels.map((level) => ({
          level,
          hasGround: bounds.has(level),
          bounds: bounds.get(level) ?? chunk.rect,
          own: columnMask(area, (other) => other === level),
          others: columnMask(area, (other) => other !== level),
          casters: [],
          lifts: [],
        }));

        [...views, ...faces.views].forEach(({ view }) => {
          view.alpha = lighting.current.shadowStrength;
        });
        const directionalPixels = new Uint8ClampedArray(terrainShadow.length * 4);
        const directionalSource = new BufferImageSource({
          resource: directionalPixels,
          width: columnsWide * AO_PIXELS_PER_TILE,
          height: columnsDeep * AO_PIXELS_PER_TILE,
        });
        const shadow: ShadowChunk = {
          chunk,
          map,
          scratch: scratchFor(map),
          occlusion,
          area,
          terrainShadow,
          directional: new Texture({ source: directionalSource }),
          directionalSource,
          directionalPixels,
          sampleTerrain,
          faces,
          drawnLight: sun,
          drawnKey: lightKey(sun),
          gradeViews: views,
          layers,
          maps: [],
          gathering: "maps",
          gathered: false,
        };
        bakeTerrain(shadow, sun);
        faces.clear();
        chunks.set(chunk.key, shadow);
        touch(chunk);
        return {
          views: [...views, ...faces.views],
          keepsViews: true,
          destroy: () => {
            groundSprites.give(views.map(({ view }) => view));
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
            shadow.directional.destroy(true);
            faces.destroy();
            // Its views' textures go with the map's source.
            map.destroy(true);
          },
        };
      };

      // The shadows on the parts of sprites that lean (a canopy in the wind) lean with them.
      const follow = () => {
        for (const { received } of chunks.values()) received?.shadows.follow();
      };

      const applyGrade = () => {
        const strength = lighting.current.shadowStrength;
        if (strength === appliedStrength) return;
        for (const shadow of chunks.values()) {
          shadow.faces.views.forEach(({ view }) => {
            view.alpha = strength;
          });
          shadow.gradeViews.forEach(({ view }) => {
            view.alpha = strength;
          });
          shadow.received?.views.forEach(({ view }) => {
            view.alpha = strength;
          });
        }
        movingViews.forEach(({ view }) => {
          view.alpha = strength;
        });
        appliedStrength = strength;
      };

      const update = () => {
        sun = lighting.current.shadow;
        // Topology and authored phase changes invalidate light; the world clock never does.
        const stale = [...chunks.values()]
          .filter(({ gathering }) => gathering !== undefined)
          .sort((a, b) => Number(a.gathered) - Number(b.gathered));
        if (phaseBake && stale.includes(phaseBake.shadow)) cancelPhaseBake();
        const fresh = building
          ? stale.flatMap((shadow) => [...gather(shadow), ...gather(shadow), ...gather(shadow)])
          : stale.slice(0, SHADOW_GATHERS_PER_FRAME).flatMap(gather);
        fresh.forEach((target) => drawTarget(target, sun));
        building = false;
        // Bake into back buffers in bounded slices. A chunk's top, walls and entity atlas are
        // published together only when complete, so no half-updated shadow is visible.
        if (phaseBake && !chunks.has(phaseBake.shadow.chunk.key)) cancelPhaseBake();
        if (!phaseBake) {
          const shadow = [...chunks.values()].find(
            (candidate) =>
              candidate.gathered &&
              candidate.gathering === undefined &&
              (candidate.drawnKey !== lightKey(sun) || (!lighting.transitioning && candidate.drawnLight !== sun)),
          );
          if (shadow) {
            const key = `${shadow.map.width}×${shadow.map.height}`;
            let map = phaseMaps.get(key);
            if (!map) {
              map = RenderTexture.create({ width: shadow.map.width, height: shadow.map.height });
              phaseMaps.set(key, map);
            }
            app.renderer.render({ container: phaseClear, target: map, clear: true, clearColor: [0, 0, 0, 0] });
            shadow.bakeTarget = map;
            shadow.faces.begin();
            bakeTerrain(shadow, sun);
            phaseBake = { shadow, light: sun, map, next: 0 };
          }
        }
        if (phaseBake) {
          const job = phaseBake;
          // At most eight receiver planes per frame; typical chunks finish in one frame.
          const end = Math.min(job.shadow.maps.length, job.next + SHADOW_PLANES_PER_FRAME);
          while (job.next < end) {
            drawTarget(job.shadow.maps[job.next], job.light);
            job.next += 1;
          }
          if (job.next === job.shadow.maps.length) {
            scratchSprite.texture = job.map;
            app.renderer.render({
              container: scratchSprite,
              target: job.shadow.map,
              clear: true,
              clearColor: [0, 0, 0, 0],
            });
            job.shadow.faces.commit();
            if (job.shadow.received) drawTarget(job.shadow.received.target, job.light);
            job.shadow.drawnLight = job.light;
            job.shadow.drawnKey = lightKey(job.light);
            job.shadow.bakeTarget = undefined;
            phaseBake = undefined;
          }
        }
        updateMovingReceiverShadows();
        applyGrade();
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
          update();
          updateMoving();
        },
        update: () => {
          update();
          profile("shadows:follow", follow);
          profile("shadows:moving", updateMoving);
        },
        destroy: () => {
          cancelPhaseBake();
          moving.forEach((shadow) => shadow.destroy());
          // The caster sprites with their containers and filters; their textures are the entities' and the chunks'.
          levelRoot.destroy({ children: true });
          copyRoot.destroy({ children: true });
          receivedRig.destroy();
          blurFilter.destroy();
          alphaFilter.destroy();
          groundSprites.destroy();
          scratches.forEach(({ texture }) => texture.destroy(true));
          phaseMaps.forEach((texture) => texture.destroy(true));
          phaseClear.destroy();
        },
      };
    },
  };
}
