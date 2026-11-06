import type { FixedStepper, FixedStepperOptions } from "../../types";
import { TICKS_PER_SECOND } from "../time";

/** Real milliseconds of one simulation step: one world tick at {@link TICKS_PER_SECOND}. */
export const STEP_MS = 1000 / TICKS_PER_SECOND;

/**
 * Longest real frame time a single frame may feed into the simulation. After a long pause
 * (a hidden tab, a breakpoint) the simulation resumes instead of running a burst of steps.
 */
export const DEFAULT_MAX_FRAME_MS = 250;

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${String(value)}`);
  }
}

function assertTimeScale(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Time scale must be a non-negative finite number, got ${String(value)}`);
  }
}

/**
 * Creates a fixed-step accumulator: it turns variable real frame times into a whole number of
 * fixed simulation steps, so the simulation never depends on the frame rate.
 *
 * @throws `RangeError` when `stepMs` or `maxFrameMs` is not positive and finite, or
 * `timeScale` is negative or not finite.
 */
export function createFixedStepper(options: FixedStepperOptions = {}): FixedStepper {
  const { stepMs = STEP_MS, maxFrameMs = DEFAULT_MAX_FRAME_MS, timeScale = 1 } = options;
  assertPositive(stepMs, "Step length");
  assertPositive(maxFrameMs, "Max frame time");
  assertTimeScale(timeScale);

  return { stepMs, maxFrameMs, timeScale, paused: false, accumulatorMs: 0 };
}

/**
 * Feeds one real frame into the stepper and returns how many simulation steps to run now.
 * The real frame time is capped at `maxFrameMs`, then scaled by `timeScale`; the remainder
 * smaller than one step is kept for the next frame. Paused steppers and invalid frame times
 * (zero, negative, `NaN`, infinite) return `0` without accumulating.
 */
export function consumeFrame(stepper: FixedStepper, elapsedMs: number): number {
  if (stepper.paused || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;

  stepper.accumulatorMs += Math.min(elapsedMs, stepper.maxFrameMs) * stepper.timeScale;
  const steps = Math.floor(stepper.accumulatorMs / stepper.stepMs);
  stepper.accumulatorMs -= steps * stepper.stepMs;
  return steps;
}

/**
 * Fraction in `[0, 1)` of the next step already elapsed. The renderer uses it to interpolate
 * moving things between the last two simulation states.
 */
export function getInterpolationAlpha(stepper: FixedStepper): number {
  return stepper.accumulatorMs / stepper.stepMs;
}

/**
 * Changes how fast game time runs: `1` real time, `2` double speed, `0` frozen.
 *
 * @throws `RangeError` when `timeScale` is negative or not finite; the stepper is unchanged.
 */
export function setTimeScale(stepper: FixedStepper, timeScale: number): void {
  assertTimeScale(timeScale);
  stepper.timeScale = timeScale;
}
