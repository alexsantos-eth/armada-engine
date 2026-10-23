import type { EventBus, FixedStepperOptions, Simulation, SimulationEvents, WorldSystem } from "../../types";
import { createEventBus } from "../events";
import { advanceClock, assertClockStep, TICKS_PER_DAY, TICKS_PER_HOUR } from "../time";
import type { World } from "../world";
import { consumeFrame, createFixedStepper, getInterpolationAlpha } from "./stepper";

function emitTickEvents(events: EventBus<SimulationEvents>, tick: number): void {
  if (tick % TICKS_PER_HOUR === 0) {
    const day = Math.floor(tick / TICKS_PER_DAY);
    const hour = (tick % TICKS_PER_DAY) / TICKS_PER_HOUR;
    events.emit("hourChanged", { tick, day, hour });
    if (hour === 0) events.emit("dayChanged", { tick, day });
  }
  if (events.has("tick")) events.emit("tick", { tick });
}

/** What runs while the world advances (`stepWorld()`). */
export type StepOptions = {
  /** Game systems, run every tick in this order before the clock advances. Defaults to none. */
  readonly systems?: readonly WorldSystem<World>[];
  /** Where the clock's events are emitted after each tick. */
  readonly events?: EventBus<SimulationEvents>;
};

/**
 * Advances the world by whole simulation ticks. This is the single entry point of the
 * simulation: one tick at a time, the game systems run in list order (they get `events` to emit
 * their own), then the clock advances, so the same ticks (and the same input) always produce the
 * same world.
 *
 * With `events`, after each tick it emits, in this order: `hourChanged` and `dayChanged` when the
 * tick starts an hour or a day, then `tick`. Every listener sees the world at that exact tick.
 *
 * @throws `RangeError` when `ticks` is not a non-negative safe integer or the clock would
 * leave the safe integer range; the world is unchanged and nothing is emitted.
 */
export function stepWorld(world: World, ticks: number, { systems = [], events }: StepOptions = {}): void {
  assertClockStep(world.clock, ticks);
  for (let step = 0; step < ticks; step += 1) {
    systems.forEach((system) => system.step(world, events));
    const tick = advanceClock(world.clock);
    if (events) emitTickEvents(events, tick);
  }
}

/** Options of {@link createSimulation}: the stepper's, and the game systems to run. */
export type SimulationOptions = FixedStepperOptions & Pick<StepOptions, "systems">;

/**
 * Creates the simulation loop of a world: a fixed-step accumulator that turns real frame
 * times into world ticks, runs `options.systems` on each (`stepWorld()`), and the event bus
 * systems use to react to them (`simulation.events`). It does not own a timer: the app calls
 * `frame()` once per rendered frame (from the Pixi ticker), so the loop stays pure and testable
 * without a browser.
 */
export function createSimulation(world: World, options: SimulationOptions = {}): Simulation<World> {
  const { systems, ...stepperOptions } = options;
  const stepper = createFixedStepper(stepperOptions);
  const events = createEventBus<SimulationEvents>();

  return {
    world,
    stepper,
    events,
    frame(elapsedMs) {
      const steps = consumeFrame(stepper, elapsedMs);
      if (steps > 0) stepWorld(world, steps, { systems, events });
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
