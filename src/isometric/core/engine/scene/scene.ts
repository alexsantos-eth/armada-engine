import { Application, Assets, Container, Texture } from "pixi.js";
import { Box, createEntitiesFromConfig, Entity, ENTITY_CONFIG } from "../entities";
import { projectBoxesToIsometric } from "../board";
import { classifyColumnSurfaces, getBlockMaterial, getOrCreateTerrain } from "../terrain";
import type { TerrainMaterial, TerrainSurface } from "../../types";
import {
  BOX_HEIGHT,
  DEFAULT_MIN_ELEVATION,
  GROUND_BLOCK_TEXTURE_KEY,
  GRASS_BLOCK_TEXTURE_KEY,
  POSITIVE_ELEVATION_TINT_STEP,
  TERRAIN_HEIGHT,
  TERRAIN_WIDTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  NEGATIVE_ELEVATION_TINT_STEP,
  SAND_BLOCK_TEXTURE_KEY,
  WATER_BLOCK_TEXTURE_KEY,
} from "../constants";
import { fillElevations, isWithinViewport } from "../projection";
import {
  createSeededRandom,
  DEFAULT_WORLD_SEED,
  deriveSeed,
  type RandomSource,
} from "../random";
import { createSvgColorVariant, pickColorVariation, renderBlock } from "../render";

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

/** Creates the entities of a world from its terrain columns and a seeded random source. */
export type EntityFactory = (boxes: Box[], random: RandomSource) => Entity[];

/** Options of {@link createIsometricScene}. */
export type IsometricSceneOptions = {
  /**
   * World seed. Terrain, entity placement and color variants all derive from it, so the
   * same seed rebuilds the same world. Defaults to `DEFAULT_WORLD_SEED`.
   */
  seed?: number;
  /** Entity factory; defaults to `createEntitiesFromConfig()` with `ENTITY_CONFIG`. */
  createEntities?: EntityFactory;
};

const createConfiguredEntities: EntityFactory = (boxes, random) =>
  createEntitiesFromConfig(boxes, ENTITY_CONFIG, random);

/**
 * Builds the world for `options.seed` and renders it into `app`. Returns a cleanup that
 * destroys the scene and unloads its assets.
 */
export async function createIsometricScene(
  app: Application,
  options: IsometricSceneOptions = {},
): Promise<() => void> {
  const seed = options.seed ?? DEFAULT_WORLD_SEED;
  const createEntities = options.createEntities ?? createConfiguredEntities;
  const grassBlockSource = "/assets/grass/block.svg";
  const groundBlockSource = "/assets/ground/block.svg";
  const waterBlockSource = "/assets/water/block.svg";
  const sandBlockSource = "/assets/sand/block.svg";

  const terrain = getOrCreateTerrain(seed);
  const boxes = terrain.map(
    (row) => new Box(row.x, row.y, { elevation: row.elevation }),
  );
  const centerX = Math.floor(TERRAIN_WIDTH / 2);
  const centerY = Math.floor(TERRAIN_HEIGHT / 2);
  const centralBlockSize = Math.max(4, Math.min(8, TERRAIN_WIDTH - 2));
  const halfSize = Math.floor(centralBlockSize / 2);
  const startX = centerX - halfSize;
  const startY = centerY - halfSize;
  const endX = startX + centralBlockSize;
  const endY = startY + centralBlockSize;

  boxes.forEach((box) => {
    const central =
      box.x >= startX &&
      box.x < endX &&
      box.y >= startY &&
      box.y < endY;
    if (central) {
      box.update({ elevation: box.y === startY || box.x === startX ? 1 : 0 });
    }
  });

  const filledBoxes = fillElevations(boxes, DEFAULT_MIN_ELEVATION);
  const entities = createEntities(
    boxes,
    createSeededRandom(deriveSeed(seed, "entities")),
  );
  // One texture per (entity type, color variation): instances share it instead of each
  // fetching and decoding its own SVG. Types without `colorReplacements` share their source.
  const variantRandom = createSeededRandom(deriveSeed(seed, "entity-color-variants"));
  const entityTextureKeys = new Map<Entity, string>();
  const entityTextureVariants = [
    ...new Map(
      entities.map((entity) => {
        const variation = pickColorVariation(entity.colorReplacements, variantRandom);
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

  const scene = new Container();
  scene.sortableChildren = true;
  app.stage.addChild(scene);

  const topElevationByColumn = new Map<string, number>();
  filledBoxes.forEach((box) => {
    const columnKey = `${box.x}:${box.y}`;
    const currentTop = topElevationByColumn.get(columnKey);
    topElevationByColumn.set(
      columnKey,
      Math.max(currentTop ?? -Infinity, box.elevation),
    );
  });
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
  const surfaces = classifyColumnSurfaces(filledBoxes);

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
    projectedBoxes
      .filter((box) =>
        isWithinViewport(
          box.screenX,
          box.screenY,
          app.screen.width,
          app.screen.height,
        ),
      )
      .forEach((box) => {
        const columnKey = `${box.x}:${box.y}`;
        const material = getBlockMaterial(
          box.box.elevation,
          topElevationByColumn.get(columnKey) as number,
          surfaces.get(columnKey) as TerrainSurface,
        );
        const texture = texturesByMaterial[material];
        const tint = material === "water"
          ? getNegativeElevationTint(box.box.elevation)
          : getPositiveElevationTint(
              box.box.elevation,
              maxPositiveElevation,
              material === "sand" ? SAND_TOP_TINT : POSITIVE_ELEVATION_TOP_TINT,
            );
        renderBlock(
          scene,
          texture,
          box,
          TILE_WIDTH,
          TILE_HEIGHT,
          BOX_HEIGHT,
          tint,
        );
      });
    projectedEntities
      .filter((entity) =>
        isWithinViewport(
          entity.screenX,
          entity.screenY,
          app.screen.width,
          app.screen.height,
        ),
      )
      .forEach((entity) => {
        const texture = entityTexturesByEntity.get(entity.box);
        if (!texture) return;

        renderBlock(
          scene,
          texture,
          entity,
          TILE_WIDTH,
          TILE_HEIGHT,
          BOX_HEIGHT,
          undefined,
          entity.box.height,
          true,
          entity.box.length,
          entity.box.debug,
          entity.box.lengthAxis,
        );
      });
  }

  return () => {
    scene.destroy({ children: true });
    void Assets.unload(grassBlockSource);
    void Assets.unload(groundBlockSource);
    void Assets.unload(waterBlockSource);
    void Assets.unload(sandBlockSource);
    loadedEntitySources.forEach((source) => void Assets.unload(source));
  };
}

export default createIsometricScene;