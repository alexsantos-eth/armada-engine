export type TerrainPoint = {
  x: number;
  y: number;
  elevation: number;
};

export type PerlinTerrainOptions = {
  width: number;
  height: number;
  seed?: number;
  scale?: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  minElevation?: number;
  maxElevation?: number;
};
