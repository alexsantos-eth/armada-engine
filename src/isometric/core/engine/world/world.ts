import type { EntityData, EntityDefinition, TerrainSurface } from "../../types";
import type { ReadonlyCellMap, SpatialIndex } from "../grid";
import { TERRAIN_HEIGHT, TERRAIN_WIDTH } from "../constants";
import { createEntitiesFromConfig, Entity, indexEntities, validateEntityDefinitions } from "../entities";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed } from "../random";
import { Box, classifyColumnSurfaces, generatePerlinTerrain } from "../terrain";

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
  /** One terrain box per column, holding the column's top elevation. */
  readonly columns: readonly Box[];
  /** Surface of each column (top block material). */
  readonly surfaces: ReadonlyCellMap<TerrainSurface>;
  /** Non-terrain entities, in creation order. */
  readonly entities: readonly Entity[];
  /**
   * Spatial index of `entities` over their footprints (what occupies each column). Derived
   * from `entities`: never serialized, rebuilt on restore.
   */
  readonly occupancy: SpatialIndex<Entity>;
};

/** Options of {@link generateWorld}. */
export type WorldOptions = {
  /** World seed. Defaults to `DEFAULT_WORLD_SEED`. */
  seed?: number;
  /** Columns along `x`. Defaults to `TERRAIN_WIDTH`. */
  width?: number;
  /** Columns along `y`. Defaults to `TERRAIN_HEIGHT`. */
  height?: number;
  /**
   * Entity definitions to place (game content, e.g. `ENTITY_CONFIG` from
   * `src/isometric/content`). Required: the engine ships no content of its own. They are
   * validated with `validateEntityDefinitions()` before anything is generated.
   */
  entityDefinitions: readonly EntityDefinition[];
};

/** Version of {@link WorldSnapshot}; bump it when the snapshot shape changes. */
export const WORLD_SNAPSHOT_VERSION = 2;

/**
 * JSON-serializable save of a {@link World}. The terrain is not stored: it is regenerated
 * from `seed` and size. Entities are stored as data, so changes made during
 * play (removed, moved or modified entities) are kept.
 */
export type WorldSnapshot = {
  version: typeof WORLD_SNAPSHOT_VERSION;
  seed: number;
  width: number;
  height: number;
  entities: { x: number; y: number; data: EntityData }[];
};

type TerrainState = Pick<World, "seed" | "width" | "height" | "columns" | "surfaces">;

function generateTerrainState(
  seed: number,
  width: number,
  height: number,
): TerrainState {
  const points = generatePerlinTerrain({ width, height, seed });
  const columns = points.map(({ x, y, elevation }) => new Box(x, y, { elevation }));

  return {
    seed,
    width,
    height,
    columns,
    surfaces: classifyColumnSurfaces(columns),
  };
}

/**
 * Generates a world from a seed: terrain (simplex noise), column
 * surfaces and entities. Each system draws from its own seeded stream (`deriveSeed`), so the
 * same options always produce the same world.
 *
 * @throws `EntityConfigError` when `entityDefinitions` is invalid.
 */
export function generateWorld(options: WorldOptions): World {
  validateEntityDefinitions(options.entityDefinitions);
  const terrain = generateTerrainState(
    options.seed ?? DEFAULT_WORLD_SEED,
    options.width ?? TERRAIN_WIDTH,
    options.height ?? TERRAIN_HEIGHT,
  );
  const entities = createEntitiesFromConfig(
    terrain.columns,
    options.entityDefinitions,
    createSeededRandom(deriveSeed(terrain.seed, "entities")),
    createSeededRandom(deriveSeed(terrain.seed, "entity-color-variants")),
  );

  return { ...terrain, entities, occupancy: indexEntities(entities) };
}

/** Converts a world into a JSON-serializable {@link WorldSnapshot}. */
export function serializeWorld(world: World): WorldSnapshot {
  return {
    version: WORLD_SNAPSHOT_VERSION,
    seed: world.seed,
    width: world.width,
    height: world.height,
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
  );
  const entities = snapshot.entities.map(({ x, y, data }) => Entity.fromData(x, y, data));

  return { ...terrain, entities, occupancy: indexEntities(entities) };
}
