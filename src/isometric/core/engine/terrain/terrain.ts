import { createNoise2D } from "simplex-noise";
import type { PerlinTerrainOptions, TerrainPoint } from "../../types";
import { createSeededRandom, DEFAULT_WORLD_SEED } from "../random";

/** Default sampling distance of the terrain noise field. */
export const DEFAULT_SCALE = 50;
/** Default number of noise layers combined per cell. */
export const DEFAULT_OCTAVES = 5;
/** Default amplitude multiplier between successive octaves. */
export const DEFAULT_PERSISTENCE = 0.5;
/** Default frequency multiplier between successive octaves. */
export const DEFAULT_LACUNARITY = 2;
/** Lowest elevation the generated terrain reaches, and the bottom its columns are filled down to. */
export const DEFAULT_MIN_ELEVATION = -3;
/** Highest elevation the generated terrain reaches. */
export const DEFAULT_MAX_ELEVATION = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Height map of `width` × `height` columns from `(originX, originY)`, sampled from seeded
 * multi-octave simplex noise at absolute world positions: the same seed gives every column the
 * same elevation whatever area it is generated with. Points come `x`-major (all `y` of the first
 * `x`, then the next).
 */
export function generatePerlinTerrain(options: PerlinTerrainOptions): TerrainPoint[] {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));

  if (width === 0 || height === 0) {
    return [];
  }

  const scale = options.scale ?? DEFAULT_SCALE;
  const octaves = Math.max(1, Math.floor(options.octaves ?? DEFAULT_OCTAVES));
  const persistence = options.persistence ?? DEFAULT_PERSISTENCE;
  const lacunarity = options.lacunarity ?? DEFAULT_LACUNARITY;
  const seed = options.seed ?? DEFAULT_WORLD_SEED;
  const originX = Math.floor(options.originX ?? 0);
  const originY = Math.floor(options.originY ?? 0);

  const minElevation = Math.floor(options.minElevation ?? DEFAULT_MIN_ELEVATION);
  const maxElevation = Math.floor(options.maxElevation ?? DEFAULT_MAX_ELEVATION);
  const low = Math.min(minElevation, maxElevation);
  const high = Math.max(minElevation, maxElevation);
  const elevationRange = Math.max(0, high - low);

  const random = createSeededRandom(seed);
  const simplex = createNoise2D(random);

  const points: TerrainPoint[] = [];

  for (let x = originX; x < originX + width; x += 1) {
    for (let y = originY; y < originY + height; y += 1) {
      const sampleX = x / Math.max(0.0001, scale);
      const sampleY = y / Math.max(0.0001, scale);

      let amplitude = 1;
      let frequency = 1;
      let noiseValue = 0;
      let amplitudeSum = 0;

      for (let octave = 0; octave < octaves; octave += 1) {
        const sampleXFreq = sampleX * frequency;
        const sampleYFreq = sampleY * frequency;

        noiseValue += simplex(sampleXFreq, sampleYFreq) * amplitude;
        amplitudeSum += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }

      const normalizedNoise = noiseValue / amplitudeSum;
      const normalized = clamp((normalizedNoise + 1) / 2, 0, 1);
      const elevation = low + Math.round(normalized * elevationRange);

      points.push({ x, y, elevation });
    }
  }

  return points;
}
