import { VIEW_CULL_MARGIN } from "../constants";
import { Box } from "../entities";

export function buildFilledElevationLevels(
  targetElevation: number,
  minElevation: number,
): number[] {
  const targetLevel = Math.floor(targetElevation);

  if (targetLevel < minElevation) {
    const depth = minElevation - targetLevel;

    return Array.from({ length: depth }, (_, index) => targetLevel + index);
  }

  const depth = targetLevel - minElevation + 1;
  return Array.from({ length: depth }, (_, index) => minElevation + index);
}

export function fillElevations(boxes: Box[], minElevation: number): Box[] {
  return boxes.flatMap((box) => {
    const boxData = box.getData();

    return buildFilledElevationLevels(box.elevation, minElevation).map(
      (elevation) => new Box(box.x, box.y, { ...boxData, elevation }),
    );
  });
}

export function isWithinViewport(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    x >= -VIEW_CULL_MARGIN &&
    x <= viewportWidth + VIEW_CULL_MARGIN &&
    y >= -VIEW_CULL_MARGIN &&
    y <= viewportHeight + VIEW_CULL_MARGIN
  );
}
