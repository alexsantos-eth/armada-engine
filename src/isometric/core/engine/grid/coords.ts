import type { CellKey, ChunkCoord, ChunkKey, LocalCoord, WorldCoord, WorldRect } from "../../types";

/**
 * Side of a chunk in columns. The world is split into `CHUNK_SIZE` × `CHUNK_SIZE` chunks for
 * generation, streaming and spatial lookups.
 */
export const CHUNK_SIZE = 32;

/**
 * Largest absolute coordinate a key can hold (2²⁰ − 1). A world of ±1,048,575 columns is far
 * beyond what the game streams, and keeps every key a safe integer.
 */
export const MAX_GRID_COORD = 2 ** 20 - 1;

const OFFSET = MAX_GRID_COORD;
const SPAN = 2 * MAX_GRID_COORD + 1;

function packKey(x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > MAX_GRID_COORD || Math.abs(y) > MAX_GRID_COORD) {
    throw new RangeError(`Grid coordinate out of range: (${x}, ${y})`);
  }
  return (x + OFFSET) * SPAN + (y + OFFSET);
}

function unpackKey(key: number): [number, number] {
  return [Math.floor(key / SPAN) - OFFSET, (key % SPAN) - OFFSET];
}

/**
 * Numeric key of the world column `(x, y)`. Replaces "x:y" string keys: no string
 * allocation, and `Map`/`Set` lookups on numbers are cheaper.
 *
 * @throws `RangeError` for non-integer coordinates or beyond {@link MAX_GRID_COORD}.
 */
export function cellKey(x: number, y: number): CellKey {
  return packKey(x, y) as CellKey;
}

/** Inverse of {@link cellKey}. */
export function cellFromKey(key: CellKey): WorldCoord {
  const [x, y] = unpackKey(key);
  return { x, y };
}

/** Numeric key of the chunk `(cx, cy)`. */
export function chunkKey(cx: number, cy: number): ChunkKey {
  return packKey(cx, cy) as ChunkKey;
}

/** Inverse of {@link chunkKey}. */
export function chunkFromKey(key: ChunkKey): ChunkCoord {
  const [cx, cy] = unpackKey(key);
  return { cx, cy };
}

/** Chunk containing a world column (floor division, so `-1` belongs to chunk `-1`). */
export function toChunkCoord({ x, y }: WorldCoord): ChunkCoord {
  return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
}

/** Position of a world column inside its chunk, always in `[0, CHUNK_SIZE)`. */
export function toLocalCoord({ x, y }: WorldCoord): LocalCoord {
  const wrap = (value: number) => ((value % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { lx: wrap(x), ly: wrap(y) };
}

/** World column at `local` inside `chunk`. */
export function toWorldCoord({ cx, cy }: ChunkCoord, { lx, ly }: LocalCoord): WorldCoord {
  return { x: cx * CHUNK_SIZE + lx, y: cy * CHUNK_SIZE + ly };
}

/** World columns covered by a chunk (inclusive bounds). */
export function chunkRect({ cx, cy }: ChunkCoord): WorldRect {
  return {
    minX: cx * CHUNK_SIZE,
    minY: cy * CHUNK_SIZE,
    maxX: (cx + 1) * CHUNK_SIZE - 1,
    maxY: (cy + 1) * CHUNK_SIZE - 1,
  };
}
