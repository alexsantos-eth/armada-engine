import { describe, expect, it, vi } from "vitest";
import type { EntityDefinition, WorldPart } from "../../types";
import { classifyColumnSurfaces, generatePerlinTerrain } from "../terrain";
import { EntityConfigError } from "../entities";
import { DEFAULT_WORLD_SEED } from "../random";
import { canStandOn, createPlayerPart, PLAYER_PART, setPlayerWalk, stepPlayer } from "../player";
import { advanceClock, CLOCK_PART, createClockPart, TICKS_PER_DAY, WORLD_START_TICK } from "../time";
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

/** The parts the game registers: the clock and the player. */
const PARTS = [createClockPart(), createPlayerPart()];

/** A part that records what it gets: the world it is created from. */
const probePart = (): WorldPart<
  { columns: number; entities: number },
  number,
  { columns: readonly unknown[]; entities: readonly unknown[] }
> => ({
  id: "probe",
  version: 1,
  create: (world) => ({ columns: world.columns.length, entities: world.entities.length }),
  serialize: (state) => state.entities,
  restore: (saved, world) => ({ columns: world.columns.length, entities: saved }),
});

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

describe("World parts", () => {
  it("has no parts unless the game registers them", () => {
    const world = generateWorld({ seed: 5, width: 4, height: 4, entityDefinitions: [] });

    expect(world.parts.ids).toEqual([]);
    expect(world).not.toHaveProperty("clock");
    expect(world).not.toHaveProperty("player");
  });

  it("creates each registered part from the generated terrain and entities", () => {
    const world = generateWorld({
      seed: 42,
      width: 16,
      height: 16,
      entityDefinitions: DEFINITIONS,
      parts: [probePart()],
    });

    expect(world.parts.ids).toEqual(["probe"]);
    expect(world.parts.get(probePart())).toEqual({ columns: 256, entities: world.entities.length });
  });

  it("rejects two parts with the same id", () => {
    expect(() =>
      generateWorld({ width: 4, height: 4, entityDefinitions: [], parts: [probePart(), probePart()] }),
    ).toThrow('World part "probe" is registered twice');
  });

  it("does not change the terrain or the entities", () => {
    const options = { seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS };
    const bare = generateWorld(options);
    const full = generateWorld({ ...options, parts: [...PARTS, probePart()] });

    expect(full.columns).toEqual(bare.columns);
    expect(full.entities.map((entity) => entity.getData())).toEqual(bare.entities.map((entity) => entity.getData()));
  });
});

