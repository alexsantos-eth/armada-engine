import type {
  IsoProjectionConfig,
  IsoScreenBox,
} from "../../types";
import type { IGridObject } from "../../types";

export function projectBoxesToIsometric<T extends IGridObject>(
  boxes: T[],
  projection: IsoProjectionConfig,
): IsoScreenBox<T>[] {
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
