/** One wave that runs across the water: a sine of the column position and the time. */
export type WaterWave = {
  /** Direction it runs along, in columns (`x`, `y`), need not be unit length. */
  readonly direction: readonly [number, number];
  /** Columns from one crest to the next. */
  readonly length: number;
  /** Real milliseconds a crest takes to run one `length`. */
  readonly period: number;
  /** How far it lifts and lowers the water, in world pixels. */
  readonly amplitude: number;
};

/**
 * The waves of the water: a long slow swell and a shorter, quicker one across it, so the surface
 * never moves like one sheet nor like a metronome. Small: a tile's top is 20 world pixels tall.
 */
export const WATER_WAVES: readonly WaterWave[] = [
  { direction: [1, 0.35], length: 6, period: 4200, amplitude: 0.35 },
  { direction: [-0.4, 1], length: 3.5, period: 2900, amplitude: 0.2 },
];

/**
 * How far the water of column `(x, y)` is lifted at `timeMs` (real time), in world pixels
 * (positive is up): the sum of `waves`, each a sine of the column's place along its direction
 * minus the time, so crests run across the water and neighbouring columns move almost together.
 * Pure: the same column and time give the same lift, and nothing is created.
 */
export function getWaveLift(x: number, y: number, timeMs: number, waves: readonly WaterWave[] = WATER_WAVES): number {
  let lift = 0;
  for (const { direction, length, period, amplitude } of waves) {
    const along = (x * direction[0] + y * direction[1]) / Math.hypot(direction[0], direction[1]);
    lift += amplitude * Math.sin(2 * Math.PI * (along / length - timeMs / period));
  }
  return lift;
}
