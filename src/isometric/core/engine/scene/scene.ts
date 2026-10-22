import {
  AlphaFilter,
  type Application,
  Assets,
  BlurFilter,
  BufferImageSource,
  Container,
  Culler,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  UPDATE_PRIORITY,
} from "pixi.js";
import type { Entity } from "../entities";
import { projectBoxesToIsometric } from "../projection";
import { fillElevations, getBlockMaterial } from "../terrain";
import type { OcclusionTerrain, ShadowProjection, TerrainMaterial, TerrainSurface } from "../../types";
import {
  BOX_HEIGHT,
  DEFAULT_MIN_ELEVATION,
  GROUND_BLOCK_TEXTURE_KEY,
  GRASS_BLOCK_TEXTURE_KEY,
  POSITIVE_ELEVATION_TINT_STEP,
  TILE_HEIGHT,
  TILE_METRICS,
  TILE_WIDTH,
  NEGATIVE_ELEVATION_TINT_STEP,
  SAND_BLOCK_TEXTURE_KEY,
  WATER_BLOCK_TEXTURE_KEY,
} from "../constants";
import { CellMap } from "../grid";
import {
  AO_PIXELS_PER_TILE,
  buildOcclusionMap,
  getShadowProjection,
  getSilhouetteMatrix,
  SHADOW_REFRESH_TICKS,
} from "../lighting";
import {
  addInDepthOrder,
  createBlockViews,
  createGroundShadowView,
  createSilhouettes,
  createSvgColorVariant,
  type DepthView,
  getSvgResolution,
  placeSilhouette,
  rgbToTint,
  SHADOW_BLUR,
  SHADOW_MAP_PIXELS_PER_TILE,
  type Silhouette,
} from "../render";
import { getSunState } from "../time";
import type { World } from "../world";

const POSITIVE_ELEVATION_TOP_TINT = 0xe8ffb0;
/** Neutral tint for sand: same height darkening as grass, without the green cast. */
const SAND_TOP_TINT = 0xffffff;

