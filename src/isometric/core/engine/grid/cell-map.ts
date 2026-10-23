import type { WorldCoord } from "../../types";
import { assertGridCoord, CHUNK_SIZE, MAX_GRID_COORD } from "./coords";

/** Read-only view of a {@link CellMap}. */
export type ReadonlyCellMap<T> = Pick<CellMap<T>, "get" | "has" | "size" | "forEach" | "values" | "entries">;

/** The cells of one chunk, by their index inside it (`ly * CHUNK_SIZE + lx`, `0…1023`). */
type Bucket<T> = { readonly cx: number; readonly cy: number; readonly cells: Map<number, T> };

/** `log2(CHUNK_SIZE)`: checked coordinates are integers of 21 bits, so chunks and indices are bit operations. */
const CHUNK_BITS = Math.log2(CHUNK_SIZE);
const LOCAL_MASK = CHUNK_SIZE - 1;
/** Chunks per grid side, and the offset that makes chunk coordinates non-negative, for bucket keys. */
const CHUNK_OFFSET = (MAX_GRID_COORD >> CHUNK_BITS) + 1;
const CHUNK_SPAN = 2 * CHUNK_OFFSET;

/** Index of the column `(x, y)` inside its chunk: a small integer. */
const localIndex = (x: number, y: number) => ((y & LOCAL_MASK) << CHUNK_BITS) | (x & LOCAL_MASK);

/**
 * One value per world column, kept chunk by chunk: a map of chunks, each a map of its cells by
 * their index inside the chunk. A world-wide cell key does not fit a small integer, so the engine
 * stores it as a heap object and allocates one on every lookup (#95); a local index does, and the
 * chunk of the last lookup is remembered, so looking up nearby columns allocates nothing.
 *
 * Iteration goes chunk by chunk, in the order each chunk got its first cell, and inside a chunk
 * in insertion order: results stay deterministic.
 *
 * @throws `RangeError` from every method taking a column, for non-integer coordinates or beyond
 * `MAX_GRID_COORD`.
 */
export class CellMap<T> {
  private readonly buckets = new Map<number, Bucket<T>>();
  private count = 0;
  // The chunk of the last lookup: a bucket key, too, does not fit a small integer.
  private lastKey = Number.NaN;
  private lastBucket: Bucket<T> | undefined;

  /** Builds a map with one entry per object, keyed by its `x`/`y`. Later objects win. */
  static from<O extends WorldCoord, T>(objects: Iterable<O>, value: (object: O) => T): CellMap<T> {
    const map = new CellMap<T>();
    for (const object of objects) map.set(object.x, object.y, value(object));
    return map;
  }

  /** Number of columns with a value. */
  get size(): number {
    return this.count;
  }

  get(x: number, y: number): T | undefined {
    return this.bucketOf(x, y)?.cells.get(localIndex(x, y));
  }

  has(x: number, y: number): boolean {
    return this.bucketOf(x, y)?.cells.has(localIndex(x, y)) === true;
  }

  set(x: number, y: number, value: T): this {
    let bucket = this.bucketOf(x, y);
    if (bucket === undefined) {
      bucket = { cx: x >> CHUNK_BITS, cy: y >> CHUNK_BITS, cells: new Map() };
      this.buckets.set(this.lastKey, bucket);
      this.lastBucket = bucket;
    }
    const index = localIndex(x, y);
    if (!bucket.cells.has(index)) this.count += 1;
    bucket.cells.set(index, value);
    return this;
  }

  delete(x: number, y: number): boolean {
    const bucket = this.bucketOf(x, y);
    if (bucket === undefined || !bucket.cells.delete(localIndex(x, y))) return false;
    this.count -= 1;
    // A chunk without cells is forgotten: unloaded chunks leave nothing behind.
    if (bucket.cells.size === 0) {
      this.buckets.delete(this.lastKey);
      this.lastBucket = undefined;
    }
    return true;
  }

  forEach(callback: (value: T, x: number, y: number) => void): void {
    this.buckets.forEach(({ cx, cy, cells }) =>
      cells.forEach((value, index) =>
        callback(value, (cx << CHUNK_BITS) | (index & LOCAL_MASK), (cy << CHUNK_BITS) | (index >> CHUNK_BITS)),
      ),
    );
  }

  *values(): IterableIterator<T> {
    for (const { cells } of this.buckets.values()) yield* cells.values();
  }

  *entries(): IterableIterator<[WorldCoord, T]> {
    for (const { cx, cy, cells } of this.buckets.values()) {
      for (const [index, value] of cells) {
        yield [{ x: (cx << CHUNK_BITS) | (index & LOCAL_MASK), y: (cy << CHUNK_BITS) | (index >> CHUNK_BITS) }, value];
      }
    }
  }

  /**
   * The bucket of the chunk holding `(x, y)`, or `undefined` when it has none; either way that
   * chunk becomes the last one looked up (`lastKey`).
   */
  private bucketOf(x: number, y: number): Bucket<T> | undefined {
    assertGridCoord(x, y);
    const key = ((x >> CHUNK_BITS) + CHUNK_OFFSET) * CHUNK_SPAN + ((y >> CHUNK_BITS) + CHUNK_OFFSET);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastBucket = this.buckets.get(key);
    }
    return this.lastBucket;
  }
}
