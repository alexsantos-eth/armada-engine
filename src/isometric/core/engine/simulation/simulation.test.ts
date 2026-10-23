import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "../events";
import { createPlayerSystem, PLAYER_STEP, setPlayerWalk } from "../player";
import { TICKS_PER_DAY, TICKS_PER_SECOND } from "../time";
import type { SimulationEvents, WorldSystem } from "../../types";
import { generateWorld, type World } from "../world";
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
    setPlayerWalk(world.player, { up: true, down: false, left: false, right: false });
    const player = { ...world.player };

    expect(() => stepWorld(world, -1)).toThrow(RangeError);
    expect(() =>
      stepWorld(world, 1.5, { systems: [createPlayerSystem()], events: createEventBus<SimulationEvents>() }),
    ).toThrow(RangeError);
    expect(world.clock.tick).toBe(0);
    expect(world.player).toEqual(player);
  });

  it("walks the player once per tick, the same with and without events", () => {
    const walked = (withEvents: boolean) => {
      const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: [], startTick: 0 });
      setPlayerWalk(world.player, { up: false, down: true, left: false, right: false });
      const start = { x: world.player.x, y: world.player.y };
      stepWorld(world, 2, {
        systems: [createPlayerSystem()],
        events: withEvents ? createEventBus<SimulationEvents>() : undefined,
      });
      return { start, player: world.player };
    };

    const { start, player } = walked(false);
    expect(Math.hypot(player.x - start.x, player.y - start.y)).toBeCloseTo(2 * PLAYER_STEP);
    expect(walked(true).player).toEqual(player);
  });

  it("runs the systems every tick, in order, before the clock advances", () => {
    const world = newWorld(0);
    const log: string[] = [];
    const events = createEventBus<SimulationEvents>();
    events.on("tick", ({ tick }) => log.push(`tick ${String(tick)}`));
    const system = (id: string): WorldSystem<World> => ({
      id,
      step: (stepped, bus) => {
        expect(bus).toBe(events);
        log.push(`${id} ${String(stepped.clock.tick)}`);
      },
    });

    stepWorld(world, 2, { systems: [system("a"), system("b")], events });

    expect(log).toEqual(["a 0", "b 0", "tick 1", "a 1", "b 1", "tick 2"]);
  });

  it("leaves the player standing without its system", () => {
    const world = newWorld(0);
    setPlayerWalk(world.player, { up: true, down: false, left: false, right: false });
    const { x, y } = world.player;

    stepWorld(world, 5);

    expect(world.player).toMatchObject({ x, y });
  });

  it("lets event listeners see the player where it is at that tick", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: [], startTick: 0 });
    setPlayerWalk(world.player, { up: false, down: true, left: false, right: false });
    const events = createEventBus<SimulationEvents>();
    const seen: number[] = [];
    events.on("tick", () => seen.push(world.player.x));

    stepWorld(world, 2, { systems: [createPlayerSystem()], events });

    expect(seen[1]).toBe(world.player.x);
    expect(seen[0]).toBe(world.player.previous.x);
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

  it("runs its systems on every tick", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: [], startTick: 0 });
    setPlayerWalk(world.player, { up: false, down: true, left: false, right: false });
    const start = { x: world.player.x, y: world.player.y };
    const simulation = createSimulation(world, { systems: [createPlayerSystem()] });

    simulation.frame(100);

    expect(Math.hypot(world.player.x - start.x, world.player.y - start.y)).toBeCloseTo(2 * PLAYER_STEP);
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
