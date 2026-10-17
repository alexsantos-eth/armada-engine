import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Rectangle,
  RenderTexture,
  type Sprite,
  Texture,
  UPDATE_PRIORITY,
} from "pixi.js";
import type { Entity } from "../entities";
import { projectBoxesToIsometric } from "../projection";
import { fillElevations, getBlockMaterial } from "../terrain";
import type { ShadowProjection, TerrainMaterial, TerrainSurface } from "../../types";
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
import { getShadowProjection, getSilhouetteMatrix, SHADOW_REFRESH_TICKS } from "../lighting";
import {
  addInDepthOrder,
  createBlockViews,
  createGroundShadowView,
  createSilhouettes,
  createSvgColorVariant,
  type DepthView,
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

function getLevelTint(
  baseTint: number,
  levelsBelowTop: number,
  tintStep: number,
): number {
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
  return getLevelTint(
    topTint,
    levelsBelowTop,
    POSITIVE_ELEVATION_TINT_STEP,
  );
}

/**
 * Renders `world` into `app`. The scene only reads the world: it never generates or changes
 * it, so the same world can be simulated, saved or rendered again. Returns a cleanup that
 * destroys the scene, stops its per-frame updates and unloads its assets.
 *
 * Shadows are drawn onto the terrain: every entity's sprites are laid on the ground as black
 * silhouettes into a shadow map per terrain elevation (world-space render textures), and every
 * column's top shows its square of the map of its own elevation, right after its top block.
 * Every frame (from `app.ticker`, at `UPDATE_PRIORITY.NORMAL`: after the simulation, which runs
 * at `HIGH`, and before the Application renders at `LOW`) the scene lights the world for the
 * current tick, only when the tick changed: it tints the world with the sun's ambient light and,
 * every `SHADOW_REFRESH_TICKS` ticks, redraws the shadow maps (hidden at night).
 */
export async function createIsometricScene(
  app: Application,
  world: World,
): Promise<() => void> {
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
  const [grassTexture, groundTexture, waterTexture, sandTexture, ...entityTextures] = await Promise.all([
    Assets.load<Texture>(grassBlockSource),
    Assets.load<Texture>(groundBlockSource),
    Assets.load<Texture>(waterBlockSource),
    Assets.load<Texture>(sandBlockSource),
    ...entityTextureVariants.map(async ([variantKey, { entity, variation }]) => {
      const source = await createSvgColorVariant(
        entity.textureSource,
        entity.colorReplacements,
        variation,
      );
      return { variantKey, source, texture: await Assets.load<Texture>(source) };
    }),
  ]);
  textures.set(GRASS_BLOCK_TEXTURE_KEY, grassTexture);
  textures.set(GROUND_BLOCK_TEXTURE_KEY, groundTexture);
  textures.set(WATER_BLOCK_TEXTURE_KEY, waterTexture);
  textures.set(SAND_BLOCK_TEXTURE_KEY, sandTexture);
  const entityTexturesBySource = new Map(
    entityTextureVariants.map(([variantKey], index) => [
      variantKey,
      entityTextures[index]?.texture,
    ]),
  );
  const entityTexturesByEntity = new Map(
    entities.map((entity) => [
      entity,
      entityTexturesBySource.get(entityTextureKeys.get(entity) as string),
    ]),
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
  const groundShadows: Sprite[] = [];
  // Silhouettes are drawn into the shadow maps, never into the scene; blurred for soft edges.
  const casters = new Container();
  casters.filters = [new BlurFilter({ strength: SHADOW_BLUR, quality: 2 })];
  const silhouettes: { silhouette: Silhouette; elevation: number }[] = [];

  // Each world column holds its top elevation.
  const topElevationByColumn = CellMap.from(world.columns, ({ elevation }) => elevation);
  const maxPositiveElevation = filledBoxes.reduce(
    (maximum, box) => Math.max(maximum, box.elevation),
    0,
  );
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  filledBoxes.forEach((box) => {
    const screenX = (box.x - box.y) * (TILE_WIDTH / 2);
    const screenY =
      -(box.x + box.y) * (TILE_HEIGHT / 2) - box.elevation * BOX_HEIGHT;
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
  const grassTextureForRender = textures.get(GRASS_BLOCK_TEXTURE_KEY);
  const groundTextureForRender = textures.get(GROUND_BLOCK_TEXTURE_KEY);
  const waterTextureForRender = textures.get(WATER_BLOCK_TEXTURE_KEY);
  const sandTextureForRender = textures.get(SAND_BLOCK_TEXTURE_KEY);

  if (
    grassTextureForRender &&
    groundTextureForRender &&
    waterTextureForRender &&
    sandTextureForRender
  ) {
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
      const tint = material === "water"
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
      const groundShadow = createGroundShadowView(frame, tileTop, TILE_METRICS, blockViews[0].depth);
      views.push(groundShadow);
      groundShadows.push(groundShadow.view as Sprite);
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
      createSilhouettes(entityViews, entity, TILE_METRICS, entity.box.length, entity.box.lengthAxis ?? "x")
        .forEach((silhouette) => {
          casters.addChild(silhouette.sprite);
          silhouettes.push({ silhouette, elevation: entity.box.elevation });
        });
    });
  }

  // Every world view is created, also the ones off screen: Pixi's culler (`CullerPlugin`,
  // registered by the app) skips drawing them each frame, so a moving camera reveals them.
  views.forEach(({ view }) => {
    view.cullable = true;
  });
  addInDepthOrder(scene, views);

  // Each map holds the shadows falling on ground of its elevation: casters standing on that
  // ground or higher, laid further away the higher they stand (shadows onto higher ground are
  // not drawn).
  const drawShadowMaps = (projection: ShadowProjection) => {
    shadowMaps.forEach((map, level) => {
      silhouettes.forEach(({ silhouette, elevation }) => {
        if (elevation < level) {
          silhouette.sprite.visible = false;
          return;
        }
        const ground = getSilhouetteMatrix(projection, silhouette.worldFoot, elevation - level, TILE_METRICS);
        placeSilhouette(silhouette, ground, mapOrigin, pixelsPerTile);
      });
      app.renderer.render({ container: casters, target: map, clear: true, clearColor: [0, 0, 0, 0] });
    });
  };
  let shadowTick: number | undefined;
  const lightWorld = (tick: number) => {
    const sun = getSunState(tick);
    scene.tint = rgbToTint(sun.ambient);
    const projection = getShadowProjection(sun);
    if (!projection) {
      groundShadows.forEach((view) => {
        view.visible = false;
      });
      shadowTick = undefined;
      return;
    }
    if (shadowTick === undefined || Math.abs(tick - shadowTick) >= SHADOW_REFRESH_TICKS) {
      drawShadowMaps(projection);
      shadowTick = tick;
    }
    groundShadows.forEach((view) => {
      view.visible = true;
      view.alpha = projection.alpha;
    });
  };
  let litTick = world.clock.tick;
  lightWorld(litTick);
  const updateLight = () => {
    if (world.clock.tick === litTick) return;
    litTick = world.clock.tick;
    lightWorld(litTick);
  };
  app.ticker.add(updateLight, undefined, UPDATE_PRIORITY.NORMAL);

  return () => {
    app.ticker.remove(updateLight, undefined);
    scene.destroy({ children: true });
    casters.destroy({ children: true });
    shadowMaps.forEach((map) => map.destroy(true));
    void Assets.unload(grassBlockSource);
    void Assets.unload(groundBlockSource);
    void Assets.unload(waterBlockSource);
    void Assets.unload(sandBlockSource);
    loadedEntitySources.forEach((source) => void Assets.unload(source));
  };
}

export default createIsometricScene;