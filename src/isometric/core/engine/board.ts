import type {
  IsoBounds,
  IsoProjectionConfig,
  IsoScreenBox,
} from "../types/iso";
import { Box } from "./entities";

export function projectBoxesToIsometric(
  boxes: Box[],
  projection: IsoProjectionConfig,
): IsoScreenBox[] {
  const { tileWidth, tileHeight, originX, originY } = projection;

  return boxes.map((box) => ({
    x: box.x,
    y: box.y,
    box,
    screenX: originX + (box.x - box.y) * (tileWidth / 2),
    // Bottom-origin coordinates: x+ goes right, y+ goes left.
    screenY: originY - (box.x + box.y) * (tileHeight / 2),
  }));
}

export function getIsometricBounds(boxes: IsoScreenBox[]): IsoBounds {
  if (boxes.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const box of boxes) {
    minX = Math.min(minX, box.screenX);
    maxX = Math.max(maxX, box.screenX);
    minY = Math.min(minY, box.screenY);
    maxY = Math.max(maxY, box.screenY);
  }

  return { minX, maxX, minY, maxY };
}