function getLevelTint(baseTint: number, levelsBelowTop: number, tintStep: number): number {
  const factor = Math.max(0.35, 1 - levelsBelowTop * tintStep);
  const red = Math.round(((baseTint >> 16) & 0xff) * factor);
  const green = Math.round(((baseTint >> 8) & 0xff) * factor);
  const blue = Math.round((baseTint & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}

function getNegativeElevationTint(elevation: number): number {
  return getLevelTint(0xffffff, Math.max(1, Math.abs(elevation)), NEGATIVE_ELEVATION_TINT_STEP);
}

function getPositiveElevationTint(
  elevation: number,
  maxPositiveElevation: number,
  topTint: number = POSITIVE_ELEVATION_TOP_TINT,
): number | undefined {
  if (maxPositiveElevation <= 0) return undefined;

  const levelsBelowTop = Math.max(0, maxPositiveElevation - elevation);
  return getLevelTint(topTint, levelsBelowTop, POSITIVE_ELEVATION_TINT_STEP);
}

/** One shadow map and the fixed layer it is drawn from. */
type ShadowLayer = {
  readonly map: RenderTexture;
  /** Ambient occlusion of the level at the bottom, then the casters (if any reach it). */
  readonly root: Container;
  readonly occlusion: Texture;
  /** Silhouettes of the entities on this level or higher, with the shared filters. */
  readonly casters?: Container;
  readonly silhouettes: readonly { silhouette: Silhouette; lift: number }[];
  /** Tick the map was last drawn for. */
  drawnTick: number;
};

/**
 * Renders `world` into `app`. The scene only reads the world: it never generates or changes
 * it, so the same world can be simulated, saved or rendered again. Returns a cleanup that
 * destroys the scene, stops its per-frame updates and unloads its assets.
 *
 * SVGs are rasterized at the size they are drawn (`getSvgResolution()`), and every view is
 * created `cullable`: the scene culls on demand (`Culler.shared.cull()`) when it is built and
 * when the renderer resizes, never every frame.
 *
 * Shadows are drawn onto the terrain: every column's top shows its square of the shadow map of
 * its own elevation, right after its top block. Each map is drawn from a fixed layer: the
 * level's ambient occlusion (computed once) and the silhouettes of the entities standing on it
 * or higher, laid on the ground by the sun. From `app.ticker`, at `UPDATE_PRIORITY.NORMAL`
 * (after the simulation, at `HIGH`, and before the Application renders, at `LOW`), the scene
 * tints the world with the ambient light when the tick changed; draws every map when it is
 * built, at sunrise and at sunset (without silhouettes at night); and by day redraws one map per
 * frame, the stalest, once it is `SHADOW_REFRESH_TICKS` old.
 */
export async function createIsometricScene(app: Application, world: World): Promise<() => void> {
  const grassBlockSource = "/assets/grass/block.svg";
  const groundBlockSource = "/assets/ground/block.svg";
  const waterBlockSource = "/assets/water/block.svg";
  const sandBlockSource = "/assets/sand/block.svg";

  const filledBoxes = fillElevations(world.columns, DEFAULT_MIN_ELEVATION);
  const { entities, surfaces } = world;
  // One texture per (entity type, color variation): instances share it instead of each
  // fetching and decoding its own SVG. Types without `colorReplacements` share their source.
  const entityTextureKeys = new Map<Entity, string>();
  const entityTextureVariants = [
    ...new Map(
      entities.map((entity) => {
        const variation = entity.colorVariant ?? 0;
        const variantKey = entity.colorReplacements
          ? `${entity.type}:${entity.textureSource}#${variation}`
          : entity.textureSource;
        entityTextureKeys.set(entity, variantKey);
        return [variantKey, { entity, variation }] as const;
      }),
    ).entries(),
  ];
  const textures = new Map<string, Texture>();
  // Rasterize each SVG at the size it is drawn, not at its 1024 px canvas.
  const resolution = getSvgResolution(TILE_WIDTH, app.renderer.resolution);
  const loadSvg = (src: string) => Assets.load<Texture>({ src, data: { resolution } });
  const [grassTexture, groundTexture, waterTexture, sandTexture, ...entityTextures] = await Promise.all([
    loadSvg(grassBlockSource),
    loadSvg(groundBlockSource),
    loadSvg(waterBlockSource),
    loadSvg(sandBlockSource),
    ...entityTextureVariants.map(async ([variantKey, { entity, variation }]) => {
      const source = await createSvgColorVariant(entity.textureSource, entity.colorReplacements, variation);
      return { variantKey, source, texture: await loadSvg(source) };
    }),
  ]);
  textures.set(GRASS_BLOCK_TEXTURE_KEY, grassTexture);
  textures.set(GROUND_BLOCK_TEXTURE_KEY, groundTexture);
  textures.set(WATER_BLOCK_TEXTURE_KEY, waterTexture);
  textures.set(SAND_BLOCK_TEXTURE_KEY, sandTexture);
  const entityTexturesBySource = new Map(
    entityTextureVariants.map(([variantKey], index) => [variantKey, entityTextures[index]?.texture]),
  );
  const entityTexturesByEntity = new Map(
    entities.map((entity) => [entity, entityTexturesBySource.get(entityTextureKeys.get(entity) as string)]),
  );
  const loadedEntitySources = entityTextures.map(({ source }) => source);

  // Draw order comes from adding views in depth order once (see `addInDepthOrder()`), so the
  // scene never needs `sortableChildren`, which would re-sort every child on any change.
  // A render group: its tint (the ambient light) and, later, its position (the camera) are
  // applied on the GPU without updating its thousands of children.
  const scene = new Container({ isRenderGroup: true });
  app.stage.addChild(scene);
  const views: DepthView[] = [];

  // Shadow maps: one world-space render texture per top elevation, a square of
  // `SHADOW_MAP_PIXELS_PER_TILE` texels per column, texel (0, 0) at `mapOrigin`.
  const pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE;
  const gridMinX = Math.min(...world.columns.map(({ x }) => x));
  const gridMinY = Math.min(...world.columns.map(({ y }) => y));
  const gridMaxX = Math.max(...world.columns.map(({ x }) => x));
  const gridMaxY = Math.max(...world.columns.map(({ y }) => y));
  const mapOrigin = { x: gridMinX - 0.5, y: gridMinY - 0.5 };
  const shadowMaps = new Map<number, RenderTexture>();
  const shadowMapFor = (level: number) => {
    const existing = shadowMaps.get(level);
    if (existing) return existing;
    const map = RenderTexture.create({
      width: (gridMaxX - gridMinX + 1) * pixelsPerTile,
      height: (gridMaxY - gridMinY + 1) * pixelsPerTile,
    });
    shadowMaps.set(level, map);
    return map;
  };

  // Each world column holds its top elevation.
  const topElevationByColumn = CellMap.from(world.columns, ({ elevation }) => elevation);
  const maxPositiveElevation = filledBoxes.reduce((maximum, box) => Math.max(maximum, box.elevation), 0);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  filledBoxes.forEach((box) => {
    const screenX = (box.x - box.y) * (TILE_WIDTH / 2);
    const screenY = -(box.x + box.y) * (TILE_HEIGHT / 2) - box.elevation * BOX_HEIGHT;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
  });

  const projection = {
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    elevationStep: BOX_HEIGHT,
    originX: app.screen.width / 2 - (minX + maxX) / 2,
    originY: app.screen.height / 2 - (minY + maxY) / 2,
  };
  const projectedBoxes = projectBoxesToIsometric(filledBoxes, projection);
  const projectedEntities = projectBoxesToIsometric(entities, projection);
  // Entities with their views, to lay their silhouettes in the shadow maps.
  const casterViews: { entity: (typeof projectedEntities)[number]; views: DepthView[] }[] = [];
  const grassTextureForRender = textures.get(GRASS_BLOCK_TEXTURE_KEY);
  const groundTextureForRender = textures.get(GROUND_BLOCK_TEXTURE_KEY);
  const waterTextureForRender = textures.get(WATER_BLOCK_TEXTURE_KEY);
  const sandTextureForRender = textures.get(SAND_BLOCK_TEXTURE_KEY);

  if (grassTextureForRender && groundTextureForRender && waterTextureForRender && sandTextureForRender) {
    const texturesByMaterial: Record<TerrainMaterial, Texture> = {
      grass: grassTextureForRender,
      ground: groundTextureForRender,
      water: waterTextureForRender,
      sand: sandTextureForRender,
    };
    projectedBoxes.forEach((box) => {
      const material = getBlockMaterial(
        box.box.elevation,
        topElevationByColumn.get(box.x, box.y) as number,
        surfaces.get(box.x, box.y) as TerrainSurface,
      );
      const texture = texturesByMaterial[material];
      const tint =
        material === "water"
          ? getNegativeElevationTint(box.box.elevation)
          : getPositiveElevationTint(
              box.box.elevation,
              maxPositiveElevation,
              material === "sand" ? SAND_TOP_TINT : POSITIVE_ELEVATION_TOP_TINT,
            );
      const blockViews = createBlockViews({
        texture,
        box,
        metrics: TILE_METRICS,
        tint,
      });
      views.push(...blockViews);

      // The top of the column shows its square of the shadow map of its elevation; sand tops
      // are half a block lower than the block.
      if (box.box.elevation !== topElevationByColumn.get(box.x, box.y)) return;
      const frame = new Texture({
        source: shadowMapFor(box.box.elevation).source,
        frame: new Rectangle(
          (box.x - gridMinX) * pixelsPerTile,
          (box.y - gridMinY) * pixelsPerTile,
          pixelsPerTile,
          pixelsPerTile,
        ),
      });
      const tileTop = { x: box.screenX, y: box.screenY + (material === "sand" ? BOX_HEIGHT / 2 : 0) };
      views.push(createGroundShadowView(frame, tileTop, TILE_METRICS, blockViews[0].depth));
    });
    projectedEntities.forEach((entity) => {
      const texture = entityTexturesByEntity.get(entity.box);
      if (!texture) return;

      const entityViews = createBlockViews({
        texture,
        box: entity,
        metrics: TILE_METRICS,
        height: entity.box.height,
        surfaceAligned: true,
        length: entity.box.length,
        debug: entity.box.debug,
        lengthAxis: entity.box.lengthAxis,
      });
      views.push(...entityViews);
      casterViews.push({ entity, views: entityViews });
    });
  }

  // Every world view is created, also the ones off screen, so a moving camera reveals them.
  // Culled on demand: Pixi's `CullerPlugin` would walk every view each frame.
  views.forEach(({ view }) => {
    view.cullable = true;
  });
  addInDepthOrder(scene, views);
  const cull = () => Culler.shared.cull(scene, app.renderer.screen, false);
  cull();
  app.renderer.on("resize", cull);

  // Ambient occlusion: computed once for the whole terrain (it is static).
  const occlusionTerrain: OcclusionTerrain = {
    bounds: { minX: gridMinX, minY: gridMinY, maxX: gridMaxX, maxY: gridMaxY },
    topHeightAt: (x, y) => {
      const elevation = topElevationByColumn.get(x, y);
      if (elevation === undefined) return undefined;
      return surfaces.get(x, y) === "sand" ? elevation - 0.5 : elevation;
    },
    levelAt: (x, y) => topElevationByColumn.get(x, y),
    occupiedAt: (x, y) => world.occupancy.isOccupied(x, y),
  };

  // Silhouettes are drawn into the shadow maps, never into the scene: blurred for soft edges,
  // with the sun's opacity applied to each group as a whole so overlaps do not darken twice.
  const blurFilter = new BlurFilter({ strength: SHADOW_BLUR, quality: 2 });
  const alphaFilter = new AlphaFilter({ alpha: 1 });
  const layers: ShadowLayer[] = [...shadowMaps].map(([level, map]) => {
    const root = new Container();
    const occlusion = new Texture({
      source: new BufferImageSource({
        resource: buildOcclusionMap(occlusionTerrain, level, AO_PIXELS_PER_TILE),
        width: (gridMaxX - gridMinX + 1) * AO_PIXELS_PER_TILE,
        height: (gridMaxY - gridMinY + 1) * AO_PIXELS_PER_TILE,
      }),
    });
    const occlusionSprite = new Sprite(occlusion);
    occlusionSprite.scale.set(pixelsPerTile / AO_PIXELS_PER_TILE);
    root.addChild(occlusionSprite);

    // Casters standing on this level or higher: shadows onto higher ground are not drawn.
    const silhouettes = casterViews
      .filter(({ entity }) => entity.box.elevation >= level)
      .flatMap(({ entity, views: entityViews }) =>
        createSilhouettes(entityViews, entity, TILE_METRICS, entity.box.length, entity.box.lengthAxis ?? "x").map(
          (silhouette) => ({ silhouette, lift: entity.box.elevation - level }),
        ),
      );
    if (silhouettes.length === 0) return { map, root, occlusion, silhouettes, drawnTick: 0 };

    const casters = new Container();
    casters.filters = [blurFilter, alphaFilter];
    silhouettes.forEach(({ silhouette }) => casters.addChild(silhouette.sprite));
    root.addChild(casters);
    return { map, root, occlusion, casters, silhouettes, drawnTick: 0 };
  });

  const drawLayer = (layer: ShadowLayer, tick: number, sun: ShadowProjection | null) => {
    if (sun && layer.casters) {
      alphaFilter.alpha = sun.alpha;
      layer.silhouettes.forEach(({ silhouette, lift }) => {
        const ground = getSilhouetteMatrix(sun, silhouette.worldFoot, lift, TILE_METRICS);
        placeSilhouette(silhouette, ground, mapOrigin, pixelsPerTile);
      });
    }
    app.renderer.render({ container: layer.root, target: layer.map, clear: true, clearColor: [0, 0, 0, 0] });
    layer.drawnTick = tick;
  };

  let tintedTick: number | undefined;
  let daytime: boolean | undefined;
  const updateLight = () => {
    const tick = world.clock.tick;
    const sun = getSunState(tick);
    if (tick !== tintedTick) {
      scene.tint = rgbToTint(sun.ambient);
      tintedTick = tick;
    }

    const shadows = getShadowProjection(sun);
    const isDay = shadows !== null;
    // When built, at sunrise and at sunset: every map (casters only by day).
    if (isDay !== daytime) {
      daytime = isDay;
      layers.forEach((layer) => {
        if (layer.casters) layer.casters.visible = isDay;
        drawLayer(layer, tick, shadows);
      });
      return;
    }
    if (!shadows) return;

    // By day, one map per frame: the stalest, so no frame pays for all of them and, in turns,
    // all keep moving even when a refresh falls due on every frame.
    let stalest: ShadowLayer | undefined;
    let stalestAge = SHADOW_REFRESH_TICKS - 1;
    layers.forEach((layer) => {
      const age = Math.abs(tick - layer.drawnTick);
      if (layer.casters && age > stalestAge) {
        stalest = layer;
        stalestAge = age;
      }
    });
    if (stalest) drawLayer(stalest, tick, shadows);
  };
  updateLight();
  app.ticker.add(updateLight, undefined, UPDATE_PRIORITY.NORMAL);

  return () => {
    app.ticker.remove(updateLight, undefined);
    app.renderer.off("resize", cull);
    scene.destroy({ children: true });
    layers.forEach(({ root, occlusion }) => {
      root.destroy({ children: true });
      occlusion.destroy(true);
    });
    shadowMaps.forEach((map) => map.destroy(true));
    void Assets.unload(grassBlockSource);
    void Assets.unload(groundBlockSource);
    void Assets.unload(waterBlockSource);
    void Assets.unload(sandBlockSource);
    loadedEntitySources.forEach((source) => void Assets.unload(source));
  };
}

export default createIsometricScene;
