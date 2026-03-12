import {createNoise2D} from "simplex-noise";
import type { PerlinTerrainOptions, TerrainPoint } from "../types/terrain";

const DEFAULT_SCALE = 9;
const DEFAULT_OCTAVES = 4;
const DEFAULT_PERSISTENCE = 0.5;
const DEFAULT_LACUNARITY = 2;
const DEFAULT_MIN_ELEVATION = 0;
const DEFAULT_MAX_ELEVATION = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFilledElevationLevels(
  targetElevation: number,
  minElevation: number,
): Array<{ elevation: number; useGroundTexture: boolean }> {
  const targetLevel = Math.floor(targetElevation);

  if (targetLevel < minElevation) {
    return [{ elevation: targetLevel, useGroundTexture: false }];
  }

  const depth = targetLevel - minElevation + 1;
  const useGroundSupportTexture = targetLevel > 2;

  return Array.from({ length: depth }, (_, index) => ({
    elevation: minElevation + index,
    useGroundTexture: useGroundSupportTexture && index < depth - 1,
  }));
}

export function generatePerlinTerrain(
  options: PerlinTerrainOptions,
): TerrainPoint[] {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));

  if (width === 0 || height === 0) {
    return [];
  }

  const scale = options.scale ?? DEFAULT_SCALE;
  const octaves = Math.max(1, Math.floor(options.octaves ?? DEFAULT_OCTAVES));
  const persistence = options.persistence ?? DEFAULT_PERSISTENCE;
  const lacunarity = options.lacunarity ?? DEFAULT_LACUNARITY;
  const seed = options.seed ?? 1337;

  const minElevation = Math.floor(options.minElevation ?? DEFAULT_MIN_ELEVATION);
  const maxElevation = Math.floor(options.maxElevation ?? DEFAULT_MAX_ELEVATION);
  const low = Math.min(minElevation, maxElevation);
  const high = Math.max(minElevation, maxElevation);
  const elevationRange = Math.max(0, high - low);

  // Use seeded random to initialize SimplexNoise
  const random = createSeededRandom(seed);
  const simplex = createNoise2D(random);

  const points: TerrainPoint[] = [];

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const sampleX = x / Math.max(0.0001, scale);
      const sampleY = y / Math.max(0.0001, scale);

      // Fractal brownian motion with simplex noise
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

      const normalizedNoise = amplitudeSum === 0 ? 0 : noiseValue / amplitudeSum;
      const normalized = clamp((normalizedNoise + 1) / 2, 0, 1);
      const elevation = low + Math.round(normalized * elevationRange);

      points.push({ x, y, elevation });
    }
  }

  return points;
}
