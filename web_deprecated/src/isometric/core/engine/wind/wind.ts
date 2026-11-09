import type { EntitySway } from "../../types";
import { deriveSeed } from "../random";

/** Strength of the wind when nothing else says (no weather yet): every sway at its full amplitude. */
export const DEFAULT_WIND_STRENGTH = 1.5;

/** Weight of the second, faster wave in {@link getSwayOffset}: what keeps a sway from ticking like a metronome. */
export const SWAY_GUST_WEIGHT = 0.3;

/** How much faster the second wave of {@link getSwayOffset} is than the first. */
export const SWAY_GUST_RATE = 2.3;

/**
 * Phase (radians, in `[0, 2π)`) of the entity `id` in its sway: a hash of its id, so two
 * neighbouring trees do not lean together and a tree leans the same way whenever it is shown.
 */
export function getSwayPhase(id: string): number {
  return (deriveSeed(0, `sway@${id}`) / 2 ** 32) * 2 * Math.PI;
}

/**
 * How far the top of a swaying sprite leans sideways, in world pixels (positive to the right), at
 * `timeMs`: two waves of `sway.period` and {@link SWAY_GUST_RATE} times faster, shifted by `phase`
 * ({@link getSwayPhase}), never past `sway.amplitude × strength`. Pure: the same time gives the same
 * lean, and nothing is created.
 */
export function getSwayOffset(
  sway: Pick<EntitySway, "amplitude" | "period">,
  phase: number,
  timeMs: number,
  strength = DEFAULT_WIND_STRENGTH,
): number {
  const angle = (2 * Math.PI * timeMs) / sway.period + phase;
  const wave = (1 - SWAY_GUST_WEIGHT) * Math.sin(angle) + SWAY_GUST_WEIGHT * Math.sin(SWAY_GUST_RATE * angle + phase);
  return sway.amplitude * strength * wave;
}
