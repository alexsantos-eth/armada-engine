/**
 * Coordinate spaces of the world. Each space uses its own field names so they cannot be
 * mixed by accident: a `ChunkCoord` is not assignable to a `WorldCoord`.
 *
 * All of them share the world axes (see "Sistema de coordenadas" in ARCHITECTURE.md):
 * column `(0, 0)` is the one nearest the camera (lowest on screen), `+x` goes up-right on
 * screen (north-east), `+y` up-left (north-west) and elevation (`z`) straight up. North is
 * screen up (`+x +y`). Coordinates may be negative.
 */

/**
 * Absolute grid position of a column, in blocks. Integer: the whole column. Its square spans
 * from `(x, y)` (south corner, nearest the camera) to `(x + 1, y + 1)` (north corner).
 */
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

/**
 * Numeric key of one world column (see `cellKey()`), unique in the whole grid. It does not fit a
 * small integer, so `CellMap` and `SpatialIndex` key their cells by chunk instead (#95).
 */
export type CellKey = number & { readonly [cellKeyBrand]: true };

/** Numeric key of one chunk (see `chunkKey()`). */
export type ChunkKey = number & { readonly [chunkKeyBrand]: true };
