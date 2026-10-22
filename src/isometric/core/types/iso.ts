import type { IGridObject } from "./entities";

/**
 * Configuration for projecting grid coordinates to isometric screen coordinates (2:1).
 * World `+x` goes up-right on screen, `+y` up-left and elevation up; screen `y` grows
 * downward, as in PixiJS. See "Sistema de coordenadas" in ARCHITECTURE.md.
 */
export type IsoProjectionConfig = {
  /**
   * Width of a single isometric tile in pixels
   */
  tileWidth: number;
  /**
   * Height of a single isometric tile in pixels
   */
  tileHeight: number;
  /**
   * Vertical pixel step used per elevation level. Defaults to tileHeight / 2.
   */
  elevationStep?: number;
  /**
   * Screen X, in pixels, of the centre of the top face of column `(0, 0)` at elevation `0`.
   */
  originX: number;
  /**
   * Screen Y, in pixels, of the centre of the top face of column `(0, 0)` at elevation `0`.
   */
  originY: number;
};

/**
 * Represents a box from the original grid along with its projected screen coordinates in an isometric view
 */
export type IsoScreenBox<T extends IGridObject = IGridObject> = {
  /**
   * X coordinate of the box in the original grid (not screen coordinates)
   */
  x: number;
  /**
   * Y coordinate of the box in the original grid (not screen coordinates)
   */
  y: number;
  /**
   * Reference to the original Box object
   */
  box: T;
  /**
   * Screen X, in pixels, of the centre of the box's top face.
   */
  screenX: number;
  /**
   * Screen Y of the centre of the column at elevation `0`, before the elevation offset.
   * Smaller (higher on screen) means farther from the camera; used for stable depth sorting.
   */
  baseScreenY: number;
  /**
   * Screen Y, in pixels, of the centre of the box's top face (`baseScreenY` raised by its elevation).
   */
  screenY: number;
};

/** Pixel size of one isometric block, shared by projection and rendering. */
export type TileMetrics = {
  /** Width of a tile's top diamond. */
  readonly tileWidth: number;
  /** Height of a tile's top diamond (half of `tileWidth` in 2:1 isometric). */
  readonly tileHeight: number;
  /** Vertical pixels per elevation level (the height of a block's side). */
  readonly boxHeight: number;
};
