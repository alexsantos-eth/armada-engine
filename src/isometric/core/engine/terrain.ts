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

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash: number, x: number, y: number): number {
  const gradient = hash & 3;

  if (gradient === 0) {
    return x + y;
  }

  if (gradient === 1) {
    return -x + y;
  }

  if (gradient === 2) {
    return x - y;
  }

  return -x - y;
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

function createPermutation(seed: number): number[] {
  const random = createSeededRandom(seed);
  const permutation = Array.from({ length: 256 }, (_, index) => index);

  for (let index = permutation.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [permutation[index], permutation[swapIndex]] = [
      permutation[swapIndex],
      permutation[index],
    ];
  }

  return permutation.concat(permutation);
}

function perlin2D(x: number, y: number, permutation: number[]): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = permutation[permutation[xi] + yi];
  const ab = permutation[permutation[xi] + yi + 1];
  const ba = permutation[permutation[xi + 1] + yi];
  const bb = permutation[permutation[xi + 1] + yi + 1];

  const xBlend1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const xBlend2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

  return lerp(xBlend1, xBlend2, v);
}

function fractalNoise(
  x: number,
  y: number,
  permutation: number[],
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let noiseValue = 0;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    noiseValue += perlin2D(x * frequency, y * frequency, permutation) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  if (amplitudeSum === 0) {
    return 0;
  }

  return noiseValue / amplitudeSum;
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

  const permutation = createPermutation(seed);
  const points: TerrainPoint[] = [];

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const sampleX = x / Math.max(0.0001, scale);
      const sampleY = y / Math.max(0.0001, scale);

      const noise = fractalNoise(
        sampleX,
        sampleY,
        permutation,
        octaves,
        persistence,
        lacunarity,
      );

      const normalized = clamp((noise + 1) / 2, 0, 1);
      const elevation = low + Math.round(normalized * elevationRange);

      points.push({ x, y, elevation });
    }
  }

  return points;
}
