import type { BoxType, IGridObject, TerrainMaterial, TerrainPoint, TerrainSurface, WorldRect } from "../../types";
import { CellMap } from "../grid";
import { Box } from "./box";
import { generatePerlinTerrain } from "./terrain";

/**
 * Columns around a column, on every side, whose elevations decide its surface: its eight
 * neighbours, and the neighbours of those (whether a neighbour is inland depends on whether
 * it touches water). See {@link classifyColumnSurfaces}.
 */
export const SURFACE_REACH = 2;

/** Elevation the top block of a column must have to become sand. */
export const SAND_ELEVATION = 0;

const EDGE_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const AROUND_OFFSETS = [...EDGE_OFFSETS, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * Chooses the surface of a column. Below zero it is water. At {@link SAND_ELEVATION} it is
 * sand only on a shore: it touches water edge-wise and has inland ground around it (so
 * islets and strips in the middle of the water stay grass). Otherwise grass.
 */
export function getColumnSurface(topElevation: number, touchesWater: boolean, touchesInland: boolean): TerrainSurface {
  if (topElevation < 0) return "water";
  return topElevation === SAND_ELEVATION && touchesWater && touchesInland ? "sand" : "grass";
}

/**
 * Classifies the surface of every column. Accepts one box per column or filled columns
 * (several boxes per coordinate); the highest box is the column's top.
 *
 * A shore candidate is a column at {@link SAND_ELEVATION} with an edge-adjacent water
 * column. It becomes sand when any of its eight neighbours is inland ground: a land column
 * that is not a shore candidate itself (higher ground, or ground at the sand elevation away
 * from the water). Diagonals count so the corners of a beach stay sand.
 */
export function classifyColumnSurfaces(
  boxes: readonly Pick<IGridObject, "x" | "y" | "elevation">[],
): CellMap<TerrainSurface> {
  const tops = new CellMap<number>();
  boxes.forEach(({ x, y, elevation }) => {
    tops.set(x, y, Math.max(tops.get(x, y) ?? -Infinity, elevation));
  });

  const touchesWater = new CellMap<boolean>();
  tops.forEach((_, x, y) => {
    touchesWater.set(
      x,
      y,
      EDGE_OFFSETS.some(([dx, dy]) => {
        const top = tops.get(x + dx, y + dy);
        return top !== undefined && top < 0;
      }),
    );
  });
  const isInland = (x: number, y: number) => {
    const top = tops.get(x, y);
    if (top === undefined || top < 0) return false;
    return top !== SAND_ELEVATION || !touchesWater.get(x, y);
  };

  const surfaces = new CellMap<TerrainSurface>();
  tops.forEach((top, x, y) => {
    const touchesInland = AROUND_OFFSETS.some(([dx, dy]) => isInland(x + dx, y + dy));
    surfaces.set(x, y, getColumnSurface(top, touchesWater.get(x, y) as boolean, touchesInland));
  });
  return surfaces;
}

/**
 * Material of one block: negative blocks are water, the top block takes its column's
 * material (its surface) and every other block is ground.
 */
export function getBlockMaterial(elevation: number, topElevation: number, surface: BoxType): TerrainMaterial {
  if (elevation < 0) return "water";
  return elevation === topElevation ? surface : "ground";
}

/**
 * The terrain columns of a height map: one `Box` per point, typed with its column's surface
 * ({@link classifyColumnSurfaces}, computed once here). The rest of the engine reads
 * `box.type` instead of classifying again.
 */
export function createTerrainColumns(points: readonly TerrainPoint[]): Box[] {
  const surfaces = classifyColumnSurfaces(points);
  return points.map(({ x, y, elevation }) => new Box(x, y, { elevation, type: surfaces.get(x, y) as TerrainSurface }));
}

/** `a ∩ b`, or `undefined` when they do not overlap. */
function intersectRects(a: WorldRect, b: WorldRect): WorldRect | undefined {
  const rect = {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  };
  return rect.minX <= rect.maxX && rect.minY <= rect.maxY ? rect : undefined;
}

/** Options of {@link generateTerrainColumns}. */
export type TerrainAreaOptions = {
  /** World seed of the height map. */
  readonly seed: number;
  /** Edge of a bounded world: no column exists outside it. Defaults to none (unbounded). */
  readonly clip?: WorldRect;
};

/**
 * The terrain columns of one area of the world (a chunk), typed with their surface exactly as if
 * the whole world had been generated at once: the height map is sampled {@link SURFACE_REACH}
 * columns past the area on every side, classified, and only the area is kept. Areas generated on
 * their own therefore meet without seams. Columns come `x`-major, like `generatePerlinTerrain()`.
 * Nothing is generated outside `clip`.
 */
export function generateTerrainColumns(area: WorldRect, { seed, clip }: TerrainAreaOptions): Box[] {
  const inside = clip ? intersectRects(area, clip) : area;
  if (!inside) return [];
  const reach = SURFACE_REACH;
  const grown = { minX: area.minX - reach, minY: area.minY - reach, maxX: area.maxX + reach, maxY: area.maxY + reach };
  const sampled = clip ? (intersectRects(grown, clip) as WorldRect) : grown;
  const points = generatePerlinTerrain({
    seed,
    originX: sampled.minX,
    originY: sampled.minY,
    width: sampled.maxX - sampled.minX + 1,
    height: sampled.maxY - sampled.minY + 1,
  });
  const keep = ({ x, y }: TerrainPoint) => x >= inside.minX && x <= inside.maxX && y >= inside.minY && y <= inside.maxY;
  return createTerrainColumns(points).filter(keep);
}
