import type { IGridObject, IsoProjectionConfig, IsoScreenBox } from "../../types";

/**
 * Projects grid objects to isometric screen coordinates (screen `y` grows downward):
 *
 * - `screenX = originX + (x − y) · tileWidth / 2`
 * - `baseScreenY = originY − (x + y) · tileHeight / 2`
 * - `screenY = baseScreenY − elevation · elevationStep`
 *
 * So `+x` moves up-right, `+y` up-left and elevation up; `(screenX, screenY)` is the centre of
 * the box's top face. `baseScreenY` ignores elevation (stable for depth sorting).
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
