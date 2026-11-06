import { PATH_STEPS } from "./astar";

/**
 * Bits of a connection mask, one per edge neighbour of a column in {@link PATH_STEPS} order:
 * `+x` is `1`, `+y` is `2`, `−x` is `4` and `−y` is `8`. A mask is in `[0, 15]`.
 */
export const CONNECTION_BITS = PATH_STEPS.map((_, index) => 1 << index);

/** Whether column `(x, y)` joins its neighbour `(nx, ny)` (both on a path, at a walkable step). */
export type Connects = (x: number, y: number, nx: number, ny: number) => boolean;

/** Which of the four edge neighbours of column `(x, y)` it joins, as a mask of {@link CONNECTION_BITS}. */
export function getConnectionMask(x: number, y: number, connects: Connects): number {
  let mask = 0;
  PATH_STEPS.forEach((step, index) => {
    if (connects(x, y, x + step.x, y + step.y)) mask |= CONNECTION_BITS[index];
  });
  return mask;
}

/**
 * The shape a connection mask draws: alone (`single`), the end of a path (`end`, one neighbour),
 * a `straight` stretch or a `corner` (two), a `tee` (three) or a `cross` (four).
 */
export type PathShape = "single" | "end" | "straight" | "corner" | "tee" | "cross";

const SHAPES_BY_COUNT: readonly PathShape[] = ["single", "end", "corner", "tee", "cross"];

/** The shape of `mask` (see {@link PathShape}). */
export function getPathShape(mask: number): PathShape {
  if (mask === 0b0101 || mask === 0b1010) return "straight";
  let count = 0;
  for (const bit of CONNECTION_BITS) if ((mask & bit) !== 0) count += 1;
  return SHAPES_BY_COUNT[count];
}
