import type { TileMetrics } from "../../types";

/**
 * Width of the game view in pixels. Static so the core never reads `window`: it can run in
 * Node, tests or a worker. The page adapts its layout around it.
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
export const TERRAIN_WIDTH = 32;
export const TERRAIN_HEIGHT = 32;
export const DEFAULT_SCALE = 50;
export const DEFAULT_OCTAVES = 5;
export const DEFAULT_PERSISTENCE = 0.5;
export const DEFAULT_LACUNARITY = 2;
export const DEFAULT_MIN_ELEVATION = -3;
export const DEFAULT_MAX_ELEVATION = 4;
export const POSITIVE_ELEVATION_TINT_STEP = 0.05;
export const NEGATIVE_ELEVATION_TINT_STEP = 0.15;

export const GRASS_BLOCK_TEXTURE_KEY = "iso-grass-block";
export const GROUND_BLOCK_TEXTURE_KEY = "iso-ground-block";
export const WATER_BLOCK_TEXTURE_KEY = "iso-water-block";
export const SAND_BLOCK_TEXTURE_KEY = "iso-sand-block";

export const VIEW_CULL_MARGIN = 120;

/**
 * Side of a chunk in columns. The world is split into `CHUNK_SIZE` × `CHUNK_SIZE` chunks for
 * generation, streaming and spatial lookups.
 */
export const CHUNK_SIZE = 32;
