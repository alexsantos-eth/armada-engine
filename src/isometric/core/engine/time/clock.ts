import type { ClockTime, WorldClock } from "../../types";

/** Fixed simulation steps per real second. One step advances the world clock one tick. */
export const TICKS_PER_SECOND = 20;

/** Ticks in one game day: 20 real minutes at {@link TICKS_PER_SECOND}. */
export const TICKS_PER_DAY = 20 * 60 * TICKS_PER_SECOND;

/** Tick a new world starts at: 08:00 of day 0. */
export const WORLD_START_TICK = (8 / 24) * TICKS_PER_DAY;

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

function assertTick(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${String(value)}`);
  }
}

/**
 * Creates the world clock.
 *
 * @param tick Starting tick; defaults to {@link WORLD_START_TICK}.
 * @throws `RangeError` when `tick` is not a non-negative safe integer.
 */
export function createWorldClock(tick: number = WORLD_START_TICK): WorldClock {
  assertTick(tick, "World clock tick");
  return { tick };
}

/**
 * Advances the clock by whole simulation ticks. Only the simulation step calls this, never
 * the render frame, so the game time is the same on every machine.
 *
 * @param ticks Ticks to advance; defaults to `1`.
 * @returns The new tick.
 * @throws `RangeError` when `ticks` is not a non-negative safe integer or the result would
 * leave the safe integer range. The clock is left unchanged.
 */
export function advanceClock(clock: WorldClock, ticks = 1): number {
  assertTick(ticks, "Clock step");
  const next = clock.tick + ticks;
  assertTick(next, "World clock tick");
  clock.tick = next;
  return next;
}

/**
 * Fraction of the day for a tick, in `[0, 1)`: `0` midnight, `0.5` noon. Negative ticks
 * (offsets before the start) wrap into the previous day instead of going negative.
 */
export function getTimeOfDay(tick: number): number {
  return (((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY;
}

/** Reads a tick as day, hour and minute (for UI, logs and debugging). */
export function getClockTime(tick: number): ClockTime {
  const minutesOfDay = Math.floor(getTimeOfDay(tick) * HOURS_PER_DAY * MINUTES_PER_HOUR);

  return {
    day: Math.floor(tick / TICKS_PER_DAY),
    hour: Math.floor(minutesOfDay / MINUTES_PER_HOUR),
    minute: minutesOfDay % MINUTES_PER_HOUR,
  };
}
