import type { ChunkCoord, ChunkKey, EntityData, GridPoint, WorldRect } from "../../types";
import { Entity, getEntityFootprint } from "../entities";
import {
  CellMap,
  chunkFromKey,
  chunkKey,
  chunkRect,
  chunksAround,
  type ReadonlyCellMap,
  SpatialIndex,
  toChunkCoord,
} from "../grid";
import type { Box } from "../terrain";

/** What one chunk holds when it is generated: its terrain columns and its entities. */
export type ChunkContent = {
  /** One box per column of the chunk (top elevation and, as `type`, its surface). */
  readonly columns: readonly Box[];
  /** Entities anchored in the chunk, in creation order. */
  readonly entities: readonly Entity[];
};

/**
 * Where the chunks of a world come from. Generating a chunk is deterministic, so a chunk that is
 * unloaded and loaded again is the same (`createSeededChunkSource()` derives it from the seed).
 */
export type ChunkSource = {
  /** Whether the world has chunk `coord` at all: a bounded world has none past its edge. */
  has(coord: ChunkCoord): boolean;
  /** Generates chunk `coord`, one the world {@link has}. */
  generate(coord: ChunkCoord): ChunkContent;
};

/** A loaded chunk of the world. */
export type WorldChunk = {
  readonly coord: ChunkCoord;
  readonly key: ChunkKey;
  /** World columns the chunk covers (some may be missing at the edge of a bounded world). */
  readonly rect: WorldRect;
  readonly columns: readonly Box[];
  /** Entities anchored in the chunk: generated, or the edited ones (`setEntities()`). */
  readonly entities: readonly Entity[];
};

/** An entity as saved: where it is anchored, and its data. */
export type SavedEntity = { readonly x: number; readonly y: number; readonly data: EntityData };

/** The entities of an edited chunk, as saved: they replace the generated ones on load. */
export type SavedChunk = {
  readonly cx: number;
  readonly cy: number;
  readonly entities: readonly SavedEntity[];
};

/** Chunks loaded around each focus chunk (`stream()`): the ring a shown chunk needs for its edges. */
export const CHUNK_LOAD_RADIUS = 1;

/**
 * Chunks the game loads ahead around each focus chunk (`stream()` with `prefetchRadius`), with
 * the load budget the needed ones leave: the ground is generated a few frames before the camera
 * reaches it, never all at once.
 */
export const CHUNK_PREFETCH_RADIUS = 2;

/**
 * Chunks kept loaded around each focus chunk (`stream()`), past those loaded ahead: a chunk is
 * unloaded only once it is further than this from every focus, so a focus going back and forth
 * over a chunk edge does not unload and generate the same chunks again (hysteresis).
 */
export const CHUNK_KEEP_RADIUS = 3;

/**
 * Chunks the game generates per frame (`stream()` with `maxLoads`): generating one takes some
 * milliseconds, and a camera crossing a chunk edge needs a whole row of them.
 */
export const CHUNKS_LOADED_PER_FRAME = 2;

/** What one `stream()` call did. */
export type ChunkStreamResult = {
  readonly loaded: readonly ChunkCoord[];
  readonly unloaded: readonly ChunkCoord[];
  /** Chunks within `loadRadius` of a focus left to load: the budget ran out first. */
  readonly pending: number;
};

/** Options of {@link WorldChunks.stream}. */
export type ChunkStreamOptions = {
  /** Chunks needed around each focus. Defaults to {@link CHUNK_LOAD_RADIUS}. */
  readonly loadRadius?: number;
  /**
   * Chunks loaded ahead around each focus once the needed ones are in, within the budget. Defaults
   * to `loadRadius` (none ahead); the game passes {@link CHUNK_PREFETCH_RADIUS}.
   */
  readonly prefetchRadius?: number;
  /** Defaults to {@link CHUNK_KEEP_RADIUS}; never under `loadRadius` nor `prefetchRadius`. */
  readonly keepRadius?: number;
  /**
   * Most chunks loaded by this call (needed ones first). Defaults to no limit; the game passes
   * {@link CHUNKS_LOADED_PER_FRAME} on every frame.
   */
  readonly maxLoads?: number;
};

/** Chunk of the column nearest the ground point `point`. */
export function chunkOfPoint(point: GridPoint): ChunkCoord {
  return toChunkCoord({ x: Math.round(point.x), y: Math.round(point.y) });
}

