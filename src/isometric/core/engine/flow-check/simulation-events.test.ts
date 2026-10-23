import { describe, expect, it, vi } from "vitest";
import type { SimulationEvents } from "../../types";
import { createEventBus } from "../events";
import { CLOCK_PART, createClockPart, TICKS_PER_DAY, TICKS_PER_HOUR } from "../time";
import { generateWorld } from "../world";
import { createSimulation, stepWorld } from "../simulation";

const newWorld = (startTick?: number) =>
  generateWorld({ seed: 1, width: 4, height: 4, entityDefinitions: [], parts: [createClockPart(startTick)] });

/** Records every simulation event, in emission order. */
function record(events = createEventBus<SimulationEvents>()) {
  const log: string[] = [];
  events.on("tick", ({ tick }) => log.push(`tick ${String(tick)}`));
  events.on("hourChanged", ({ tick, day, hour }) => log.push(`hour ${String(tick)} d${String(day)} h${String(hour)}`));
  events.on("dayChanged", ({ tick, day }) => log.push(`day ${String(tick)} d${String(day)}`));
  return { events, log };
}

describe("stepWorld with events", () => {
  it("advances one tick at a time and emits hour and day changes before the tick", () => {
    const world = newWorld(TICKS_PER_DAY - 1);
    const { events, log } = record();

    stepWorld(world, 2, { events });

    expect(world.parts.get(CLOCK_PART).tick).toBe(TICKS_PER_DAY + 1);
    expect(log).toEqual([
      `hour ${String(TICKS_PER_DAY)} d1 h0`,
      `day ${String(TICKS_PER_DAY)} d1`,
      `tick ${String(TICKS_PER_DAY)}`,
      `tick ${String(TICKS_PER_DAY + 1)}`,
    ]);
  });

  it("emits one hourChanged per hour crossed, with the hour of the day", () => {
    const world = newWorld(0);
    const events = createEventBus<SimulationEvents>();
    const hours: number[] = [];
    events.on("hourChanged", ({ hour }) => hours.push(hour));

    stepWorld(world, 3 * TICKS_PER_HOUR, { events });

    expect(hours).toEqual([1, 2, 3]);
  });

  it("lets listeners read the world at the tick being announced", () => {
    const world = newWorld(0);
    const events = createEventBus<SimulationEvents>();
    const seen: number[] = [];
    events.on("tick", ({ tick }) => {
      expect(world.parts.get(CLOCK_PART).tick).toBe(tick);
      seen.push(tick);
    });

    stepWorld(world, 3, { events });

    expect(seen).toEqual([1, 2, 3]);
  });

  it("does not build tick payloads nobody listens to", () => {
    const world = newWorld(0);
    const events = createEventBus<SimulationEvents>();
    const emit = vi.spyOn(events, "emit");

    stepWorld(world, 5, { events });

    expect(emit).not.toHaveBeenCalled();
    expect(world.parts.get(CLOCK_PART).tick).toBe(5);
  });

  it("rejects invalid tick counts without changing the world or emitting", () => {
    const world = newWorld(0);
    const { events, log } = record();

    expect(() => stepWorld(world, 1.5, { events })).toThrow(RangeError);
    expect(() => stepWorld(newWorld(1), Number.MAX_SAFE_INTEGER, { events })).toThrow(RangeError);
    expect(world.parts.get(CLOCK_PART).tick).toBe(0);
    expect(log).toEqual([]);
  });
});

describe("createSimulation events", () => {
  it("exposes a bus that receives the events of every frame", () => {
    const simulation = createSimulation(newWorld(TICKS_PER_HOUR - 1));
    const { log } = record(simulation.events);

    simulation.frame(100);

    expect(log).toEqual([
      `hour ${String(TICKS_PER_HOUR)} d0 h1`,
      `tick ${String(TICKS_PER_HOUR)}`,
      `tick ${String(TICKS_PER_HOUR + 1)}`,
    ]);
  });

  it("is deterministic: the same frames emit the same events in the same order", () => {
    const frames = [16.7, 250, 1000, 33.3, 250, 8.1];
    const run = () => {
      const simulation = createSimulation(newWorld(TICKS_PER_DAY - 50), { timeScale: 40 });
      const { log } = record(simulation.events);
      frames.forEach((elapsed) => simulation.frame(elapsed));
      return log;
    };

    const first = run();
    expect(first.some((line) => line.startsWith("day "))).toBe(true);
    expect(run()).toEqual(first);
  });
});
