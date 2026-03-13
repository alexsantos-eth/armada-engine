export const WIDTH = Math.min(window.innerWidth,  500);
export const TILE_WIDTH = Math.min(WIDTH * 0.2,  100);

export const TILE_HEIGHT = TILE_WIDTH / 2;
export const BOX_HEIGHT = TILE_WIDTH / 3;
export const TERRAIN_WIDTH =  20;
export const TERRAIN_HEIGHT =  20;
export const SUPPORT_MIN_ELEVATION = 0;

export const DEEP_WATER_COLORS = [
  0x062f4a, 
  0x0a3d5c, 
  0x0d4d73,
  0x115d8a, 
];

export const TEXTURED_GROUND_KEY = "iso-tile-ground-textured";
export const TEXTURED_GRASS_KEY = "iso-tile-grass-textured";

export const GROUND_TOP_TEXTURE_KEY = "iso-ground-top";
export const GROUND_LEFT_TEXTURE_KEY = "iso-ground-left";
export const GROUND_RIGHT_TEXTURE_KEY = "iso-ground-right";

export const GRASS_TOP_TEXTURE_KEY = "iso-grass-top";
export const GRASS_LEFT_TEXTURE_KEY = "iso-grass-left";
export const GRASS_RIGHT_TEXTURE_KEY = "iso-grass-right";

export const TEXTURED_WATER_KEY = "iso-tile-water-textured";
export const WATER_TOP_TEXTURE_KEY = "iso-water-top";
export const WATER_LEFT_TEXTURE_KEY = "iso-water-left";
export const WATER_RIGHT_TEXTURE_KEY = "iso-water-right";

export const SHIP_SMALL_LEFT_TEXTURE_KEY = "iso-ship-small-left";
export const SHIP_SMALL_RIGHT_TEXTURE_KEY = "iso-ship-small-right";

export const VIEW_CULL_MARGIN = 120;
export const ENABLE_POSTFX = false;