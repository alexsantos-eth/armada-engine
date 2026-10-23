/** A terrain cell in the generated height map. */
export type TerrainPoint = {
  /** Horizontal grid coordinate. */
  x: number;
  /** Vertical grid coordinate. */
  y: number;
  /** Height level used to build the column at this coordinate. */
  elevation: number;
};

/** Parameters used to generate seeded multi-octave terrain noise. */
export type PerlinTerrainOptions = {
  /** Number of cells along the horizontal axis. */
  width: number;
  /** Number of cells along the vertical axis. */
  height: number;
  /**
   * World column of the first cell along `x`. Defaults to `0`. The noise is sampled at absolute
   * world positions, so two areas of one seed always meet without a seam (chunks).
   */
  originX?: number;
  /** World column of the first cell along `y`. Defaults to `0`. */
  originY?: number;
  /** Seed used to make the generated terrain reproducible. */
  seed?: number;
  /** Sampling distance applied to the noise field. */
  scale?: number;
  /** Number of noise layers combined for each cell. */
  octaves?: number;
  /** Amplitude multiplier applied between successive octaves. */
  persistence?: number;
  /** Frequency multiplier applied between successive octaves. */
  lacunarity?: number;
  /** Minimum elevation allowed in the generated terrain. */
  minElevation?: number;
  /** Maximum elevation allowed in the generated terrain. */
  maxElevation?: number;
};

/** Material of the top block of a terrain column. */
export type TerrainSurface = "grass" | "water" | "sand";

/** Material used to render a single terrain block. */
export type TerrainMaterial = TerrainSurface | "ground";

/**
 * How the blocks of a material are tinted by their elevation (`0` keeps the texture's colours):
 *
 * - `"depth"`: underwater blocks darken with depth from white, by `step` per level below `0`
 *   (at least one level).
 * - `"height"`: blocks darken from `topTint`, by `step` per level below the highest elevation of
 *   the world; untinted when the world has no elevation above `0`.
 *
 * The darkening factor never goes under `0.35`.
 */
export type TerrainTint =
  | { readonly kind: "depth"; readonly step: number }
  | { readonly kind: "height"; readonly topTint: number; readonly step: number };

/** How the blocks of one terrain material are drawn (game content). */
export type TerrainMaterialAppearance = {
  /** SVG of the block, under `public/` (e.g. `/assets/grass/block.svg`). */
  readonly textureSource: string;
  /** Tint by elevation. */
  readonly tint: TerrainTint;
  /**
   * Blocks the top of the block sits below the top of its cell (sand: `0.5`). Things standing on
   * it and the shadows on it sink by as much, and a block with an inset never hides the blocks
   * behind it. Defaults to `0`.
   */
  readonly topInset?: number;
};

/** How every terrain material is drawn: the scene receives it as content. */
export type TerrainAppearance = Readonly<Record<TerrainMaterial, TerrainMaterialAppearance>>;