describe("World clock part", () => {
  it("starts a new world at the world start tick", () => {
    const world = generateWorld({ seed: 5, width: 4, height: 4, entityDefinitions: [], parts: PARTS });

    expect(world.parts.get(CLOCK_PART)).toEqual({ tick: WORLD_START_TICK });
  });

  it("accepts an explicit start tick", () => {
    const world = generateWorld({ seed: 5, width: 4, height: 4, entityDefinitions: [], parts: [createClockPart(0)] });

    expect(world.parts.get(CLOCK_PART).tick).toBe(0);
  });

  it("does not change what is generated", () => {
    const options = { seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS };
    const morning = generateWorld({ ...options, parts: [createClockPart()] });
    const night = generateWorld({ ...options, parts: [createClockPart(3 * TICKS_PER_DAY)] });

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

describe("World player part", () => {
  it("spawns standing on the walkable column nearest the centre, the same for the same seed", () => {
    const options = { seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS, parts: PARTS };
    const world = generateWorld(options);
    const player = world.parts.get(PLAYER_PART);

    expect(canStandOn(world, player.x, player.y, player.elevation)).toBe(true);
    expect(world.columnIndex.get(player.x, player.y)?.elevation).toBe(player.elevation);
    expect(player.walk).toEqual({ x: 0, y: 0 });
    expect(generateWorld(options).parts.get(PLAYER_PART)).toEqual(player);
  });

  it("saves where the player stands and restores it standing still", () => {
    const world = generateWorld({ seed: 42, width: 16, height: 16, entityDefinitions: DEFINITIONS, parts: PARTS });
    const player = world.parts.get(PLAYER_PART);
    setPlayerWalk(player, { up: true, down: false, left: false, right: true });
    stepPlayer(player, world, 3);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, PARTS).parts.get(PLAYER_PART);

    expect(snapshot.parts.player).toEqual({ version: 1, data: { x: player.x, y: player.y } });
    expect(restored).toMatchObject({ x: player.x, y: player.y, elevation: player.elevation });
    expect(restored.walk).toEqual({ x: 0, y: 0 });
  });
});

describe("serializeWorld / restoreWorld", () => {
  it("round-trips a world through JSON", () => {
    const world = generateWorld({ seed: 77, width: 12, height: 12, entityDefinitions: DEFINITIONS });

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot);

    expect(snapshot.version).toBe(WORLD_SNAPSHOT_VERSION);
    expect(WORLD_SNAPSHOT_VERSION).toBe(5);
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
    const world = generateWorld({ seed: 77, width: 4, height: 4, entityDefinitions: [], parts: PARTS });
    advanceClock(world.parts.get(CLOCK_PART), TICKS_PER_DAY + 123);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, PARTS);

    expect(snapshot.parts.clock).toEqual({ version: 1, data: { tick: WORLD_START_TICK + TICKS_PER_DAY + 123 } });
    expect(restored.parts.get(CLOCK_PART)).toEqual(world.parts.get(CLOCK_PART));
    expect(restored.parts.get(CLOCK_PART)).not.toBe(world.parts.get(CLOCK_PART));
  });

  it("rejects a snapshot with an invalid tick", () => {
    const snapshot = serializeWorld(
      generateWorld({ seed: 1, width: 4, height: 4, entityDefinitions: [], parts: PARTS }),
    );
    const parts = { ...snapshot.parts, clock: { version: 1, data: { tick: -5 } } };

    expect(() => restoreWorld({ ...snapshot, parts }, PARTS)).toThrow(RangeError);
  });

  it("stores every part under its id with its own version, and nothing else of them", () => {
    const world = generateWorld({
      seed: 7,
      width: 6,
      height: 6,
      entityDefinitions: [],
      parts: [...PARTS, probePart()],
    });
    const snapshot = serializeWorld(world);

    expect(Object.keys(snapshot)).toEqual(["version", "seed", "width", "height", "entities", "parts"]);
    expect(Object.keys(snapshot.parts)).toEqual(["clock", "player", "probe"]);
    expect(snapshot.parts.probe).toEqual({ version: 1, data: 0 });
  });

  it("restores a part added after the save as in a new world, so old saves keep loading", () => {
    const world = generateWorld({ seed: 7, width: 6, height: 6, entityDefinitions: [], parts: [createClockPart(9)] });
    const restored = restoreWorld(serializeWorld(world), PARTS);

    expect(restored.parts.get(CLOCK_PART).tick).toBe(9);
    expect(restored.parts.get(PLAYER_PART)).toEqual(
      generateWorld({ seed: 7, width: 6, height: 6, entityDefinitions: [], parts: PARTS }).parts.get(PLAYER_PART),
    );
  });

  it("keeps the saved parts nobody restores, so saving again loses nothing", () => {
    const world = generateWorld({ seed: 7, width: 6, height: 6, entityDefinitions: [], parts: PARTS });
    const snapshot = serializeWorld(world);
    const restored = restoreWorld(snapshot, [createClockPart()]);

    expect(restored.parts.ids).toEqual(["clock"]);
    expect(serializeWorld(restored)).toEqual(snapshot);
  });

  it("rejects a part saved at another version of it", () => {
    const snapshot = serializeWorld(
      generateWorld({ seed: 1, width: 4, height: 4, entityDefinitions: [], parts: PARTS }),
    );

    expect(() => restoreWorld(snapshot, [{ ...createClockPart(), version: 2 }])).toThrow(
      'Unsupported save of world part "clock": version 1, expected 2',
    );
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
    expect(() => restoreWorld({ ...snapshot, version: 4 as never })).toThrow("Unsupported world snapshot version 4");
  });
});
