import { describe, expect, it, vi } from "vitest";
import type { EntityDefinition } from "../../types";
import { classifyColumnSurfaces, generatePerlinTerrain } from "../terrain";
import { EntityConfigError } from "../entities";
import { DEFAULT_WORLD_SEED } from "../random";
import { canStandOn, setPlayerWalk, stepPlayer } from "../player";
import { advanceClock, TICKS_PER_DAY, WORLD_START_TICK } from "../time";
import {
  generateWorld,
  restoreWorld,
  serializeWorld,
  TERRAIN_HEIGHT,
  TERRAIN_WIDTH,
  WORLD_SNAPSHOT_VERSION,
  type WorldSnapshot,
} from "./world";

const ROCK: EntityDefinition = {
  id: "rock",
  textureSource: "/assets/rock/block.svg",
  height: 1,
  spawnChance: 0.3,
  surface: "grass",
};
const HOUSE: EntityDefinition = {
  id: "house",
  textureSource: "/assets/house/block.svg",
  height: 1,
  spawnChance: 0.2,
  surface: "grass",
  colorReplacements: { "#000000": ["#111111", "#222222", "#333333"] },
};
const DEFINITIONS = [ROCK, HOUSE];

describe("generateWorld", () => {
  it("builds one column per cell typed with its classified surface, without Pixi or window", () => {
    const world = generateWorld({ seed: 5, width: 10, height: 6, entityDefinitions: [] });
    const surfaces = classifyColumnSurfaces(world.columns);

    expect(world.seed).toBe(5);
    expect(world.width).toBe(10);
    expect(world.height).toBe(6);
    expect(world.columns).toHaveLength(60);
    expect(world.columns.every(({ x, y, type }) => type === surfaces.get(x, y))).toBe(true);
    // The column's `type` is the only record of its surface.
    expect(world).not.toHaveProperty("surfaces");
    expect(world.entities).toEqual([]);
  });

  it("uses the default seed and size", () => {
    const world = generateWorld({ entityDefinitions: DEFINITIONS });

    expect(world.seed).toBe(DEFAULT_WORLD_SEED);
    expect(world.columns).toHaveLength(TERRAIN_WIDTH * TERRAIN_HEIGHT);
    expect(world.entities.length).toBeGreaterThan(0);
  });

  it("validates the content before generating anything", () => {
    expect(() => generateWorld({ entityDefinitions: [ROCK, { ...ROCK, spawnChance: 3 }] })).toThrow(EntityConfigError);
  });

  it("is fully deterministic for a seed and never uses Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const options = { seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS };

    const first = generateWorld(options);
    const second = generateWorld(options);
    const other = generateWorld({ ...options, seed: 43 });

    const shape = (world: typeof first) => ({
      columns: world.columns.map((box) => [box.x, box.y, box.elevation]),
      entities: world.entities.map((entity) => entity.getData()),
    });
    expect(shape(second)).toEqual(shape(first));
    expect(shape(other)).not.toEqual(shape(first));
    expect(first.entities.some(({ type }) => type === "house")).toBe(true);
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("uses the raw noise terrain, without reshaping any area", () => {
    const world = generateWorld({ seed: 9, entityDefinitions: [] });

    expect(world.columns.map(({ x, y, elevation }) => ({ x, y, elevation }))).toEqual(
      generatePerlinTerrain({ width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT, seed: 9 }),
    );
  });

  it("keeps color variation independent from entity placement", () => {
    const withColors = generateWorld({ seed: 3, width: 16, height: 16, entityDefinitions: [ROCK, HOUSE] });
    const plain = generateWorld({
      seed: 3,
      width: 16,
      height: 16,
      entityDefinitions: [ROCK, { ...HOUSE, colorReplacements: undefined }],
    });

    expect(plain.entities.map(({ id }) => id)).toEqual(withColors.entities.map(({ id }) => id));
  });
});

describe("World clock", () => {
  it("starts a new world at the world start tick", () => {
    const world = generateWorld({ seed: 5, width: 4, height: 4, entityDefinitions: [] });

    expect(world.clock).toEqual({ tick: WORLD_START_TICK });
  });

  it("accepts an explicit start tick", () => {
    const world = generateWorld({ seed: 5, width: 4, height: 4, entityDefinitions: [], startTick: 0 });

    expect(world.clock.tick).toBe(0);
  });

  it("rejects an invalid start tick", () => {
    expect(() => generateWorld({ width: 4, height: 4, entityDefinitions: [], startTick: -1 })).toThrow(RangeError);
  });

  it("does not change what is generated", () => {
    const options = { seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS };
    const morning = generateWorld(options);
    const night = generateWorld({ ...options, startTick: 3 * TICKS_PER_DAY });

    expect(night.entities.map((entity) => entity.getData())).toEqual(
      morning.entities.map((entity) => entity.getData()),
    );
  });
});

describe("World occupancy", () => {
  it("indexes every entity over its footprint", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS });

    expect(world.occupancy.size).toBe(world.entities.length);
    world.entities.forEach((entity) => expect(world.occupancy.at(entity.x, entity.y)).toContain(entity));
  });

  it("is rebuilt on restore instead of being saved", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS });
    const snapshot = serializeWorld(world);
    const restored = restoreWorld(snapshot);

    expect(snapshot).not.toHaveProperty("occupancy");
    expect(restored.occupancy.size).toBe(world.entities.length);
    restored.entities.forEach((entity) => expect(restored.occupancy.at(entity.x, entity.y)).toEqual([entity]));
  });
});