/**
 * The chunks of a world that are in memory, and the lookups over them: the terrain column of each
 * loaded cell (`columnIndex`) and what occupies it (`occupancy`), both kept in sync as chunks load
 * and unload. Chunks come from a {@link ChunkSource}; which ones are loaded is decided from outside
 * (`stream()`, around the camera and the player), never by the chunks themselves.
 *
 * Entities changed during play are set per chunk (`setEntities()`): the chunk is then edited, keeps
 * those entities when it is unloaded and loaded again, and is the only kind of chunk saved
 * (`serialize()`): the rest is regenerated from the source.
 */
export class WorldChunks {
  private readonly source: ChunkSource;
  private readonly loaded = new Map<ChunkKey, WorldChunk>();
  /** Entities of the edited chunks, loaded or not. */
  private readonly edits = new Map<ChunkKey, readonly Entity[]>();
  private readonly columns = new CellMap<Box>();
  private readonly index = new SpatialIndex<Entity>();

  /** @param saved Edited chunks of a save (`serialize()`): loaded with their saved entities. */
  constructor(source: ChunkSource, saved: readonly SavedChunk[] = []) {
    this.source = source;
    saved.forEach(({ cx, cy, entities }) =>
      this.edits.set(
        chunkKey(cx, cy),
        entities.map(({ x, y, data }) => Entity.fromData(x, y, data)),
      ),
    );
  }

  /** Terrain column of every loaded cell. Derived: rebuilt as chunks load, never saved. */
  get columnIndex(): ReadonlyCellMap<Box> {
    return this.columns;
  }

  /**
   * What occupies each loaded cell: the entities of the loaded chunks over their whole footprints.
   * Derived: rebuilt as chunks load, never saved. Change entities with `setEntities()`, not here.
   */
  get occupancy(): SpatialIndex<Entity> {
    return this.index;
  }

  /** Number of loaded chunks. */
  get size(): number {
    return this.loaded.size;
  }

  /** The loaded chunks, in load order. */
  values(): IterableIterator<WorldChunk> {
    return this.loaded.values();
  }

  /** Whether chunk `coord` is loaded. */
  has({ cx, cy }: ChunkCoord): boolean {
    return this.loaded.has(chunkKey(cx, cy));
  }

  /** Chunk `coord`, or `undefined` when it is not loaded. */
  get({ cx, cy }: ChunkCoord): WorldChunk | undefined {
    return this.loaded.get(chunkKey(cx, cy));
  }

  /** Whether the world has chunk `coord`, loaded or not. */
  exists(coord: ChunkCoord): boolean {
    return this.source.has(coord);
  }

  /**
   * Whether chunk `coord` is loaded with all of its eight neighbours that exist: what the edges of
   * its terrain (hidden blocks, ambient occlusion) and its shadows need to be drawn.
   */
  isReady(coord: ChunkCoord): boolean {
    return this.has(coord) && chunksAround(coord, 1).every((near) => this.has(near) || !this.exists(near));
  }

  /**
   * Loads chunk `coord` (generated, or with its edited entities) and indexes its columns and
   * entities. Does nothing when it is loaded already.
   *
   * @returns The chunk, or `undefined` when the world has no such chunk.
   */
  load(coord: ChunkCoord): WorldChunk | undefined {
    const key = chunkKey(coord.cx, coord.cy);
    const existing = this.loaded.get(key);
    if (existing) return existing;
    if (!this.source.has(coord)) return undefined;

    const content = this.source.generate(coord);
    const chunk: WorldChunk = {
      coord: { cx: coord.cx, cy: coord.cy },
      key,
      rect: chunkRect(coord),
      columns: content.columns,
      entities: this.edits.get(key) ?? content.entities,
    };
    this.loaded.set(key, chunk);
    chunk.columns.forEach((column) => this.columns.set(column.x, column.y, column));
    chunk.entities.forEach((entity) => this.index.insert(entity, getEntityFootprint(entity)));
    return chunk;
  }

  /**
   * Unloads chunk `coord`: its columns and entities leave the lookups. An edited chunk keeps its
   * entities for the next load and the next save.
   *
   * @returns Whether it was loaded.
   */
  unload(coord: ChunkCoord): boolean {
    const chunk = this.get(coord);
    if (!chunk) return false;
    chunk.columns.forEach((column) => this.columns.delete(column.x, column.y));
    chunk.entities.forEach((entity) => this.index.remove(entity));
    this.loaded.delete(chunk.key);
    return true;
  }

