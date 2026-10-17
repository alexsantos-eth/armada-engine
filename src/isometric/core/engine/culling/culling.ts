import { VIEW_CULL_MARGIN } from "../constants";

/**
 * Whether a projected screen point is inside the viewport, extended by
 * `VIEW_CULL_MARGIN` on every side.
 */
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