describe("World column index", () => {
  it("finds every column by its cell, and is rebuilt on restore instead of being saved", () => {
    const world = generateWorld({ seed: 3, width: 6, height: 5, entityDefinitions: [] });
    const snapshot = serializeWorld(world);

    expect(world.columnIndex.size).toBe(world.columns.length);
    world.columns.forEach((column) => expect(world.columnIndex.get(column.x, column.y)).toBe(column));
    expect(snapshot).not.toHaveProperty("columnIndex");
    expect(restoreWorld(snapshot).columnIndex.size).toBe(world.columns.length);
  });
});

describe("World player", () => {
  it("spawns standing on the walkable column nearest the centre, the same for the same seed", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS });
    const { x, y, elevation, walk } = world.player;

    expect(canStandOn(world, x, y, elevation)).toBe(true);
    expect(world.columnIndex.get(x, y)?.elevation).toBe(elevation);
    expect(walk).toEqual({ x: 0, y: 0 });
    expect(generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS }).player).toEqual(
      world.player,
    );
  });

  it("saves where the player stands and restores it standing still", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS });
    setPlayerWalk(world.player, { up: true, down: false, left: false, right: true });
    stepPlayer(world.player, world, 3);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot);

    expect(snapshot.player).toEqual({ x: world.player.x, y: world.player.y });
    expect(restored.player).toMatchObject({ x: world.player.x, y: world.player.y, elevation: world.player.elevation });
    expect(restored.player.walk).toEqual({ x: 0, y: 0 });
  });
});

describe("serializeWorld / restoreWorld", () => {
  it("round-trips a world through JSON", () => {
    const world = generateWorld({ seed: 77, width: 12, height: 12, entityDefinitions: DEFINITIONS });

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot);

    expect(snapshot.version).toBe(WORLD_SNAPSHOT_VERSION);
    expect(WORLD_SNAPSHOT_VERSION).toBe(4);
    expect(restored.seed).toBe(77);
    expect(restored.columns.map((b) => [b.x, b.y, b.elevation])).toEqual(
      world.columns.map((b) => [b.x, b.y, b.elevation]),
    );
    expect(restored.columns.map(({ type }) => type)).toEqual(world.columns.map(({ type }) => type));
    expect(restored.entities.map((e) => [e.x, e.y, e.getData()])).toEqual(
      world.entities.map((e) => [e.x, e.y, e.getData()]),
    );
  });

  it("saves and restores the game time", () => {
    const world = generateWorld({ seed: 77, width: 4, height: 4, entityDefinitions: [] });
    advanceClock(world.clock, TICKS_PER_DAY + 123);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot);

    expect(snapshot.tick).toBe(WORLD_START_TICK + TICKS_PER_DAY + 123);
    expect(restored.clock).toEqual(world.clock);
    expect(restored.clock).not.toBe(world.clock);
  });

  it("rejects a snapshot with an invalid tick", () => {
    const snapshot = serializeWorld(generateWorld({ seed: 1, width: 4, height: 4, entityDefinitions: [] }));

    expect(() => restoreWorld({ ...snapshot, tick: -5 })).toThrow(RangeError);
  });

  it("keeps entity changes made after generation instead of regenerating them", () => {
    const world = generateWorld({ seed: 77, width: 12, height: 12, entityDefinitions: DEFINITIONS });
    const snapshot = serializeWorld({ ...world, entities: world.entities.slice(1) });

    expect(restoreWorld(snapshot).entities).toHaveLength(world.entities.length - 1);
  });

  it("rejects snapshots from an unknown version", () => {
    const snapshot = serializeWorld(generateWorld({ seed: 1, width: 4, height: 4, entityDefinitions: [] }));

    expect(() => restoreWorld({ ...snapshot, version: 99 as never })).toThrow("Unsupported world snapshot version 99");
    expect(() => restoreWorld({ ...snapshot, version: 1 as never })).toThrow("Unsupported world snapshot version 1");
    expect(() => restoreWorld({ ...snapshot, version: 2 as never })).toThrow("Unsupported world snapshot version 2");
    expect(() => restoreWorld({ ...snapshot, version: 3 as never })).toThrow("Unsupported world snapshot version 3");
  });
});