  /** Loads the chunks within `radius` chunks of the one under the ground point `point`. */
  loadAround(point: GridPoint, radius: number = CHUNK_LOAD_RADIUS): void {
    chunksAround(chunkOfPoint(point), radius).forEach((coord) => this.load(coord));
  }

  /**
   * Keeps the chunks around `focus` loaded (what the camera sees, where the player stands, most
   * important first): unloads, first, every loaded chunk further than `keepRadius` from all of
   * them; then loads, in focus order, the chunks within `loadRadius` of a focus chunk and, after
   * all of those, the ones within `prefetchRadius`, at most `maxLoads` in all. Called on every
   * frame with a budget, it spreads generation over frames and loads ahead of the camera in the
   * frames that need nothing else.
   */
  stream(focus: Iterable<ChunkCoord>, options: ChunkStreamOptions = {}): ChunkStreamResult {
    const loadRadius = options.loadRadius ?? CHUNK_LOAD_RADIUS;
    const prefetchRadius = Math.max(loadRadius, options.prefetchRadius ?? loadRadius);
    const keepRadius = Math.max(prefetchRadius, options.keepRadius ?? CHUNK_KEEP_RADIUS);
    let budget = options.maxLoads ?? Infinity;
    const centres = [...focus];
    const near = (coord: ChunkCoord) =>
      centres.some(({ cx, cy }) => Math.max(Math.abs(coord.cx - cx), Math.abs(coord.cy - cy)) <= keepRadius);

    const unloaded = [...this.loaded.values()].filter(({ coord }) => !near(coord)).map(({ coord }) => coord);
    unloaded.forEach((coord) => this.unload(coord));

    const loaded: ChunkCoord[] = [];
    /** Loads the missing chunks within `radius` of each focus, within the budget; returns those left. */
    const loadWithin = (radius: number) => {
      // Two foci may share a chunk: it counts once.
      const listed = new Set<ChunkKey>();
      const missing = centres
        .flatMap((centre) => chunksAround(centre, radius))
        .filter((coord) => {
          const key = chunkKey(coord.cx, coord.cy);
          if (listed.has(key) || this.loaded.has(key) || !this.exists(coord)) return false;
          listed.add(key);
          return true;
        });
      const now = missing.slice(0, budget);
      now.forEach((coord) => this.load(coord));
      loaded.push(...now);
      budget -= now.length;
      return missing.length - now.length;
    };
    const pending = loadWithin(loadRadius);
    if (pending === 0 && prefetchRadius > loadRadius) loadWithin(prefetchRadius);
    return { loaded, unloaded, pending };
  }

  /**
   * Replaces the entities of the loaded chunk `coord` (built, cut down, moved…), keeping
   * `occupancy` in sync, and marks the chunk edited: it is saved, and loads with these entities
   * from now on.
   *
   * @throws When the chunk is not loaded, or an entity is anchored outside it.
   */
  setEntities(coord: ChunkCoord, entities: readonly Entity[]): void {
    const chunk = this.get(coord);
    if (!chunk) throw new Error(`Chunk (${coord.cx}, ${coord.cy}) is not loaded`);
    const { minX, minY, maxX, maxY } = chunk.rect;
    const outside = entities.find(({ x, y }) => x < minX || x > maxX || y < minY || y > maxY);
    if (outside) throw new Error(`Entity "${outside.id}" is anchored outside chunk (${coord.cx}, ${coord.cy})`);

    chunk.entities.forEach((entity) => this.index.remove(entity));
    const kept = [...entities];
    kept.forEach((entity) => this.index.insert(entity, getEntityFootprint(entity)));
    this.loaded.set(chunk.key, { ...chunk, entities: kept });
    this.edits.set(chunk.key, kept);
  }

  /** The edited chunks, loaded or not, as plain JSON, by chunk key so saves are stable. */
  serialize(): SavedChunk[] {
    return [...this.edits]
      .sort(([a], [b]) => a - b)
      .map(([key, entities]) => ({
        ...chunkFromKey(key),
        entities: entities.map((entity) => ({ x: entity.x, y: entity.y, data: entity.getData() })),
      }));
  }
}
