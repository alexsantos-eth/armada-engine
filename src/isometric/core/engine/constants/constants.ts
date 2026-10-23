import type { TileMetrics } from "../../types";

/**
 * Reference view width, in pixels, that the tile size derives from. Static so the core never
 * reads `window`: it can run in Node, tests or a worker. The view itself fills the window (the
 * page passes `resizeTo` to Pixi) and the camera adapts to its size.
 */
export const WIDTH = 1300;
export const TILE_WIDTH = Math.min(WIDTH * 0.2, 40);

export const TILE_HEIGHT = TILE_WIDTH / 2;
export const BOX_HEIGHT = TILE_WIDTH / 3;

/** {@link TILE_WIDTH}, {@link TILE_HEIGHT} and {@link BOX_HEIGHT} as one value for the renderer. */
export const TILE_METRICS: TileMetrics = {
  tileWidth: TILE_WIDTH,
  tileHeight: TILE_HEIGHT,
  boxHeight: BOX_HEIGHT,
};
