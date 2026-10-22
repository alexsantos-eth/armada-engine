import type { EntityData, EntityDefinition, WorldClock } from "../../types";
import type { SpatialIndex } from "../grid";
import { TERRAIN_HEIGHT, TERRAIN_WIDTH } from "../constants";
import { createEntitiesFromConfig, Entity, indexEntities, validateEntityDefinitions } from "../entities";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed } from "../random";
import { type Box, createTerrainColumns, generatePerlinTerrain } from "../terrain";
import { createWorldClock, WORLD_START_TICK } from "../time";

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
  /**
   * One terrain box per column, holding the column's top elevation and, as its `type`, the
   * column's surface (`grass`, `water` or `sand`), classified once at generation.
   */
  readonly columns: readonly Box[];
  /** Non-terrain entities, in creation order. */
  readonly entities: readonly Entity[];
  /**
   * Spatial index of `entities` over their footprints (what occupies each column). Derived
   * from `entities`: never serialized, rebuilt on restore.
   */
  readonly occupancy: SpatialIndex<Entity>;
  /**
   * Game clock. Only the fixed simulation step advances it (`advanceClock(world.clock)`);
   * time of day and sunlight are derived from its tick with `getSunState()`.
   */
  readonly clock: WorldClock;
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
  /** Tick the game clock starts at. Defaults to `WORLD_START_TICK` (08:00 of day 0). */
  startTick?: number;
};

/** Version of {@link WorldSnapshot}; bump it when the snapshot shape changes. */
export const WORLD_SNAPSHOT_VERSION = 3;

/**
 * JSON-serializable save of a {@link World}. The terrain is not stored: it is regenerated
 * from `seed` and size. Entities are stored as data, so changes made during
 * play (removed, moved or modified entities) are kept, and so is the game time (`tick`).
 */
export type WorldSnapshot = {
  version: typeof WORLD_SNAPSHOT_VERSION;
  seed: number;
  width: number;
  height: number;
  tick: number;
  entities: { x: number; y: number; data: EntityData }[];
};

type TerrainState = Pick<World, "seed" | "width" | "height" | "columns">;

function generateTerrainState(seed: number, width: number, height: number): TerrainState {
  return {
    seed,
    width,
    height,
    columns: createTerrainColumns(generatePerlinTerrain({ width, height, seed })),
  };
}

/**
 * Generates a world from a seed: terrain (simplex noise) with each column typed with its
 * surface, and entities. Each system draws from its own seeded stream (`deriveSeed`), so the
 * same options always produce the same world.
 *
 * @throws `EntityConfigError` when `entityDefinitions` is invalid.
 * @throws `RangeError` when `startTick` is not a non-negative safe integer.
 */
export function generateWorld(options: WorldOptions): World {
  validateEntityDefinitions(options.entityDefinitions);
  const clock = createWorldClock(options.startTick ?? WORLD_START_TICK);
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

  return { ...terrain, entities, occupancy: indexEntities(entities), clock };
}

/** Converts a world into a JSON-serializable {@link WorldSnapshot}. */
export function serializeWorld(world: World): WorldSnapshot {
  return {
    version: WORLD_SNAPSHOT_VERSION,
    seed: world.seed,
    width: world.width,
    height: world.height,
    tick: world.clock.tick,
    entities: world.entities.map((entity) => ({ x: entity.x, y: entity.y, data: entity.getData() })),
  };
}

/**
 * Rebuilds a world from a snapshot: regenerates the terrain from its seed and restores the
 * saved entities and game time as they were (no new entity generation).
 *
 * @throws When the snapshot version is not supported.
 * @throws `RangeError` when the saved tick is not a non-negative safe integer.
 */
export function restoreWorld(snapshot: WorldSnapshot): World {
  if (snapshot.version !== WORLD_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported world snapshot version ${String(snapshot.version)}`);
  }

  const clock = createWorldClock(snapshot.tick);
  const terrain = generateTerrainState(snapshot.seed, snapshot.width, snapshot.height);
  const entities = snapshot.entities.map(({ x, y, data }) => Entity.fromData(x, y, data));

  return { ...terrain, entities, occupancy: indexEntities(entities), clock };
}
