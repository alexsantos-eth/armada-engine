import type { EntityDefinition, GridPoint, WorldPart, WorldRect } from "../../types";
import type { Entity } from "../entities";
import { fingerprintEntityDefinitions, validateEntityDefinitions } from "../entities";
import { CHUNK_SIZE, type ReadonlyCellMap, SpatialIndex } from "../grid";
import { type SavedWorldParts, WorldParts } from "../parts";
import { DEFAULT_WORLD_SEED } from "../random";
import type { Box } from "../terrain";
import { type ChunkSource, type SavedChunk, WorldChunks } from "./chunks";
import { createSeededChunkSource } from "./sources";

/**
 * The game world as plain domain state: the single source of truth that systems simulate,
 * saves serialize and the scene only renders. It has no Pixi objects and never reads
 * `window`.
 *
 * The world is made of chunks of `CHUNK_SIZE` × `CHUNK_SIZE` columns, generated from the seed
 * when they are loaded (`chunks.stream()`, around the camera and the player) and dropped when
 * they are far; it may be unbounded. Lookups by position (`columnIndex`, `occupancy`) cover the
 * loaded chunks; `movers`, what moves.
 */
export type World = {
  /** Seed every generated part of the world derives from. */
  readonly seed: number;
  /** Columns of a bounded world (inclusive), or `undefined` when it has no edge. */
  readonly bounds: WorldRect | undefined;
  /** Where a new world starts (the player spawns near it): the centre of its bounds, or of chunk `(0, 0)`. */
  readonly centre: GridPoint;
  /** The loaded chunks: their terrain and entities, loaded and unloaded as the game needs them. */
  readonly chunks: WorldChunks;
  /**
   * Top terrain box of every loaded column: its elevation and, as `type`, its surface (`grass`,
   * `water` or `sand`), classified once at generation. Derived: never serialized.
   */
  readonly columnIndex: ReadonlyCellMap<Box>;
  /**
   * What occupies each loaded column: the entities of the loaded chunks over their footprints.
   * Derived: never serialized. Change entities per chunk (`chunks.setEntities()`).
   */
  readonly occupancy: SpatialIndex<Entity>;
  /**
   * What moves through the world (the player, later creatures), over the columns it stands on,
   * apart from the entities that never move (`occupancy`). Each system keeps its own movers in it
   * as they change column (`movers.move()`); it starts empty. Derived: never serialized.
   */
  readonly movers: SpatialIndex<object>;
  /**
   * State owned by game systems, one {@link WorldPart} each, read by key: the game clock
   * (`world.parts.get(CLOCK_PART)`), the player (`PLAYER_PART`), later weather or needs. The app
   * registers them (`generateWorld({ parts })`); each one saves and restores itself, so a new
   * system with state never edits this type nor the snapshot.
   */
  readonly parts: WorldParts;
  /**
   * Fingerprint of the entity definitions the untouched chunks are generated with
   * (`fingerprintEntityDefinitions()`), saved with the world; `""` for a world built from a
   * hand-made source.
   */
  readonly contentFingerprint: string;
  /**
   * Whether the world was restored from a save made with other entity definitions (a content
   * update). It is restored all the same: its untouched chunks are generated with the current
   * definitions, its edited ones keep their saved entities, and the player is moved off anything
   * that now stands on its spot. The game may tell the player.
   */
  readonly contentChanged: boolean;
};

/**
 * What a world part gets to create or restore its state: the rest of the world (terrain and
 * entities, and loading the chunks it needs), never other parts.
 */
export type WorldPartContext = Omit<World, "parts">;

/** A world part the world can hold: one that creates its state from a {@link WorldPartContext}. */
export type WorldPartOf = WorldPart<unknown, unknown, WorldPartContext>;

/** Size of a bounded world, in columns from `(0, 0)`. */
export type WorldSize = {
  readonly width: number;
  readonly height: number;
};

