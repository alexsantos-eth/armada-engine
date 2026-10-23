import type { EntityData, EntityDefinition, WorldPart } from "../../types";
import { CellMap, type ReadonlyCellMap, type SpatialIndex } from "../grid";
import { createEntitiesFromConfig, Entity, indexEntities, validateEntityDefinitions } from "../entities";
import { type SavedWorldParts, WorldParts } from "../parts";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed } from "../random";
import { type Box, createTerrainColumns, generatePerlinTerrain } from "../terrain";

/** Columns along `x` of a generated world when `generateWorld()` gets no `width`. */
export const TERRAIN_WIDTH = 32;
/** Columns along `y` of a generated world when `generateWorld()` gets no `height`. */
export const TERRAIN_HEIGHT = 32;

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
  /** `columns` by cell, for lookups by position. Derived: never serialized, rebuilt on restore. */
  readonly columnIndex: ReadonlyCellMap<Box>;
  /** Non-terrain entities, in creation order. */
  readonly entities: readonly Entity[];
  /**
   * Spatial index of `entities` over their footprints (what occupies each column). Derived
   * from `entities`: never serialized, rebuilt on restore.
   */
  readonly occupancy: SpatialIndex<Entity>;
  /**
   * State owned by game systems, one {@link WorldPart} each, read by key: the game clock
   * (`world.parts.get(CLOCK_PART)`), the player (`PLAYER_PART`), later weather or needs. The app
   * registers them (`generateWorld({ parts })`); each one saves and restores itself, so a new
   * system with state never edits this type nor the snapshot.
   */
  readonly parts: WorldParts;
};

/**
 * What a world part gets to create or restore its state: the rest of the world (terrain and
 * entities), never other parts.
 */
export type WorldPartContext = Omit<World, "parts">;

/** A world part the world can hold: one that creates its state from a {@link WorldPartContext}. */
export type WorldPartOf = WorldPart<unknown, unknown, WorldPartContext>;

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
  /**
   * Parts of world state the game's systems own (e.g. `createClockPart(startTick)`,
   * `createPlayerPart()`), created in this order after the terrain and entities. Defaults to none.
   */
  parts?: readonly WorldPartOf[];
};

/**
 * Version of the {@link WorldSnapshot} envelope; bump it when the envelope's shape changes. A
 * part's saved data has a version of its own (`WorldPart.version`), so changing a part never
 * bumps this one.
 */
export const WORLD_SNAPSHOT_VERSION = 5;

/**
 * JSON-serializable save of a {@link World}. The terrain is not stored: it is regenerated
 * from `seed` and size. Entities are stored as data, so changes made during play (removed,
 * moved or modified entities) are kept. Each world part is stored under its id with its own
 * version (`parts`): the game time, where the player stands, and whatever parts come later.
 */
export type WorldSnapshot = {
  version: typeof WORLD_SNAPSHOT_VERSION;
  seed: number;
  width: number;
  height: number;
  entities: { x: number; y: number; data: EntityData }[];
  parts: SavedWorldParts;
};

type TerrainState = Pick<World, "seed" | "width" | "height" | "columns" | "columnIndex">;

function generateTerrainState(seed: number, width: number, height: number): TerrainState {
  const columns = createTerrainColumns(generatePerlinTerrain({ width, height, seed }));
  return { seed, width, height, columns, columnIndex: CellMap.from(columns, (column) => column) };
}

/**
 * Generates a world from a seed: terrain (simplex noise) with each column typed with its
 * surface, entities, then the state of each part in `options.parts`. Each system draws from
 * its own seeded stream (`deriveSeed`), so the same options always produce the same world.
 *
 * @throws `EntityConfigError` when `entityDefinitions` is invalid.
 * @throws When two parts share an id.
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

  const base: WorldPartContext = { ...terrain, entities, occupancy: indexEntities(entities) };
  return { ...base, parts: WorldParts.create(options.parts ?? [], base) };
}

/** Converts a world into a JSON-serializable {@link WorldSnapshot}. */
export function serializeWorld(world: World): WorldSnapshot {
  return {
    version: WORLD_SNAPSHOT_VERSION,
    seed: world.seed,
    width: world.width,
    height: world.height,
    entities: world.entities.map((entity) => ({ x: entity.x, y: entity.y, data: entity.getData() })),
    parts: world.parts.serialize(),
  };
}

/**
 * Rebuilds a world from a snapshot: regenerates the terrain from its seed, restores the saved
 * entities as they were (no new entity generation), then each part in `parts` from its saved
 * data. Pass the same parts the world was generated with: a part with no saved data gets a new
 * state, and saved data of a part not passed is kept untouched for the next save
 * (`WorldParts.restore()`).
 *
 * @throws When the snapshot version, or the version of a saved part, is not supported.
 * @throws When two parts share an id, or a part rejects its saved data.
 */
export function restoreWorld(snapshot: WorldSnapshot, parts: readonly WorldPartOf[] = []): World {
  if (snapshot.version !== WORLD_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported world snapshot version ${String(snapshot.version)}`);
  }

  const terrain = generateTerrainState(snapshot.seed, snapshot.width, snapshot.height);
  const entities = snapshot.entities.map(({ x, y, data }) => Entity.fromData(x, y, data));

  const base: WorldPartContext = { ...terrain, entities, occupancy: indexEntities(entities) };
  return { ...base, parts: WorldParts.restore(parts, snapshot.parts, base) };
}
