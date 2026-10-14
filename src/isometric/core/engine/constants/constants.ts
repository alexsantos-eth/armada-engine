export const WIDTH = Math.min(window.innerWidth, 1300);
export const TILE_WIDTH = Math.min(WIDTH * 0.2, 40);

export const TILE_HEIGHT = TILE_WIDTH / 2;
export const BOX_HEIGHT = TILE_WIDTH / 3;
export const TERRAIN_WIDTH = 32;
export const TERRAIN_HEIGHT = 32;
export const DEFAULT_SCALE = 50;
export const DEFAULT_OCTAVES = 5;
export const DEFAULT_PERSISTENCE = 0.5;
export const DEFAULT_LACUNARITY = 2;
export const DEFAULT_MIN_ELEVATION = -3;
export const DEFAULT_MAX_ELEVATION = 4;
export const POSITIVE_ELEVATION_TINT_STEP = 0.04;
export const NEGATIVE_ELEVATION_TINT_STEP = 0.15;

export const GRASS_BLOCK_TEXTURE_KEY = "iso-grass-block";
export const GROUND_BLOCK_TEXTURE_KEY = "iso-ground-block";
export const WATER_BLOCK_TEXTURE_KEY = "iso-water-block";

export const VIEW_CULL_MARGIN = 120;