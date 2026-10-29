import { PLAYER_JUMP_SPEED } from "../player";
import type { GridPoint } from "../../types";

/** Real milliseconds the body squashes after a landing. */
export const LANDING_SQUASH_MS = 180;

/** Real milliseconds the body stretches after a take-off. */
export const TAKEOFF_STRETCH_MS = 120;

/** Real milliseconds a puff of dust lasts, at a take-off or a landing. */
export const DUST_MS = 360;

/** Landings softer than this, in blocks per tick (a step down onto sand), raise no dust. */
export const DUST_MIN_IMPACT = 0.1;

/** How much of an effect lasting `duration` is left `ms` after it started: `1` → `0`, `0` after. */
function remaining(ms: number, duration: number): number {
  return Math.max(0, 1 - Math.max(0, ms) / duration);
}

/**
 * Scale of the body `ms` real milliseconds after a take-off (`sinceTakeoff`) or a landing at
 * `impact` blocks per tick (`sinceLanding`), about its feet: stretched up as it takes off, squashed
 * as it lands (harder landings squash more), `{ x: 1, y: 1 }` once both are over.
 */
export function getBodyScale(sinceTakeoff: number, sinceLanding: number, impact: number): GridPoint {
  const squash = remaining(sinceLanding, LANDING_SQUASH_MS) * Math.min(1.5, Math.max(0.25, impact / PLAYER_JUMP_SPEED));
  const stretch = remaining(sinceTakeoff, TAKEOFF_STRETCH_MS);
  return { x: 1 + 0.1 * squash - 0.06 * stretch, y: 1 - 0.14 * squash + 0.1 * stretch };
}

/**
 * A puff of dust `ms` real milliseconds after it rose: how far it spread (a scale, from `0.6`) and
 * how opaque it is, or `undefined` once it is gone ({@link DUST_MS}).
 */
export function getDust(ms: number): { readonly scale: number; readonly alpha: number } | undefined {
  const left = remaining(ms, DUST_MS);
  if (left === 0) return undefined;
  return { scale: 0.6 + 0.8 * (1 - left), alpha: 0.55 * left };
}
