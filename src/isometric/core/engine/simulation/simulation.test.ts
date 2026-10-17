import { describe, expect, it, vi } from "vitest";
import { TICKS_PER_DAY, TICKS_PER_SECOND } from "../time";
import { generateWorld } from "../world";
import { createSimulation, resolveTimeScale, stepWorld } from "./simulation";

const newWorld = (startTick?: number) =>
  generateWorld({ seed: 1, width: 4, height: 4, entityDefinitions: [], startTick });

describe("stepWorld", () => {
  it("advances the world clock by whole ticks", () => {
    const world = newWorld(0);

    stepWorld(world, 3);

    expect(world.clock.tick).toBe(3);
  });

  it("rejects invalid tick counts without changing the world", () => {
    const world = newWorld(0);

    expect(() => stepWorld(world, -1)).toThrow(RangeError);
    expect(world.clock.tick).toBe(0);
  });
});

describe("createSimulation", () => {
  it("turns real frame time into world ticks and reports the frame", () => {
    const world = newWorld(0);
    const simulation = createSimulation(world);

    const idle = simulation.frame(40);
    expect(idle.steps).toBe(0);
    expect(idle.tick).toBe(0);
    expect(idle.alpha).toBeCloseTo(0.8);

    const frame = simulation.frame(70);
    expect(frame.steps).toBe(2);
    expect(frame.tick).toBe(2);
    expect(frame.alpha).toBeCloseTo(0.2);
    expect(world.clock.tick).toBe(2);
  });

  it("runs one game day in 20 real minutes at 60 FPS", () => {
    const world = newWorld(0);
    const simulation = createSimulation(world);

    for (let frame = 0; frame < 20 * 60 * 60; frame += 1) simulation.frame(1000 / 60);

    expect(Math.abs(world.clock.tick - TICKS_PER_DAY)).toBeLessThanOrEqual(1);
  });

  it("honours the stepper options and lets the game pause and speed up time", () => {
    const world = newWorld(0);
    const simulation = createSimulation(world, { timeScale: 2 });

    const ticksPerCappedFrame = (2 * 250) / (1000 / TICKS_PER_SECOND);
    simulation.frame(1000); // capped at 250 ms of real time, then doubled
    expect(world.clock.tick).toBe(ticksPerCappedFrame);
    simulation.frame(250);
    expect(world.clock.tick).toBe(2 * ticksPerCappedFrame);

    simulation.stepper.paused = true;
    expect(simulation.frame(250).steps).toBe(0);
  });

  it("is deterministic: the same frame times give the same ticks, without Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const frames = [16.7, 33.1, 8.2, 250, 1000, 16.6];
    const run = () => {
      const simulation = createSimulation(newWorld(0));
      return frames.map((elapsed) => simulation.frame(elapsed));
    };

    expect(run()).toEqual(run());
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });
});

describe("resolveTimeScale", () => {
  it("defaults to real time", () => {
    expect(resolveTimeScale("")).toBe(1);
    expect(resolveTimeScale("?seed=4")).toBe(1);
  });

  it("reads the timeScale query parameter", () => {
    expect(resolveTimeScale("?timeScale=60")).toBe(60);
    expect(resolveTimeScale("?seed=4&timeScale=0.5")).toBe(0.5);
    expect(resolveTimeScale("?timeScale=0")).toBe(0);
  });

  it.each(["?timeScale=", "?timeScale=fast", "?timeScale=-2", "?timeScale=Infinity"])(
    "falls back to real time for the invalid value %s",
    (search) => {
      expect(resolveTimeScale(search)).toBe(1);
    },
  );
});
