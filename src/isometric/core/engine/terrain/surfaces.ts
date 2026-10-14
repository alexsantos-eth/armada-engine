import type { IGridObject, TerrainMaterial, TerrainSurface } from "../../types";

/** Elevation the top block of a column must have to become sand. */
export const SAND_ELEVATION = 0;

const EDGE_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const AROUND_OFFSETS = [
  ...EDGE_OFFSETS,
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

/**
 * Chooses the surface of a column. Below zero it is water. At {@link SAND_ELEVATION} it is
 * sand only on a shore: it touches water edge-wise and has inland ground around it (so
 * islets and strips in the middle of the water stay grass). Otherwise grass.
 */
export function getColumnSurface(
  topElevation: number,
  touchesWater: boolean,
  touchesInland: boolean,
): TerrainSurface {
  if (topElevation < 0) return "water";
  return topElevation === SAND_ELEVATION && touchesWater && touchesInland ? "sand" : "grass";
}

/**
 * Classifies the surface of every column, keyed by `x:y`. Accepts one box per column or
 * filled columns (several boxes per coordinate); the highest box is the column's top.
 *
 * A shore candidate is a column at {@link SAND_ELEVATION} with an edge-adjacent water
 * column. It becomes sand when any of its eight neighbours is inland ground: a land column
 * that is not a shore candidate itself (higher ground, or ground at the sand elevation away
 * from the water). Diagonals count so the corners of a beach stay sand.
 */
export function classifyColumnSurfaces(
  boxes: readonly IGridObject[],
): Map<string, TerrainSurface> {
  const columns = new Map<string, { x: number; y: number; top: number }>();
  boxes.forEach(({ x, y, elevation }) => {
    const key = `${x}:${y}`;
    const top = Math.max(columns.get(key)?.top ?? -Infinity, elevation);
    columns.set(key, { x, y, top });
  });

  const topAt = (x: number, y: number) => columns.get(`${x}:${y}`)?.top;
  const touchesWater = new Map<string, boolean>();
  columns.forEach(({ x, y }, key) => {
    touchesWater.set(key, EDGE_OFFSETS.some(([dx, dy]) => {
      const top = topAt(x + dx, y + dy);
      return top !== undefined && top < 0;
    }));
  });
  const isInland = (x: number, y: number) => {
    const top = topAt(x, y);
    if (top === undefined || top < 0) return false;
    return top !== SAND_ELEVATION || !touchesWater.get(`${x}:${y}`);
  };

  const surfaces = new Map<string, TerrainSurface>();
  columns.forEach(({ x, y, top }, key) => {
    const touchesInland = AROUND_OFFSETS.some(([dx, dy]) => isInland(x + dx, y + dy));
    surfaces.set(key, getColumnSurface(top, touchesWater.get(key) as boolean, touchesInland));
  });
  return surfaces;
}

/**
 * Material of one block: negative blocks are water, the top block takes its column's
 * surface and every other block is ground.
 */
export function getBlockMaterial(
  elevation: number,
  topElevation: number,
  surface: TerrainSurface,
): TerrainMaterial {
  if (elevation < 0) return "water";
  return elevation === topElevation ? surface : "ground";
}