/** Options of {@link generateWorld}. */
export type WorldOptions = {
  /** World seed. Defaults to `DEFAULT_WORLD_SEED`. */
  seed?: number;
  /**
   * Bounds the world to `width` × `height` columns from `(0, 0)`. Defaults to an unbounded world,
   * streamed by chunks.
   */
  size?: WorldSize;
  /**
   * Entity definitions to place (game content, e.g. `ENTITY_CONFIG` from
   * `src/isometric/content`). Required: the engine ships no content of its own. They are
   * validated with `validateEntityDefinitions()` before anything is generated.
   */
  entityDefinitions: readonly EntityDefinition[];
  /**
   * Parts of world state the game's systems own (e.g. `createClockPart(startTick)`,
   * `createPlayerPart()`), created in this order after the first chunks. Defaults to none.
   */
  parts?: readonly WorldPartOf[];
};

/** Options of {@link createWorld}. */
export type CreateWorldOptions = {
  readonly seed: number;
  readonly source: ChunkSource;
  readonly bounds?: WorldRect;
  /** Defaults to the centre of `bounds`, or of chunk `(0, 0)`. */
  readonly centre?: GridPoint;
  /** Edited chunks of a save. */
  readonly saved?: readonly SavedChunk[];
  /** Fingerprint of the content `source` generates with (`World.contentFingerprint`). Defaults to `""`. */
  readonly contentFingerprint?: string;
  /** Content fingerprint of a save: when it differs from `contentFingerprint`, `contentChanged` is set. */
  readonly savedContentFingerprint?: string;
  readonly parts?: readonly WorldPartOf[];
  /** Saved parts: the parts are restored from them instead of created. */
  readonly savedParts?: SavedWorldParts;
};

/** Chunks loaded around the centre before the parts are created: where the player spawns. */
export const START_LOAD_RADIUS = 1;

/**
 * Version of the {@link WorldSnapshot} envelope; bump it when the envelope's shape changes. A
 * part's saved data has a version of its own (`WorldPart.version`), so changing a part never
 * bumps this one.
 */
export const WORLD_SNAPSHOT_VERSION = 7;

/**
 * JSON-serializable save of a {@link World}. Terrain and untouched entities are not stored: they
 * are regenerated, chunk by chunk, from `seed`, `size` and the entity definitions. Only edited
 * chunks keep their entities (`chunks`), so changes made during play are kept. Each world part
 * is stored under its id with its own version (`parts`). `contentFingerprint` records the entity
 * definitions the world was generated with, so restoring it with other ones is detected
 * (`World.contentChanged`) and the world is regenerated with the current ones.
 */
export type WorldSnapshot = {
  version: typeof WORLD_SNAPSHOT_VERSION;
  seed: number;
  /** Size of a bounded world, or `null` for an unbounded one. */
  size: WorldSize | null;
  /** Fingerprint of the entity definitions the world was generated with (`fingerprintEntityDefinitions()`). */
  contentFingerprint: string;
  chunks: SavedChunk[];
  parts: SavedWorldParts;
};

/** Options of {@link restoreWorld}. */
export type RestoreWorldOptions = {
  /** The entity definitions the world was generated with: untouched chunks are generated again. */
  readonly entityDefinitions: readonly EntityDefinition[];
  /** The parts the world was generated with. Defaults to none. */
  readonly parts?: readonly WorldPartOf[];
};

const boundsOf = (size: WorldSize | null | undefined): WorldRect | undefined =>
  size ? { minX: 0, minY: 0, maxX: size.width - 1, maxY: size.height - 1 } : undefined;

/**
 * Builds a world from a {@link ChunkSource}: loads the chunks around its centre
 * ({@link START_LOAD_RADIUS}), then creates its parts, or restores them from `savedParts`.
 * `generateWorld()` and `restoreWorld()` use it with chunks generated from the seed; tools and
 * tests may give it hand-made chunks (`createFixedChunkSource()`).
 *
 * @throws When two parts share an id, or a part rejects its saved data.
 */
