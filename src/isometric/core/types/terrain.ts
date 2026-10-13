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
