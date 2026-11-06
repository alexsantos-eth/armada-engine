import { createNoise2D } from "simplex-noise";
import { createSeededRandom, deriveSeed } from "../random";

/** A smooth value in about `[-1, 1]` for each world position; the same position always gives the same value. */
export type NoiseField = (x: number, y: number) => number;

/** Options of {@link createNoiseField}. */
export type NoiseFieldOptions = {
  /** Sampling distance, in columns: about the size of a blob of the field. */
  readonly scale: number;
  /** Weight of a second octave at twice the frequency, which frays the edges of the blobs. Defaults to `0`. */
  readonly detail?: number;
};

/**
 * Seeded simplex noise over the world, with its own stream (`deriveSeed(seed, label)`), sampled at
 * absolute positions: a column gets the same value whatever area or chunk asks for it, so
 * whatever is built on the field meets without seams. For patches of things (bare ground, flowers).
 */
export function createNoiseField(seed: number, label: string, { scale, detail = 0 }: NoiseFieldOptions): NoiseField {
  const noise = createNoise2D(createSeededRandom(deriveSeed(seed, label)));
  return (x, y) => {
    const sampleX = x / scale;
    const sampleY = y / scale;
    return (noise(sampleX, sampleY) + detail * noise(sampleX * 2, sampleY * 2)) / (1 + detail);
  };
}
