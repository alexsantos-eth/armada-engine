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
import { SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import { getSunState } from "../time";
import type { OcclusionTerrain, ShadowProjection } from "../../types";
import { createReceivedShadows, type ShadowReceiver } from "./received-shadow";
import {
  createGroundShadowView,
  createSilhouettes,
  placeSilhouette,
  SHADOW_BLUR,
  SHADOW_MAP_PIXELS_PER_TILE,
  type Silhouette,
} from "./silhouette";

/** One shadow map and the fixed layer it is drawn from. */
type ShadowLayer = {
  readonly map: RenderTexture;
  /** Ambient occlusion of the level at the bottom, then the casters (if any reach it). */
  readonly root: Container;
  readonly occlusion: Texture;
  /** Silhouettes of the entities on this level or higher, with the shared filters. */
  readonly casters?: Container;
  readonly silhouettes: readonly { silhouette: Silhouette; lift: number }[];
};

/** Something drawn from the sun into a texture: a shadow map, or the shadows entities receive. */
type ShadowTarget = {
  /** Its casters, hidden at night (none when nothing casts on it). */
  readonly casters?: Container;
  readonly draw: (sun: ShadowProjection | null) => void;
  /** Tick it was last drawn for. */
  drawnTick: number;
};

/**
 * Tiles beyond a caster's shadow reach that a receiver may still stand and be shaded: the
 * shadow and the receiver are as wide as a tile.
 */
const RECEIVER_SPAN = 1;

/**
 * Scene module of the shadows, drawn onto the terrain: every column's top shows its square of the
 * shadow map of its own elevation, right after its top block (a sand top, its `topInset` lower).
 * Each map is drawn from a fixed layer: the level's ambient occlusion (computed once) and the
 * silhouettes of the entities standing on it or higher, laid on the ground by the sun.
 *
 * Entities also shade each other: every entity sprite within reach of another entity's shadow
 * (`getShadowReach()`) shows its square of one atlas right after it (`createReceivedShadows()`),
 * where the other silhouettes land as `getCastShadowOffset()` says. The atlas takes its turn among
 * the maps.
 *
 * It draws every map when the scene starts, at sunrise and at sunset (without silhouettes at
 * night); by day it redraws one map per frame, the stalest, once it is `SHADOW_REFRESH_TICKS` old.
 * The casters come from the `entityViews` service: without it, the maps hold the occlusion only.
 */
export function createShadows(): SceneModule {
  return {
    id: "shadows",
    setup({ app, world, bounds, columnAt, topInsetAt, projection, metrics, services }) {
      // Shadow maps: one world-space render texture per top elevation, a square of
      // `SHADOW_MAP_PIXELS_PER_TILE` texels per column, texel (0, 0) at `mapOrigin`.
      const pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE;
      const columnsWide = bounds.maxX - bounds.minX + 1;
      const columnsDeep = bounds.maxY - bounds.minY + 1;
      const mapOrigin = { x: bounds.minX - 0.5, y: bounds.minY - 0.5 };
      const shadowMaps = new Map<number, RenderTexture>();
      const shadowMapFor = (level: number) => {
        const existing = shadowMaps.get(level);
        if (existing) return existing;
        const map = RenderTexture.create({ width: columnsWide * pixelsPerTile, height: columnsDeep * pixelsPerTile });
        shadowMaps.set(level, map);
        return map;
      };

      const views: SceneView[] = projectBoxesToIsometric(world.columns, projection).map((top) => {
        const frame = new Texture({
          source: shadowMapFor(top.box.elevation).source,
          frame: new Rectangle(
            (top.x - bounds.minX) * pixelsPerTile,
            (top.y - bounds.minY) * pixelsPerTile,
            pixelsPerTile,
            pixelsPerTile,
          ),
        });
        const tileTop = { x: top.screenX, y: top.screenY + topInsetAt(top.x, top.y) * metrics.boxHeight };
        const depth = getBlockDepth(top, metrics);
        return { ...createGroundShadowView(frame, tileTop, metrics, depth), layer: SCENE_LAYER.ground };
      });

      // Silhouettes are drawn into shadow textures, never into the scene: blurred for soft edges,
      // with the sun's opacity applied to each group as a whole so overlaps do not darken twice.
      const blurFilter = new BlurFilter({ strength: SHADOW_BLUR, quality: 2 });
      const alphaFilter = new AlphaFilter({ alpha: 1 });
      const casterViews = services.get("entityViews") ?? [];
      const silhouettesOf = ({ entity, views: own }: (typeof casterViews)[number]) =>
        createSilhouettes(own, entity, metrics, entity.box.length, entity.box.lengthAxis ?? "x");

      // Shadows entities cast on each other: each entity sprite receives the silhouettes of the
      // other entities whose shadow could reach it with the sun at its lowest.
      const bodies = casterViews.map((caster) => ({ entity: caster.entity, silhouettes: silhouettesOf(caster) }));
      const receivers: ShadowReceiver[] = bodies
        .flatMap((body) =>
          body.silhouettes.map((own) => ({
            own,
            casters: bodies
              .filter((other) => other !== body)
              .flatMap((other) => {
                const lift = other.entity.box.elevation - body.entity.box.elevation;
                return other.silhouettes
                  .filter(
                    ({ worldFoot, display }) =>
                      Math.hypot(own.worldFoot.x - worldFoot.x, own.worldFoot.y - worldFoot.y) <=
                      getShadowReach(display.height, lift, metrics) + RECEIVER_SPAN,
                  )
                  .map((silhouette) => ({ silhouette, lift }));
              }),
          })),
        )
        .filter(({ casters }) => casters.length > 0);
      const received =
        receivers.length > 0 ? createReceivedShadows(receivers, app.renderer, [blurFilter, alphaFilter]) : undefined;
      if (received) views.push(...received.views.map((view) => ({ ...view, layer: SCENE_LAYER.onObject })));

      // Ambient occlusion: computed once for the whole terrain (it is static).
      const occlusionTerrain: OcclusionTerrain = {
        bounds,
        topHeightAt: (x, y) => {
          const column = columnAt.get(x, y);
          return column === undefined ? undefined : column.elevation - topInsetAt(x, y);
        },
        levelAt: (x, y) => columnAt.get(x, y)?.elevation,
      };

      const layers: ShadowLayer[] = [...shadowMaps].map(([level, map]) => {
        const root = new Container();
        const occlusion = new Texture({
          source: new BufferImageSource({
            resource: buildOcclusionMap(occlusionTerrain, level, AO_PIXELS_PER_TILE),
            width: columnsWide * AO_PIXELS_PER_TILE,
            height: columnsDeep * AO_PIXELS_PER_TILE,
          }),
        });
        const occlusionSprite = new Sprite(occlusion);
        occlusionSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
        root.addChild(occlusionSprite);

        // Casters standing on this level or higher: shadows onto higher ground are not drawn.
        const silhouettes = casterViews
          .filter(({ entity }) => entity.box.elevation >= level)
          .flatMap((caster) =>
            silhouettesOf(caster).map((silhouette) => ({ silhouette, lift: caster.entity.box.elevation - level })),
          );
        if (silhouettes.length === 0) return { map, root, occlusion, silhouettes };

        const casters = new Container();
        casters.filters = [blurFilter, alphaFilter];
        // The whole map: known up front, so Pixi does not measure the silhouettes on every redraw.
        casters.filterArea = new Rectangle(0, 0, map.width, map.height);
        silhouettes.forEach(({ silhouette }) => casters.addChild(silhouette.sprite));
        root.addChild(casters);
        return { map, root, occlusion, casters, silhouettes };
      });

      const drawLayer = (layer: ShadowLayer, sun: ShadowProjection | null) => {
        if (sun && layer.casters) {
          layer.silhouettes.forEach(({ silhouette, lift }) => {
            const ground = getSilhouetteMatrix(sun, silhouette.worldFoot, lift, metrics);
            placeSilhouette(silhouette, ground, mapOrigin, pixelsPerTile);
          });
        }
        app.renderer.render({ container: layer.root, target: layer.map, clear: true, clearColor: [0, 0, 0, 0] });
      };
      const targets: ShadowTarget[] = layers.map((layer) => ({
        casters: layer.casters,
        draw: (sun) => drawLayer(layer, sun),
        drawnTick: 0,
      }));
      if (received) {
        targets.push({
          casters: received.casters,
          draw: (sun) =>
            received.draw(
              sun && ((caster, receiver, lift) => getCastShadowOffset(sun, caster, receiver, lift, metrics)),
            ),
          drawnTick: 0,
        });
      }
      const drawTarget = (target: ShadowTarget, tick: number, sun: ShadowProjection | null) => {
        if (sun) alphaFilter.alpha = sun.alpha;
        target.draw(sun);
        target.drawnTick = tick;
      };

      let daytime: boolean | undefined;
      const update = (tick: number) => {
        const shadows = getShadowProjection(getSunState(tick));
        const isDay = shadows !== null;
        // When built, at sunrise and at sunset: every map (casters only by day).
        if (isDay !== daytime) {
          daytime = isDay;
          targets.forEach((target) => {
            if (target.casters) target.casters.visible = isDay;
            drawTarget(target, tick, shadows);
          });
          return;
        }
        if (!shadows) return;

        // By day, one map per frame: the stalest, so no frame pays for all of them and, in turns,
        // all keep moving even when a refresh falls due on every frame.
        let stalest: ShadowTarget | undefined;
        let stalestAge = SHADOW_REFRESH_TICKS - 1;
        targets.forEach((target) => {
          const age = Math.abs(tick - target.drawnTick);
          if (target.casters && age > stalestAge) {
            stalest = target;
            stalestAge = age;
          }
        });
        if (stalest) drawTarget(stalest, tick, shadows);
      };

      return {
        views,
        start: () => update(world.clock.tick),
        update: ({ tick }) => update(tick),
        destroy: () => {
          layers.forEach(({ root, occlusion }) => {
            root.destroy({ children: true });
            occlusion.destroy(true);
          });
          shadowMaps.forEach((map) => map.destroy(true));
          received?.destroy();
        },
      };
    },
  };
}
