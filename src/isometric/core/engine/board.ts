import type {
  IsoProjectionConfig,
  IsoScreenBox,
} from "../types/iso";
import { Box } from "./entities";

export function projectBoxesToIsometric(
  boxes: Box[],
  projection: IsoProjectionConfig,
): IsoScreenBox[] {
  const { tileWidth, tileHeight, originX, originY } = projection;
  const elevationStep = projection.elevationStep ?? tileHeight / 2;

  return boxes.map((box) => {
    const baseScreenY = originY - (box.x + box.y) * (tileHeight / 2);

    return {
      x: box.x,
      y: box.y,
      box,
      screenX: originX + (box.x - box.y) * (tileWidth / 2),
      baseScreenY,
      screenY: baseScreenY - box.elevation * elevationStep,
    };
  });
}
