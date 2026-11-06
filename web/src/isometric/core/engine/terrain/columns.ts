import { CellMap } from "../grid";
import { Box } from "./box";
import { getBlockMaterial } from "./surfaces";
import type { TerrainMaterial } from "../../types";

/**
 * Elevation levels a column of top elevation `targetElevation` occupies down to
 * `minElevation`. Below the minimum (deep water) it lists the levels from the target up to
 * the minimum instead.
 */
export function buildFilledElevationLevels(targetElevation: number, minElevation: number): number[] {
  const targetLevel = Math.floor(targetElevation);

  if (targetLevel < minElevation) {
    const depth = minElevation - targetLevel;

    return Array.from({ length: depth }, (_, index) => targetLevel + index);
  }

  const depth = targetLevel - minElevation + 1;
  return Array.from({ length: depth }, (_, index) => minElevation + index);
}

/**
 * Materializes every level of each column: returns one new `Box` per occupied level (see
 * {@link buildFilledElevationLevels}), copying the column's data and typed once with its
 * material (`getBlockMaterial()`: water below zero, the column's own type on its top, ground
 * under it). Inputs are not modified.
 */
export function fillElevations(boxes: readonly Box[], minElevation: number): Box[] {
  return boxes.flatMap((box) => {
    const boxData = box.getData();

    return buildFilledElevationLevels(box.elevation, minElevation).map(
      (elevation) =>
        new Box(box.x, box.y, { ...boxData, elevation, type: getBlockMaterial(elevation, box.elevation, box.type) }),
    );
  });
}

/** A terrain block: a column cell at one elevation level. */
type Block = { readonly x: number; readonly y: number; readonly elevation: number };

/**
 * Cells that must hold a full block for the block at `(x, y, elevation)` to be hidden: the one
 * above, and the three towards the camera (`−x`, `−y` and their diagonal, lower on screen) at
 * its level and the next. The next level matters because the block art has soft, rounded
 * edges: at the foot of a step the seam under the higher block lets the one behind show.
 */
const COVERING_CELLS: readonly (readonly [dx: number, dy: number, dz: number])[] = [
  [0, 0, 1],
  [-1, 0, 0],
  [0, -1, 0],
  [-1, 0, 1],
  [0, -1, 1],
  [-1, -1, 1],
];

/**
 * The blocks that can be seen from the fixed isometric camera, in input order: drops every
 * block fully covered by others (see {@link COVERING_CELLS}). A filled terrain is mostly
 * buried blocks that would still be drawn, and pay their fill, on every frame. Pure: the result
 * does not depend on the order of `blocks`.
 *
 * @param fillsCell Whether a block fills its whole cell and so can cover others (`false` for a
 * sand top, drawn half a block lower). Defaults to every block.
 */
export function removeHiddenBlocks<B extends Block>(
  blocks: readonly B[],
  fillsCell: (block: B) => boolean = () => true,
): B[] {
  const covering = new CellMap<Set<number>>();
  blocks.forEach((block) => {
    if (!fillsCell(block)) return;
    const levels = covering.get(block.x, block.y) ?? new Set<number>();
    covering.set(block.x, block.y, levels.add(block.elevation));
  });
  const covers = (x: number, y: number, elevation: number) => covering.get(x, y)?.has(elevation) === true;

  return blocks.filter(
    ({ x, y, elevation }) => !COVERING_CELLS.every(([dx, dy, dz]) => covers(x + dx, y + dy, elevation + dz)),
  );
}

/**
 * The blocks of `columns` the fixed camera sees, each a new `Box` typed with its material: the
 * same blocks, in the same order, as filling the columns and `covering` down to `minElevation`
 * ({@link fillElevations}) and dropping the hidden ones ({@link removeHiddenBlocks}), keeping those
 * of `columns`. Only the visible blocks are created (about one in three of a chunk's): whether a
 * cell is full is read from its column's top, so a chunk shown on screen does not leave thousands
 * of buried boxes to the garbage collector. Inputs are not modified.
 *
 * @param columns One column per cell.
 * @param covering Columns around them that can cover their blocks (a chunk's `−x`/`−y`
 * neighbours); their own blocks are never returned.
 * @param fillsCell Whether a block of `material` fills its whole cell and so can cover others
 * (`false` for a sand top, drawn half a block lower).
 */
export function createVisibleBlocks(
  columns: readonly Box[],
  covering: readonly Box[],
  minElevation: number,
  fillsCell: (material: TerrainMaterial) => boolean,
): Box[] {
  const columnAt = new CellMap<Box>();
  covering.forEach((column) => columnAt.set(column.x, column.y, column));
  columns.forEach((column) => columnAt.set(column.x, column.y, column));
  /** Lowest and highest level a column of top `elevation` fills (see {@link buildFilledElevationLevels}). */
  const lowest = (elevation: number) => Math.min(Math.floor(elevation), minElevation);
  const highest = (elevation: number) => Math.max(Math.floor(elevation), minElevation - 1);
  const isFull = (x: number, y: number, level: number) => {
    const column = columnAt.get(x, y);
    if (column === undefined || level < lowest(column.elevation) || level > highest(column.elevation)) return false;
    return fillsCell(getBlockMaterial(level, column.elevation, column.type));
  };

  const visible: Box[] = [];
  columns.forEach((column) => {
    const { x, y, elevation, type, walkable, metadata } = column;
    for (let level = lowest(elevation); level <= highest(elevation); level += 1) {
      if (COVERING_CELLS.every(([dx, dy, dz]) => isFull(x + dx, y + dy, level + dz))) continue;
      visible.push(
        new Box(x, y, { type: getBlockMaterial(level, elevation, type), walkable, elevation: level, metadata }),
      );
    }
  });
  return visible;
}
