import { createNoise2D } from "simplex-noise";
import { createSeededRandom, deriveSeed } from "../random";

/** Lowest land elevation: the only one where grass can give way to bare ground. */
export const BARE_GROUND_ELEVATION = 0;
/** Sampling distance of the bare-ground noise, in columns: the rough size of a patch. */
export const BARE_GROUND_SCALE = 9;
/** Noise value (in `[-1, 1]`) above which a column is bare: higher gives fewer, smaller patches. */
export const BARE_GROUND_THRESHOLD = 0.35;

/** Weight of the second, finer octave that frays the edges of the patches. */
const DETAIL_WEIGHT = 0.35;

/** Whether the column at `(x, y)` is bare, if it is grass at {@link BARE_GROUND_ELEVATION}. */
export type BareGroundField = (x: number, y: number) => boolean;

/**
 * The patches of bare ground of a world: where grass did not grow. Seeded simplex noise sampled at
 * absolute world positions (its own stream, `deriveSeed(seed, "bare-ground")`), so every column
 * gets the same answer whatever area or chunk it is generated with, and chunks meet without seams.
 * Two octaves: the first shapes the patches, the second frays their edges.
 */
export function createBareGroundField(seed: number): BareGroundField {
  const noise = createNoise2D(createSeededRandom(deriveSeed(seed, "bare-ground")));
  return (x, y) => {
    const sampleX = x / BARE_GROUND_SCALE;
    const sampleY = y / BARE_GROUND_SCALE;
    const value = (noise(sampleX, sampleY) + DETAIL_WEIGHT * noise(sampleX * 2, sampleY * 2)) / (1 + DETAIL_WEIGHT);
    return value > BARE_GROUND_THRESHOLD;
  };
}
