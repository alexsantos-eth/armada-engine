/**
 * Coordinate spaces of the world. Each space uses its own field names so they cannot be
 * mixed by accident: a `ChunkCoord` is not assignable to a `WorldCoord`.
 */

/** Absolute grid position of a column, in blocks. */
export type WorldCoord = {
  readonly x: number;
  readonly y: number;
};

/** Position of a chunk: chunk `(cx, cy)` covers world columns `cx * CHUNK_SIZE …`. */
export type ChunkCoord = {
  readonly cx: number;
  readonly cy: number;
};

/** Position of a column inside its chunk, from `0` to `CHUNK_SIZE - 1`. */
export type LocalCoord = {
  readonly lx: number;
  readonly ly: number;
};

/** Axis-aligned rectangle of world columns; `min` and `max` are inclusive. */
export type WorldRect = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

declare const cellKeyBrand: unique symbol;
declare const chunkKeyBrand: unique symbol;

/** Numeric key of one world column (see `cellKey()`); only valid for `CellMap`/`SpatialIndex`. */
export type CellKey = number & { readonly [cellKeyBrand]: true };

/** Numeric key of one chunk (see `chunkKey()`). */
export type ChunkKey = number & { readonly [chunkKeyBrand]: true };
