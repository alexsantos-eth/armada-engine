import type { IGridObject, TerrainMaterial, TerrainSurface } from "../../types";

/** Elevation the top block of a column must have to become sand. */
export const SAND_ELEVATION = 0;

const NEIGHBOUR_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Chooses the surface of a column from its top elevation and the top elevations of its
 * edge-adjacent neighbours (`undefined` for neighbours outside the map).
 * Below zero it is water; at {@link SAND_ELEVATION} next to water it is sand; otherwise grass.
 */
export function getColumnSurface(
  topElevation: number,
  neighbourTops: readonly (number | undefined)[],
): TerrainSurface {
  if (topElevation < 0) return "water";
  const touchesWater = neighbourTops.some((top) => top !== undefined && top < 0);
  return topElevation === SAND_ELEVATION && touchesWater ? "sand" : "grass";
}

/**
 * Classifies the surface of every column, keyed by `x:y`. Accepts one box per column or
 * filled columns (several boxes per coordinate); the highest box is the column's top.
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

  const surfaces = new Map<string, TerrainSurface>();
  columns.forEach(({ x, y, top }, key) => {
    const neighbourTops = NEIGHBOUR_OFFSETS.map(([dx, dy]) =>
      columns.get(`${x + dx}:${y + dy}`)?.top,
    );
    surfaces.set(key, getColumnSurface(top, neighbourTops));
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