export function createWorld(options: CreateWorldOptions): World {
  const { bounds } = options;
  const middle = (CHUNK_SIZE - 1) / 2;
  const centre =
    options.centre ??
    (bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: middle, y: middle });
  const chunks = new WorldChunks(options.source, options.saved);
  chunks.loadAround(centre, START_LOAD_RADIUS);

  const contentFingerprint = options.contentFingerprint ?? "";
  const { savedContentFingerprint } = options;
  const base: WorldPartContext = {
    seed: options.seed,
    bounds,
    centre,
    chunks,
    columnIndex: chunks.columnIndex,
    occupancy: chunks.occupancy,
    movers: new SpatialIndex<object>(),
    contentFingerprint,
    contentChanged: savedContentFingerprint !== undefined && savedContentFingerprint !== contentFingerprint,
  };
  const parts = options.parts ?? [];
  return {
    ...base,
    parts: options.savedParts ? WorldParts.restore(parts, options.savedParts, base) : WorldParts.create(parts, base),
  };
}

/**
 * Generates a world from a seed: chunks of terrain (simplex noise) with each column typed with
 * its surface and their entities (`createSeededChunkSource()`), the first ones around the centre,
 * then the state of each part in `options.parts`. Each system draws from its own seeded stream
 * (`deriveSeed`), so the same options always produce the same world.
 *
 * @throws `EntityConfigError` when `entityDefinitions` is invalid.
 * @throws When two parts share an id.
 */
export function generateWorld(options: WorldOptions): World {
  validateEntityDefinitions(options.entityDefinitions);
  const seed = options.seed ?? DEFAULT_WORLD_SEED;
  const bounds = boundsOf(options.size);
  return createWorld({
    seed,
    bounds,
    source: createSeededChunkSource({ seed, entityDefinitions: options.entityDefinitions, bounds }),
    contentFingerprint: fingerprintEntityDefinitions(options.entityDefinitions),
    parts: options.parts,
  });
}

/** Converts a world into a JSON-serializable {@link WorldSnapshot}. */
export function serializeWorld(world: World): WorldSnapshot {
  const { bounds } = world;
  return {
    version: WORLD_SNAPSHOT_VERSION,
    seed: world.seed,
    size: bounds ? { width: bounds.maxX - bounds.minX + 1, height: bounds.maxY - bounds.minY + 1 } : null,
    contentFingerprint: world.contentFingerprint,
    chunks: world.chunks.serialize(),
    parts: world.parts.serialize(),
  };
}

/**
 * Rebuilds a world from a snapshot: the same chunk source (seed, size and the current entity
 * definitions), the edited chunks with their saved entities, then each part in `options.parts`
 * from its saved data. When the definitions are not the ones the world was generated with (their
 * fingerprint differs from `snapshot.contentFingerprint`), the world is regenerated with the
 * current ones: the untouched chunks come out as the new content makes them, `contentChanged` is
 * set, the player is moved off anything now standing on its spot, and the next save records the
 * new fingerprint. Pass the same parts the world was generated
 * with: a part with no saved data gets a new state, and saved data of a part not passed is kept
 * untouched for the next save (`WorldParts.restore()`).
 *
 * @throws When the snapshot version, or the version of a saved part, is not supported.
 * @throws `EntityConfigError` when `entityDefinitions` is invalid.
 * @throws When two parts share an id, or a part rejects its saved data.
 */
export function restoreWorld(snapshot: WorldSnapshot, options: RestoreWorldOptions): World {
  if (snapshot.version !== WORLD_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported world snapshot version ${String(snapshot.version)}`);
  }
  validateEntityDefinitions(options.entityDefinitions);

  const bounds = boundsOf(snapshot.size);
  return createWorld({
    seed: snapshot.seed,
    bounds,
    source: createSeededChunkSource({ seed: snapshot.seed, entityDefinitions: options.entityDefinitions, bounds }),
    contentFingerprint: fingerprintEntityDefinitions(options.entityDefinitions),
    savedContentFingerprint: snapshot.contentFingerprint,
    saved: snapshot.chunks,
    parts: options.parts,
    savedParts: snapshot.parts,
  });
}
