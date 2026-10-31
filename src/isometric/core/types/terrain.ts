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

/**
 * Material of the top block of a terrain column: `ground` on the patches of the lowest land
 * where grass did not grow, `path` where a settlement's paths run.
 */
export type TerrainSurface = "grass" | "water" | "sand" | "ground" | "path";

/** Material used to render a single terrain block (any surface; `ground` also under the top). */
export type TerrainMaterial = TerrainSurface;

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

/**
 * Another look for the top block of a material's columns (grass with flowers, fallen leaves): a
 * share of the columns, picked per column from the world seed, shows it instead of the material's
 * own texture. Only the top block of a column changes; the blocks under it keep the material's.
 */
export type TerrainVariant = {
  /** SVG of the block, under `public/`, with the same canvas as the material's own. */
  readonly textureSource: string;
  /** Share of the columns that show it, in `[0, 1]`; the shares of a material add up to at most `1`. */
  readonly chance: number;
  /** Optional source-pixel rectangle for a frame in a shared SVG spritesheet. */
  readonly frame?: TerrainFrame;
};

/** A rectangle of source pixels of an SVG spritesheet: one block's canvas in it. */
export type TerrainFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Looks of a material's top blocks by which of their four edge neighbours they join (paths: a
 * straight stretch, a corner, a tee…). A column joins a neighbour whose top block is of the same
 * material and at most one level higher or lower. The joined neighbours make a mask: `+x` is `1`,
 * `+y` is `2`, `−x` is `4` and `−y` is `8`, and the top block shows `frames[mask]`.
 */
export type TerrainConnections = {
  /** SVG spritesheet of the looks, under `public/`, each frame with the canvas of a block. */
  readonly textureSource: string;
  /** The frame of each mask, from `0` (joins nothing) to `15` (joins all four): sixteen frames. */
  readonly frames: readonly TerrainFrame[];
};

/** How the blocks of one terrain material are drawn (game content). */
export type TerrainMaterialAppearance = {
  /** SVG of the block, under `public/` (e.g. `/assets/grass/block.svg`). */
  readonly textureSource: string;
  /** Tint by elevation. */
  readonly tint: TerrainTint;
  /**
   * Subtle per-column tint palette selected by seeded noise; each color multiplies the height tint.
   * Materials with the same `field` (by default, their own name) share the noise, so a path's grass
   * edges take the tint of the grass around them.
   */
  readonly noiseTints?: { readonly scale: number; readonly colors: readonly number[]; readonly field?: string };
  /**
   * Blocks the top of the block sits below the top of its cell (sand: `0.5`). Things standing on
   * it and the shadows on it sink by as much, and a block with an inset never hides the blocks
   * behind it. Defaults to `0`.
   */
  readonly topInset?: number;
  /** Other looks of its top blocks, each on a share of the columns. Without it, every top is the same. */
  readonly variants?: readonly TerrainVariant[];
  /** Looks of its top blocks by the neighbours they join (paths). They take precedence over `variants`. */
  readonly connections?: TerrainConnections;
};

/** How every terrain material is drawn: the scene receives it as content. */
export type TerrainAppearance = Readonly<Record<TerrainMaterial, TerrainMaterialAppearance>>;
