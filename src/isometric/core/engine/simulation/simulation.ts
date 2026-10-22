import type { EventBus, FixedStepperOptions, Simulation, SimulationEvents } from "../../types";
import { createEventBus } from "../events";
import { stepPlayer } from "../player";
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

/**
 * Advances the world by whole simulation ticks. This is the single entry point of the
 * simulation: game systems run here, once per tick, in a fixed order, so the same ticks (and
 * the same input) always produce the same world. Today: the player walks (`stepPlayer()`),
 * then the clock advances.
 *
 * With `events`, the world advances one tick at a time and, after each tick, emits in this
 * order: `hourChanged` and `dayChanged` when the tick starts an hour or a day, then `tick`.
 * Every listener sees the world at that exact tick. Without `events`, the player still walks
 * every tick, and the clock jumps at once.
 *
 * @throws `RangeError` when `ticks` is not a non-negative safe integer or the clock would
 * leave the safe integer range; the world is unchanged and nothing is emitted.
 */
export function stepWorld(world: World, ticks: number, events?: EventBus<SimulationEvents>): void {
  assertClockStep(world.clock, ticks);
  if (events === undefined) {
    stepPlayer(world.player, world, ticks);
    advanceClock(world.clock, ticks);
    return;
  }

  for (let step = 0; step < ticks; step += 1) {
    stepPlayer(world.player, world);
    emitTickEvents(events, advanceClock(world.clock));
  }
}

/**
 * Creates the simulation loop of a world: a fixed-step accumulator that turns real frame
 * times into world ticks, and the event bus systems use to react to them
 * (`simulation.events`). It does not own a timer: the app calls `frame()` once per rendered
 * frame (from the Pixi ticker), so the loop stays pure and testable without a browser.
 */
export function createSimulation(world: World, options: FixedStepperOptions = {}): Simulation<World> {
  const stepper = createFixedStepper(options);
  const events = createEventBus<SimulationEvents>();

  return {
    world,
    stepper,
    events,
    frame(elapsedMs) {
      const steps = consumeFrame(stepper, elapsedMs);
      if (steps > 0) stepWorld(world, steps, events);
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
