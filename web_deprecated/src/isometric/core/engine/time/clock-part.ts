import type { WorldClock, WorldPart, WorldPartKey } from "../../types";
import { createWorldClock, WORLD_START_TICK } from "./clock";

/** Saved game time: the clock's tick. */
export type SavedClock = { tick: number };

/** Key of the game clock part: read the clock of a world with `world.parts.get(CLOCK_PART)`. */
export const CLOCK_PART: WorldPartKey<WorldClock> = { id: "clock" };

/**
 * The game clock as a world part. A new world starts at `startTick`; a saved one keeps its tick.
 * Every world needs it: the simulation advances it (`stepWorld()`) and the scene reads it.
 *
 * @param startTick Tick a new world starts at; defaults to {@link WORLD_START_TICK} (08:00 of day 0).
 * @throws `RangeError` when `startTick` is not a non-negative safe integer.
 */
export function createClockPart(startTick: number = WORLD_START_TICK): WorldPart<WorldClock, SavedClock> {
  createWorldClock(startTick);
  return {
    id: CLOCK_PART.id,
    version: 1,
    create: () => createWorldClock(startTick),
    serialize: (clock) => ({ tick: clock.tick }),
    restore: (saved) => createWorldClock(saved.tick),
  };
}
