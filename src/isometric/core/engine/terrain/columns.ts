import { Box } from "./box";

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
 * {@link buildFilledElevationLevels}), copying the column's data. Inputs are not modified.
 */
export function fillElevations(boxes: readonly Box[], minElevation: number): Box[] {
  return boxes.flatMap((box) => {
    const boxData = box.getData();

    return buildFilledElevationLevels(box.elevation, minElevation).map(
      (elevation) => new Box(box.x, box.y, { ...boxData, elevation }),
    );
  });
}
