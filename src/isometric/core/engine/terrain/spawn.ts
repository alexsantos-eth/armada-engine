import type { TerrainPoint } from "../../types";

/** Rectangle of grid cells, `start` inclusive and `end` exclusive. */
export type GridArea = {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
};

/**
 * Spawn area of a `width` × `height` map: a centered square of 4 to 8 cells (smaller maps
 * get a smaller area).
 */
export function getSpawnArea(width: number, height: number): GridArea {
  const size = Math.max(4, Math.min(8, Math.min(width, height) - 2));
  const half = Math.floor(size / 2);
  const startX = Math.floor(width / 2) - half;
  const startY = Math.floor(height / 2) - half;

  return { startX, startY, endX: startX + size, endY: startY + size };
}

/**
 * Returns a copy of `points` with a flat, walkable plateau on the spawn area: elevation `0`
 * with its back edge (first row and column) at `1`. Points outside the area keep their
 * elevation; the input is not modified.
 */
export function applySpawnPlateau(
  points: readonly TerrainPoint[],
  width: number,
  height: number,
): TerrainPoint[] {
  const { startX, startY, endX, endY } = getSpawnArea(width, height);

  return points.map((point) => {
    const inside = point.x >= startX && point.x < endX && point.y >= startY && point.y < endY;
    if (!inside) return { ...point };
    return { ...point, elevation: point.x === startX || point.y === startY ? 1 : 0 };
  });
}
