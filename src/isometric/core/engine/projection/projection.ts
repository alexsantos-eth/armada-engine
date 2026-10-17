import type { IGridObject, IsoProjectionConfig, IsoScreenBox } from "../../types";

/**
 * Projects grid objects to isometric screen coordinates. `baseScreenY` is the ground
 * contact point (stable for depth sorting) and `screenY` adds the elevation offset.
 */
export function projectBoxesToIsometric<T extends IGridObject>(
  boxes: readonly T[],
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
