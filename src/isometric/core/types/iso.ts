import type { Box } from "../engine/entities";

/**
 * Configuration for projecting grid coordinates to isometric screen coordinates
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
   * X coordinate of the isometric origin (bottom corner where box (0,0) is projected) in screen pixels
   */
  originX: number;
  /**
   * Y coordinate of the isometric origin (bottom corner where box (0,0) is projected) in screen pixels
   */
  originY: number;
};

/**
 * Represents a box from the original grid along with its projected screen coordinates in an isometric view
 */
export type IsoScreenBox = {
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
  box: Box;
  /**
   * X coordinate of the projected box on the screen in pixels
   */
  screenX: number;
  /**
   * Ground-contact Y before applying elevation offset. Useful for stable depth sorting.
   */
  baseScreenY: number;
  /**
   * Y coordinate of the projected box on the screen in pixels
   */
  screenY: number;
};

/**
 * Bounds of the projected boxes on the screen, used for layout calculations like centering
 */
export type IsoBounds = {
  /**
   * Minimum X coordinate among the projected boxes on the screen in pixels
   */
  minX: number;
  /**
   * Maximum X coordinate among the projected boxes on the screen in pixels
   */
  maxX: number;
  /**
   * Minimum Y coordinate among the projected boxes on the screen in pixels
   */
  minY: number;
  /**
   * Maximum Y coordinate among the projected boxes on the screen in pixels
   */
  maxY: number;
};
