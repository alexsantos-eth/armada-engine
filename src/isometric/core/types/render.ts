/**
 * Configuration for generating a simple empty box texture, which can be used as a placeholder or default tile in the isometric engine.
 */
export type EmptyBoxTextureConfig = {
  /**
   *  A unique key to identify the generated texture within the rendering system. This key can be used to reference the texture when rendering boxes of this type.
   */
  textureKey: string;
  /**
   * The width of the isometric tile in pixels. This determines how wide the generated box texture will be when rendered on the screen.
   */
  tileWidth: number;
  /**
   * The height of the isometric tile in pixels. This determines how tall the generated box texture will be when rendered on the screen.
   */
  tileHeight: number;
  /**
   * The fill color of the box texture, specified as a hexadecimal number (e.g., 0xffffff for white). This color will be used to fill the interior of the box when the texture is generated.
   */
  fillColor?: number;
  /**
   * The alpha value for the fill color, determining the transparency of the box texture (0-1).
   */
  fillAlpha?: number;
  /**
   * The color of the box texture's outline, specified as a hexadecimal number (e.g., 0x000000 for black). This color will be used to draw the border of the box when the texture is generated.
   */
  strokeColor?: number;
  /**
   * The alpha value for the stroke color, determining the transparency of the box texture's outline (0-1).
   */
  strokeAlpha?: number;
  /**
   * The width of the box texture's outline in pixels.
   */
  strokeWidth?: number;
};
