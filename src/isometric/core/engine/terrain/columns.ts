import { CellMap } from "../grid";
import { Box } from "./box";
import { getBlockMaterial } from "./surfaces";

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
