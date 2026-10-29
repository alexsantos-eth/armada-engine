import {
  AlphaFilter,
  BlurFilter,
  BufferImageSource,
  Container,
  Graphics,
  MeshSimple,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from "pixi.js";
import {
  AO_PIXELS_PER_TILE,
  TERRAIN_RAY_REACH,
  createTerrainShadowSampler,
  createTerrainShadowGeometry,
  type TerrainShadowGeometry,
  getReceiverPoint,
  getTerrainFaces,
  type TerrainShadowField,
  sampleTerrainHorizon,
  type ShadowPoint,
  buildOcclusionMap,
  getCastShadowOffset,
  getShadowReach,
  getSilhouetteMatrix,
  createPhaseLighting,
  type PhaseLighting,
} from "../lighting";
import { needsCull } from "../camera";
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
import type { AffineTarget, Camera, ChunkKey, OcclusionTerrain, ShadowProjection, WorldRect } from "../../types";
import { pairShadows } from "./pairs";
import {
  createReceivedShadowRig,
  createReceivedShadows,
  type ReceivedShadows,
  type ShadowReceiver,
} from "./received-shadow";
import { createMovingCasters } from "./moving-shadow";
import { createSpriteShadowSampler } from "./sprite-sample";
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

/** The gathering step a chunk is waiting for: see {@link SHADOW_GATHERS_PER_FRAME}. */
export type ShadowGathering = "maps" | "pairs" | "received";

/** What a shadow target draws: a chunk's map (`"maps"`) or the atlas of its received shadows (`"received"`). */
type ShadowTargetKind = Exclude<ShadowGathering, "pairs">;

/**
 * One receiver height, isolated by a native stencil mask inside the chunk's common shadow pass.
 * Stable caster slots avoid reparenting sprites or replacing GPU buffers each animation frame.
 */
type ShadowLayer = {
  readonly level: number;
  /**
   * The chunk's columns of this level, as a rectangle: only their squares of the map show, so a
   * caster whose shadow cannot reach it is left out of the map.
   */
  readonly bounds: WorldRect;
  /** Native stencil mask and its plane group, authored once from the receiver columns. */
  readonly root: Container;
  readonly mask: Graphics;
  readonly sprites: { index: number; sprite: Sprite }[];
  shown: number;
  readonly clip: { minX: number; minY: number; maxX: number; maxY: number };
  terrain?: MeshSimple;
  /** Silhouettes of the entities on this level or higher that may reach the map. */
  casters: readonly Silhouette[];
  /** Blocks each of `casters` stands above the level. */
  lifts: readonly number[];
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
  /** Its ambient occlusion, at the bottom of every level. */
  readonly occlusion: Texture;
  readonly area: WorldRect;
  readonly terrainGeometry: TerrainShadowGeometry;
  readonly sampleTerrain: TerrainShadowField;
  readonly faces: TerrainFaceShadows;
  drawnLight: ShadowProjection;
  drawnStrength: number;
  drawnResolution: number;
  movingDirty: boolean;
  readonly minimumReceiver: number;
  cullCamera?: Camera;
  cullWidth?: number;
  cullHeight?: number;
  readonly bakedVisibility: Set<SceneView["view"]>;
  visibleReceivers?: Set<SceneView["view"]>;
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
 * one projection; explicit transitions reproject all receivers together in the current frame.
 * Moving casters join the common maps; only receivers reached by their old or current pose are invalidated.
 */
export function createShadows(lighting: PhaseLighting = createPhaseLighting()): SceneModule {
  return {
    id: "shadows",
    setup({ app, columnAt, topInsetAt, projection, metrics, services, profile }) {
      const pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE;
      // Silhouettes are drawn into shadow textures, never into the scene: blurred for soft edges,
      // with the sun's opacity applied to each group as a whole so overlaps do not darken twice.
      const blurFilter = new BlurFilter({ strength: SHADOW_BLUR, quality: 1 });
      const alphaFilter = new AlphaFilter({ alpha: 1 });
      // Receiver planes share one filtered caster group; the static AO is composed beneath it.
      const casters = createCasterSprites([blurFilter, alphaFilter]);
      const occlusionSprite = new Sprite();
      occlusionSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
      let nextCaster = 0;
      const freeCasters: number[] = [];
      const activeRoots = new Set<Container>();
      const levelRoot = new Container();
      levelRoot.addChild(occlusionSprite, casters.container);
      // The atlases of received shadows have their own, with the same filters.
      const receivedRig = createReceivedShadowRig(app.renderer, [blurFilter, alphaFilter]);
      // Caster textures of the received shadows, reused from draw to draw.
      const textures = createTexturePool();
      // Sprites of the ground shadows, a chunk's given back when it is hidden for the next one.
      const groundSprites = createSpritePool();
      const chunks = new Map<ChunkKey, ShadowChunk>();
      const moving = createMovingCasters(
        services.get("movingCasters") ?? [],
        (x, y) => columnAt.get(x, y) !== undefined,
      );
      const spriteSampler = createSpriteShadowSampler(app.renderer);
      // Set by `start()`, before any chunk gathers its casters.
      let scene!: BuiltScene;
      let sun = lighting.current.shadow;
      let building = true;
      let filterResolution = 1;

      const areaOf = ({ minX, minY, maxX, maxY }: WorldRect): WorldRect => ({
        minX: minX - SHADOW_MAP_MARGIN,
        minY: minY - SHADOW_MAP_MARGIN,
        maxX: maxX + SHADOW_MAP_MARGIN,
        maxY: maxY + SHADOW_MAP_MARGIN,
      });
      const occlusionTerrain = (bounds: WorldRect): OcclusionTerrain => {
        const halo = TERRAIN_RAY_REACH + 1;
        const minX = bounds.minX - halo,
          minY = bounds.minY - halo;
        const width = bounds.maxX - minX + halo + 1,
          height = bounds.maxY - minY + halo + 1;
        const heights = new Float32Array(width * height);
        heights.fill(NaN);
        for (let y = 0; y < height; y += 1)
          for (let x = 0; x < width; x += 1) {
            const column = columnAt.get(minX + x, minY + y);
            if (column) heights[y * width + x] = column.elevation - topInsetAt(minX + x, minY + y);
          }
        return {
          bounds,
          topHeightAt: (x, y) => {
            const value = heights[(y - minY) * width + x - minX];
            return Number.isFinite(value) ? value : undefined;
          },
        };
      };

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
      const receiverPoint = { x: 0, y: 0, elevation: 0 };
      const receiverHorizons = new WeakMap<
        Silhouette,
        { light: ShadowProjection; sampled: Uint8Array; elevations: Float64Array; widths: Float64Array }
      >();
      const horizon = { elevation: 0, width: 0.1 };
      const terrainOnReceiver = (
        shadow: ShadowChunk,
        light: ShadowProjection,
        own: Silhouette,
        x: number,
        y: number,
      ) => {
        const point = getReceiverPoint(receiverFeet.get(own)!, own.screenFoot, x, y, light, metrics, receiverPoint);
        let cache = receiverHorizons.get(own);
        if (!cache) {
          cache = { light, sampled: new Uint8Array(8), elevations: new Float64Array(8), widths: new Float64Array(8) };
          receiverHorizons.set(own, cache);
        }
        if (cache.light !== light) {
          cache.light = light;
          cache.sampled.fill(0);
        }
        const column = Math.max(0, Math.min(7, Math.floor(((x - own.bodyDisplay.left) * 8) / own.bodyDisplay.width)));
        if (!cache.sampled[column]) {
          shadow.sampleTerrain.horizon(point.x, point.y, light, horizon);
          cache.elevations[column] = horizon.elevation;
          cache.widths[column] = horizon.width;
          cache.sampled[column] = 1;
        }
        horizon.elevation = cache.elevations[column];
        horizon.width = cache.widths[column];
        return sampleTerrainHorizon(horizon, point.elevation);
      };
      const isVisible = (shadow: ShadowChunk, view: SceneView["view"]) =>
        shadow.visibleReceivers?.has(view) ?? !view.culled;
      const drawGround = (shadow: ShadowChunk, light: ShadowProjection) => {
        let planes = 0;
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        activeRoots.forEach((root) => {
          root.visible = false;
        });
        activeRoots.clear();
        const mapOrigin = { x: shadow.area.minX - 0.5, y: shadow.area.minY - 0.5 };
        for (const layer of shadow.layers) {
          let visible = false;
          let receiverMinX = Infinity,
            receiverMinY = Infinity,
            receiverMaxX = -Infinity,
            receiverMaxY = -Infinity;
          shadow.chunk.columns.forEach((column, index) => {
            if (
              column.elevation - topInsetAt(column.x, column.y) !== layer.level ||
              !isVisible(shadow, shadow.gradeViews[index].view)
            )
              return;
            visible = true;
            receiverMinX = Math.min(receiverMinX, column.x);
            receiverMinY = Math.min(receiverMinY, column.y);
            receiverMaxX = Math.max(receiverMaxX, column.x);
            receiverMaxY = Math.max(receiverMaxY, column.y);
            minX = Math.min(minX, column.x);
            minY = Math.min(minY, column.y);
            maxX = Math.max(maxX, column.x);
            maxY = Math.max(maxY, column.y);
          });
          if (!visible) continue;
          layer.root.visible = true;
          activeRoots.add(layer.root);
          let layerShown = 0;
          const place = (silhouette: Silhouette, lift: number) => {
            getSilhouetteMatrix(light, silhouette.worldFoot, lift, metrics, ground);
            const x = silhouette.display.left - silhouette.screenFoot.x,
              y = silhouette.display.top - silhouette.screenFoot.y;
            const baseX = ground.a * x + ground.c * y + ground.tx,
              baseY = ground.b * x + ground.d * y + ground.ty;
            const ax = ground.a * silhouette.display.width,
              ay = ground.b * silhouette.display.width;
            const bx = ground.c * silhouette.display.height,
              by = ground.d * silhouette.display.height;
            // Reject projected quads outside visible receiver bounds, retaining blur and edge neighbours.
            if (
              baseX + Math.max(0, ax) + Math.max(0, bx) < receiverMinX - 1.5 ||
              baseX + Math.min(0, ax) + Math.min(0, bx) > receiverMaxX + 1.5 ||
              baseY + Math.max(0, ay) + Math.max(0, by) < receiverMinY - 1.5 ||
              baseY + Math.min(0, ay) + Math.min(0, by) > receiverMaxY + 1.5
            )
              return;
            let kept = layer.sprites[layerShown];
            if (!kept) {
              const index = freeCasters.pop() ?? nextCaster++;
              kept = { index, sprite: casters.sprite(index, silhouette.texture) };
              casters.show(nextCaster);
              layer.sprites.push(kept);
              layer.root.addChild(kept.sprite);
            }
            const sprite = kept.sprite;
            sprite.texture = silhouette.texture;
            if (!sprite.visible) sprite.visible = true;
            placeSilhouette(sprite, silhouette, ground, mapOrigin, pixelsPerTile);
            layerShown += 1;
          };
          layer.casters.forEach((silhouette, index) => place(silhouette, layer.lifts[index]));
          for (const state of moving.states) {
            if (!state.shape) continue;
            const lift = state.elevation - layer.level;
            const silhouette = cropSilhouetteAbove(state.shape, -lift * metrics.boxHeight);
            if (silhouette && reaches(silhouette, lift, layer.bounds)) place(silhouette, lift);
          }
          for (let index = layerShown; index < layer.shown; index += 1) layer.sprites[index].sprite.visible = false;
          layer.shown = layerShown;
          layer.clip.minX = receiverMinX - 1.5;
          layer.clip.minY = receiverMinY - 1.5;
          layer.clip.maxX = receiverMaxX + 1.5;
          layer.clip.maxY = receiverMaxY + 1.5;
          const changed = profile("shadows:terrain-project", () =>
            shadow.terrainGeometry.project(layer.level, light, mapOrigin, pixelsPerTile, layer.clip),
          );
          let mesh = layer.terrain;
          if (!mesh) {
            mesh = new MeshSimple({
              texture: Texture.WHITE,
              vertices: shadow.terrainGeometry.vertices,
              uvs: shadow.terrainGeometry.uvs,
              indices: shadow.terrainGeometry.indices,
            });
            mesh.autoUpdate = false;
            mesh.tint = 0;
            layer.terrain = mesh;
            layer.root.addChild(mesh);
          }
          if (mesh.geometry.positions !== shadow.terrainGeometry.vertices)
            mesh.geometry.positions = shadow.terrainGeometry.vertices;
          else if (changed) mesh.geometry.getBuffer("aPosition").update();
          if (mesh.geometry.indices.length !== shadow.terrainGeometry.indices.length)
            mesh.geometry.indices = shadow.terrainGeometry.indices;
          mesh.visible = shadow.terrainGeometry.indices.length > 0;
          planes += 1;
        }
        if (!planes) return;

        casters.container.visible = true;
        const left = Math.max(shadow.area.minX, minX - 1),
          top = Math.max(shadow.area.minY, minY - 1);
        casters.container.filterArea = new Rectangle(
          (left - shadow.area.minX) * pixelsPerTile,
          (top - shadow.area.minY) * pixelsPerTile,
          (Math.min(shadow.area.maxX, maxX + 1) - left + 1) * pixelsPerTile,
          (Math.min(shadow.area.maxY, maxY + 1) - top + 1) * pixelsPerTile,
        );
        // Native stencil masks select each height before one common blur/opacity pass.
        occlusionSprite.texture = shadow.occlusion;
        occlusionSprite.alpha = lighting.current.shadowStrength;
        profile("shadows:ground-paint", () =>
          app.renderer.render({ container: levelRoot, target: shadow.map, clear: true, clearColor: [0, 0, 0, 0] }),
        );
      };

      type MovingHit = { shape: Silhouette; left: number; top: number };
      const receiverHits = new WeakMap<SceneMovingCaster, MovingHit[]>();
      const movingHorizons = new WeakMap<SceneMovingCaster, Float64Array>();
      const movingOcclusion = (hits: readonly MovingHit[], x: number, y: number, coverage: number) => {
        for (const hit of hits)
          coverage = Math.max(
            coverage,
            spriteSampler.sample(hit.shape, hit.shape.display.left + x - hit.left, hit.shape.display.top + y - hit.top),
          );
        return coverage;
      };
      const updateMovingReceiverShadows = () => {
        const receivers = services.get("movingCasters") ?? [];
        receivers.forEach((receiver, receiverIndex) => {
          if (!receiver.receiveTerrainShadow && !receiver.receiveTerrainShadowBands && !receiver.receiveShadowGrid)
            return;
          const foot = receiver.foot();
          const { ground } = foot;
          const tileX = Math.round(ground.x),
            tileY = Math.round(ground.y);
          let shadow: ShadowChunk | undefined;
          for (const candidate of chunks.values()) {
            const { rect } = candidate.chunk;
            if (tileX >= rect.minX && tileX <= rect.maxX && tileY >= rect.minY && tileY <= rect.maxY) {
              shadow = candidate;
              break;
            }
          }
          const sprite = receiver.view instanceof Sprite ? receiver.view : undefined;
          const left = sprite ? sprite.x - sprite.anchor.x * sprite.width : foot.screen.x;
          const top = sprite ? sprite.y - sprite.anchor.y * sprite.height : foot.screen.y;
          const right = left + (sprite?.width ?? 0),
            bottom = top + (sprite?.height ?? 0);
          const hits = receiverHits.get(receiver) ?? [];
          receiverHits.set(receiver, hits);
          let count = 0;
          const addHit = (shape: Silhouette, elevation: number) => {
            const hit = getCastShadowOffset(
              sun,
              shape.worldFoot,
              ground,
              elevation - ground.elevation,
              metrics,
              offset,
            );
            if (!hit) return;
            const x = foot.screen.x + shape.display.left - shape.screenFoot.x + hit.x;
            const y = foot.screen.y + shape.display.top - shape.screenFoot.y + hit.y;
            if (x > right || x + shape.display.width < left || y > bottom || y + shape.display.height < top) return;
            const entry = hits[count];
            if (entry) {
              entry.shape = shape;
              entry.left = x;
              entry.top = y;
            } else hits.push({ shape, left: x, top: y });
            count += 1;
          };
          for (const view of shadow ? nearbyViews(shadow.chunk).near : [])
            for (const shape of silhouettesOf(view)) addHit(shape, view.entity.box.elevation);
          moving.states.forEach((state, index) => {
            if (index !== receiverIndex && state.shape) addHit(state.shape, state.elevation);
          });
          hits.length = count;
          if ((receiver.receiveShadowGrid || receiver.receiveTerrainShadowBands) && sprite) {
            const columns = receiver.receiveShadowGrid ? 8 : 1;
            const samples = movingTerrainBands.get(receiver) ?? new Float32Array(16 * columns);
            movingTerrainBands.set(receiver, samples);
            const skylines = movingHorizons.get(receiver) ?? new Float64Array(columns * 2);
            movingHorizons.set(receiver, skylines);
            for (let band = 0; band < 16; band += 1)
              for (let column = 0; column < columns; column += 1) {
                const x = left + (sprite.width * (column + 0.5)) / columns;
                const y = top + sprite.height * (1 - (band + 0.5) / 16);
                const point = getReceiverPoint(ground, foot.screen, x, y, sun, metrics, receiverPoint);
                if (band === 0 && shadow) {
                  shadow.sampleTerrain.horizon(point.x, point.y, sun, horizon);
                  skylines[column * 2] = horizon.elevation;
                  skylines[column * 2 + 1] = horizon.width;
                }
                horizon.elevation = skylines[column * 2];
                horizon.width = skylines[column * 2 + 1];
                const coverage = movingOcclusion(
                  hits,
                  x,
                  y,
                  shadow ? sampleTerrainHorizon(horizon, point.elevation) : 0,
                );
                samples[band * columns + column] = coverage * sun.alpha * lighting.current.shadowStrength;
              }
            if (receiver.receiveShadowGrid) receiver.receiveShadowGrid(samples);
            else receiver.receiveTerrainShadowBands!(samples);
            return;
          }
          const coverage = movingOcclusion(
            hits,
            foot.screen.x,
            foot.screen.y,
            shadow ? shadow.sampleTerrain(ground, sun) : 0,
          );
          const next = coverage * sun.alpha * lighting.current.shadowStrength;
          const current = movingTerrainAlphas.get(receiver) ?? 0;
          movingTerrainAlphas.set(receiver, next);
          if (Math.abs(next - current) > 0.001) receiver.receiveTerrainShadow?.(next);
        });
      };
      const drawTarget = (target: ShadowTarget, light: ShadowProjection) => {
        alphaFilter.alpha = light.alpha * lighting.current.shadowStrength;
        profile(DRAW_LABEL[target.kind], () => target.draw(light));
      };

      /** Gathers the casters of a chunk's maps again; returns the maps, to draw. */
      const wallShapes: Silhouette[] = [];
      const wallHeights: number[] = [];
      const extraPairs: { silhouette: Silhouette; lift: number }[] = [];
      const additionalCasters = (own: Silhouette) => {
        let count = 0;
        for (const state of moving.states) {
          if (!state.shape) continue;
          const pair = extraPairs[count];
          const lift = state.elevation - receiverFeet.get(own)!.elevation;
          if (pair) {
            pair.silhouette = state.shape;
            pair.lift = lift;
          } else extraPairs.push({ silhouette: state.shape, lift });
          count += 1;
        }
        extraPairs.length = count;
        return extraPairs;
      };
      const gatherMaps = (shadow: ShadowChunk): ShadowTarget[] => {
        const { near } = nearbyViews(shadow.chunk);
        shadow.layers.forEach((layer) => {
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
        });
        shadow.maps = [{ kind: "maps", draw: (light) => profile("shadows:ground", () => drawGround(shadow, light)) }];
        const wallCasters = near.flatMap((view) => silhouettesOf(view));
        const wallElevations = near.flatMap((view) => silhouettesOf(view).map(() => view.entity.box.elevation));
        shadow.maps.push({
          kind: "maps",
          draw: (light) =>
            profile("shadows:walls", () => {
              shadow.faces.begin();
              wallShapes.length = 0;
              wallHeights.length = 0;
              wallCasters.forEach((shape, index) => {
                wallShapes.push(shape);
                wallHeights.push(wallElevations[index]);
              });
              moving.states.forEach((state) => {
                if (state.shape) {
                  wallShapes.push(state.shape);
                  wallHeights.push(state.elevation);
                }
              });
              shadow.faces.draw(null, light, wallShapes, wallHeights);
              shadow.faces.commit(light.alpha * lighting.current.shadowStrength);
              shadow.drawnLight = light;
              shadow.drawnStrength = lighting.current.shadowStrength;
              shadow.drawnResolution = filterResolution;
              shadow.movingDirty = false;
              shadow.bakedVisibility.clear();
              for (const { view } of [...shadow.gradeViews, ...shadow.faces.views, ...(shadow.received?.views ?? [])])
                if (isVisible(shadow, view)) shadow.bakedVisibility.add(view);
            }),
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
        const shadows = createReceivedShadows(receivers, receivedRig, textures, (view) => isVisible(shadow, view));
        shadow.cullWidth = undefined;
        const views = shadows.views.map((view) => ({ ...view, layer: SCENE_LAYER.onObject }));
        views.forEach(({ view }) => {
          view.alpha = 1;
        });
        scene.add(views);
        const target: ShadowTarget = {
          kind: "received",
          draw: (light) =>
            shadows.draw(
              (caster, receiver, lift) => getCastShadowOffset(light, caster, receiver, lift, metrics, offset),
              (own, x, y) => terrainOnReceiver(shadow, light, own, x, y),
              additionalCasters,
              light,
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

      const showChunk = (chunk: WorldChunk) => {
        // The shadow map: one render texture for the chunk, a square of `SHADOW_MAP_PIXELS_PER_TILE`
        // texels per column of its area, texel (0, 0) at its corner. Each column's square shows
        // the shadows of its own elevation (one level of the map per top elevation of the chunk).
        const area = areaOf(chunk.rect);
        const terrain = occlusionTerrain(area);
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
        const occlusionSource = new BufferImageSource({
          resource: buildOcclusionMap(
            terrain,
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
        const sampleTerrain = createTerrainShadowSampler(terrain);
        const faceGeometry = getTerrainFaces(
          chunk.columns.map(({ x, y, elevation }) => ({ x, y, elevation: elevation - topInsetAt(x, y) })),
          (x, y) => terrain.topHeightAt(x, y),
          DEFAULT_MIN_ELEVATION,
        );
        let minimumReceiver = Infinity;
        bounds.forEach((_rect, level) => {
          minimumReceiver = Math.min(minimumReceiver, level);
        });
        faceGeometry.forEach(({ bottom }) => {
          minimumReceiver = Math.min(minimumReceiver, bottom);
        });
        const faces = createTerrainFaceShadows(faceGeometry, {
          renderer: app.renderer,
          // Blur the complete wall mask once, then grade its scene views.
          filters: [blurFilter],
          projection,
          metrics,
          sampleTerrain,
          isVisible: (view) => isVisible(shadow, view),
        });
        const layers: ShadowLayer[] = [...bounds.entries()].map(([level, bounds]) => {
          const root = new Container();
          const mask = new Graphics();
          for (let y = area.minY; y <= area.maxY; y += 1) {
            let start: number | undefined;
            for (let x = area.minX; x <= area.maxX + 1; x += 1) {
              const column = x <= area.maxX ? columnAt.get(x, y) : undefined;
              const matches = column && column.elevation - topInsetAt(x, y) === level;
              if (matches && start === undefined) start = x;
              if (!matches && start !== undefined) {
                mask.rect(
                  (start - area.minX) * pixelsPerTile,
                  (y - area.minY) * pixelsPerTile,
                  (x - start) * pixelsPerTile,
                  pixelsPerTile,
                );
                start = undefined;
              }
            }
          }
          mask.fill(0xffffff);
          root.addChild(mask);
          root.mask = mask;
          root.visible = false;
          casters.container.addChild(root);
          return { level, bounds, root, mask, sprites: [], shown: 0, clip: { ...bounds }, casters: [], lifts: [] };
        });

        views.forEach(({ view }) => {
          view.alpha = 1;
        });
        faces.views.forEach(({ view }) => {
          view.alpha = 1;
        });
        const shadow: ShadowChunk = {
          chunk,
          map,
          occlusion,
          area,
          terrainGeometry: createTerrainShadowGeometry(terrain),
          sampleTerrain,
          faces,
          drawnLight: sun,
          drawnStrength: lighting.current.shadowStrength,
          drawnResolution: filterResolution,
          movingDirty: false,
          bakedVisibility: new Set(),
          minimumReceiver,
          gradeViews: views,
          layers,
          maps: [],
          gathering: "maps",
          gathered: false,
        };
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
            layers.forEach(({ root, mask, sprites, terrain }) => {
              sprites.forEach(({ index, sprite }) => {
                sprite.visible = false;
                casters.container.addChild(sprite);
                freeCasters.push(index);
              });
              if (terrain) {
                terrain.geometry.destroy(true);
                terrain.destroy({ texture: false });
              }
              activeRoots.delete(root);
              root.mask = null;
              // Caster sprites and meshes are borrowed from the module's pools.
              root.removeChildren();
              root.destroy();
              mask.destroy({ context: true });
            });
            occlusion.destroy(true);
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

      const hasVisibleReceivers = (shadow: ShadowChunk) => {
        const camera = services.get("camera");
        if (
          camera &&
          (shadow.cullWidth !== app.screen.width ||
            shadow.cullHeight !== app.screen.height ||
            needsCull(shadow.cullCamera, camera.state, app.screen, projection, 0.015))
        ) {
          const views = [...shadow.gradeViews, ...shadow.faces.views, ...(shadow.received?.views ?? [])];
          const previous = views.map(({ view }) => view.culled);
          camera.cullViews(views, 0.03);
          const visible = (shadow.visibleReceivers ??= new Set());
          visible.clear();
          views.forEach(({ view }, index) => {
            if (!view.culled) {
              visible.add(view);
              if (!shadow.bakedVisibility.has(view)) shadow.movingDirty = true;
            }
            // Scene streaming uses a larger cull margin; it must not overwrite baking visibility.
            view.culled = previous[index];
          });
          shadow.cullCamera = camera.state;
          shadow.cullWidth = app.screen.width;
          shadow.cullHeight = app.screen.height;
        }

        return (
          shadow.gradeViews.some(({ view }) => isVisible(shadow, view)) ||
          shadow.faces.views.some(({ view }) => isVisible(shadow, view)) ||
          Boolean(shadow.received?.views.some(({ view }) => isVisible(shadow, view)))
        );
      };

      const update = () => {
        sun = lighting.current.shadow;
        // Spatial filtering follows screen density; the light still advances on every frame.
        filterResolution = Math.min(1, (services.get("camera")?.state?.zoom ?? 2) / 2);
        blurFilter.resolution = filterResolution;
        alphaFilter.resolution = filterResolution;
        const movingChanged = profile("shadows:moving", () => moving.update());
        if (movingChanged)
          for (const shadow of chunks.values()) {
            for (const state of moving.states) {
              if (!state.changed) continue;
              if (
                (state.shape && reaches(state.shape, state.elevation - shadow.minimumReceiver, shadow.chunk.rect)) ||
                (state.previous &&
                  reaches(state.previous, state.previousElevation - shadow.minimumReceiver, shadow.chunk.rect))
              )
                shadow.movingDirty = true;
            }
          }
        // Topology and authored phase changes invalidate light; the world clock never does.
        const stale = [...chunks.values()]
          .filter(({ gathering }) => gathering !== undefined)
          .sort((a, b) => Number(a.gathered) - Number(b.gathered));
        const gatherChunk = (shadow: ShadowChunk) => {
          if (gather(shadow).length > 0) shadow.movingDirty = true;
        };
        if (building)
          stale.forEach((shadow) => {
            while (shadow.gathering !== undefined) gatherChunk(shadow);
          });
        else stale.slice(0, SHADOW_GATHERS_PER_FRAME).forEach(gatherChunk);
        chunks.forEach(hasVisibleReceivers);
        building = false;
        // A phase is one frame-wide light snapshot, shared by every chunk, wall and moving caster.
        // Never quantize the angle or publish receivers on different frames.
        for (const shadow of chunks.values()) {
          if (shadow.maps.length === 0 || !hasVisibleReceivers(shadow)) continue;
          if (
            shadow.drawnLight === sun &&
            shadow.drawnStrength === lighting.current.shadowStrength &&
            shadow.drawnResolution >= filterResolution &&
            !shadow.movingDirty
          )
            continue;
          shadow.maps.forEach((target) => drawTarget(target, sun));
          if (shadow.received) drawTarget(shadow.received.target, sun);
          shadow.drawnLight = sun;
        }
        updateMovingReceiverShadows();
      };

      return {
        views: [],
        showChunk,
        start: (built) => {
          scene = built;
          update();
        },
        update: () => {
          update();
          profile("shadows:follow", follow);
        },
        destroy: () => {
          spriteSampler.destroy();
          // The caster sprites with their containers and filters; their textures are the entities' and the chunks'.
          levelRoot.destroy({ children: true });
          receivedRig.destroy();
          blurFilter.destroy();
          alphaFilter.destroy();
          groundSprites.destroy();
        },
      };
    },
  };
}
