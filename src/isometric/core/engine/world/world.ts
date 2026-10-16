import type { EntityData, EntityDefinition, TerrainSurface } from "../../types";
import { TERRAIN_HEIGHT, TERRAIN_WIDTH } from "../constants";
import { Box, createEntitiesFromConfig, Entity, ENTITY_CONFIG } from "../entities";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed } from "../random";
import { applySpawnPlateau, classifyColumnSurfaces, generatePerlinTerrain } from "../terrain";

/**
 * The game world as plain domain state: the single source of truth that systems simulate,
 * saves serialize and the scene only renders. It has no Pixi objects and never reads
 * `window`.
 */
export type World = {
  /** Seed every generated part of the world derives from. */
  readonly seed: number;
  /** Number of columns along `x`. */
  readonly width: number;
  /** Number of columns along `y`. */
  readonly height: number;
  /** Whether the spawn area was flattened when generating the terrain. */
  readonly spawnPlateau: boolean;
  /** One terrain box per column, holding the column's top elevation. */
  readonly columns: readonly Box[];
  /** Surface of each column (top block material), keyed by `x:y`. */
  readonly surfaces: ReadonlyMap<string, TerrainSurface>;
  /** Non-terrain entities, in creation order. */
  readonly entities: readonly Entity[];
};

/** Options of {@link generateWorld}. */
export type WorldOptions = {
  /** World seed. Defaults to `DEFAULT_WORLD_SEED`. */
  seed?: number;
  /** Columns along `x`. Defaults to `TERRAIN_WIDTH`. */
  width?: number;
  /** Columns along `y`. Defaults to `TERRAIN_HEIGHT`. */
  height?: number;
  /** Flattens the centered spawn area (see `applySpawnPlateau()`). Defaults to `true`. */
  spawnPlateau?: boolean;
  /** Entity definitions to place. Defaults to `ENTITY_CONFIG`. */
  entityDefinitions?: readonly EntityDefinition[];
};

/** Version of {@link WorldSnapshot}; bump it when the snapshot shape changes. */
export const WORLD_SNAPSHOT_VERSION = 1;

/**
 * JSON-serializable save of a {@link World}. The terrain is not stored: it is regenerated
 * from `seed`, size and `spawnPlateau`. Entities are stored as data, so changes made during
 * play (removed, moved or modified entities) are kept.
 */
export type WorldSnapshot = {
  version: typeof WORLD_SNAPSHOT_VERSION;
  seed: number;
  width: number;
  height: number;
  spawnPlateau: boolean;
  entities: { x: number; y: number; data: EntityData }[];
};

type TerrainState = Pick<World, "seed" | "width" | "height" | "spawnPlateau" | "columns" | "surfaces">;

function generateTerrainState(
  seed: number,
  width: number,
  height: number,
  spawnPlateau: boolean,
): TerrainState {
  const points = generatePerlinTerrain({ width, height, seed });
  const shaped = spawnPlateau ? applySpawnPlateau(points, width, height) : points;
  const columns = shaped.map(({ x, y, elevation }) => new Box(x, y, { elevation }));

  return {
    seed,
    width,
    height,
    spawnPlateau,
    columns,
    surfaces: classifyColumnSurfaces(columns),
  };
}

/**
 * Generates a world from a seed: terrain (simplex noise, optional spawn plateau), column
 * surfaces and entities. Each system draws from its own seeded stream (`deriveSeed`), so the
 * same options always produce the same world.
 */
export function generateWorld(options: WorldOptions = {}): World {
  const terrain = generateTerrainState(
    options.seed ?? DEFAULT_WORLD_SEED,
    options.width ?? TERRAIN_WIDTH,
    options.height ?? TERRAIN_HEIGHT,
    options.spawnPlateau ?? true,
  );
  const entities = createEntitiesFromConfig(
    [...terrain.columns],
    [...(options.entityDefinitions ?? ENTITY_CONFIG)],
    createSeededRandom(deriveSeed(terrain.seed, "entities")),
    createSeededRandom(deriveSeed(terrain.seed, "entity-color-variants")),
  );

  return { ...terrain, entities };
}

/** Converts a world into a JSON-serializable {@link WorldSnapshot}. */
export function serializeWorld(world: World): WorldSnapshot {
  return {
    version: WORLD_SNAPSHOT_VERSION,
    seed: world.seed,
    width: world.width,
    height: world.height,
    spawnPlateau: world.spawnPlateau,
    entities: world.entities.map((entity) => ({ x: entity.x, y: entity.y, data: entity.getData() })),
  };
}

/**
 * Rebuilds a world from a snapshot: regenerates the terrain from its seed and restores the
 * saved entities as they were (no new entity generation).
 *
 * @throws When the snapshot version is not supported.
 */
export function restoreWorld(snapshot: WorldSnapshot): World {
  if (snapshot.version !== WORLD_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported world snapshot version ${String(snapshot.version)}`);
  }

  const terrain = generateTerrainState(
    snapshot.seed,
    snapshot.width,
    snapshot.height,
    snapshot.spawnPlateau,
  );
  const entities = snapshot.entities.map(({ x, y, data }) => Entity.fromData(x, y, data));

  return { ...terrain, entities };
}
