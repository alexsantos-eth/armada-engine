import type { FixedStepperOptions, Simulation } from "../../types";
import { advanceClock } from "../time";
import type { World } from "../world";
import { consumeFrame, createFixedStepper, getInterpolationAlpha } from "./stepper";

/**
 * Advances the world by whole simulation ticks. This is the single entry point of the
 * simulation: game systems (weather, needs, AI) will run here, once per tick, in a fixed
 * order, so the same ticks always produce the same world.
 *
 * @throws `RangeError` when `ticks` is not a non-negative safe integer; the world is unchanged.
 */
export function stepWorld(world: World, ticks: number): void {
  advanceClock(world.clock, ticks);
}

/**
 * Creates the simulation loop of a world: a fixed-step accumulator that turns real frame
 * times into world ticks. It does not own a timer: the app calls `frame()` once per rendered
 * frame (from the Pixi ticker), so the loop stays pure and testable without a browser.
 */
export function createSimulation(world: World, options: FixedStepperOptions = {}): Simulation<World> {
  const stepper = createFixedStepper(options);

  return {
    world,
    stepper,
    frame(elapsedMs) {
      const steps = consumeFrame(stepper, elapsedMs);
      if (steps > 0) stepWorld(world, steps);
      return { steps, alpha: getInterpolationAlpha(stepper), tick: world.clock.tick };
    },
  };
}

/**
 * Reads the game speed from the URL query (`?timeScale=60` runs a game day in 20 real
 * seconds), for debugging the day cycle. Missing, negative or non-numeric values give `1`
 * (real time); `0` freezes time.
 *
 * @param search The query string, e.g. `location.search`.
 */
export function resolveTimeScale(search: string): number {
  const value = new URLSearchParams(search).get("timeScale");
  const scale = value === null || value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(scale) && scale >= 0 ? scale : 1;
}
