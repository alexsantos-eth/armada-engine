import { describe, expect, it, vi } from "vitest";
import type { EntityDefinition, WorldPart } from "../../types";
import { classifyColumnSurfaces, generatePerlinTerrain, generateTerrainColumns } from "../terrain";
import { EntityConfigError, fingerprintEntityDefinitions } from "../entities";
import { CHUNK_SIZE } from "../grid";
import { DEFAULT_WORLD_SEED } from "../random";
import { canStandOn, createPlayerPart, fitsPlayerAt, PLAYER_PART, setPlayerWalk, stepPlayer } from "../player";
import { advanceClock, CLOCK_PART, createClockPart, TICKS_PER_DAY, WORLD_START_TICK } from "../time";
import { createFixedChunkSource } from "./sources";
import {
  createWorld,
  generateWorld,
  restoreWorld,
  serializeWorld,
  START_LOAD_RADIUS,
  type World,
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

/** Every column of the loaded chunks. */
const columnsOf = (world: World) => [...world.chunks.values()].flatMap(({ columns }) => columns);
/** Every entity of the loaded chunks. */
const entitiesOf = (world: World) => [...world.chunks.values()].flatMap(({ entities }) => entities);

/** A bounded world of `width` × `height` columns. */
const sized = (width: number, height: number) => ({ size: { width, height } });

/** A part that records what it gets: the world it is created from. */
const probePart = (): WorldPart<
  { columns: number; entities: number },
  number,
  { columnIndex: { size: number }; occupancy: { size: number } }
> => ({
  id: "probe",
  version: 1,
  create: (world) => ({ columns: world.columnIndex.size, entities: world.occupancy.size }),
  serialize: (state) => state.entities,
  restore: (saved, world) => ({ columns: world.columnIndex.size, entities: saved }),
});

describe("generateWorld", () => {
  it("builds one column per cell typed with its classified surface, without Pixi or window", () => {
    const world = generateWorld({ seed: 5, ...sized(10, 6), entityDefinitions: [] });
    const surfaces = classifyColumnSurfaces(columnsOf(world));

    expect(world.seed).toBe(5);
    expect(world.bounds).toEqual({ minX: 0, minY: 0, maxX: 9, maxY: 5 });
    expect(world.centre).toEqual({ x: 4.5, y: 2.5 });
    expect(world.chunks.size).toBe(1);
    expect(columnsOf(world)).toHaveLength(60);
    expect(columnsOf(world).every(({ x, y, type }) => type === surfaces.get(x, y))).toBe(true);
    // The column's `type` is the only record of its surface.
    expect(world).not.toHaveProperty("surfaces");
    expect(entitiesOf(world)).toEqual([]);
  });

  it("uses the default seed and is unbounded, with the chunks around chunk (0, 0) loaded", () => {
    const world = generateWorld({ entityDefinitions: DEFINITIONS });

    expect(world.seed).toBe(DEFAULT_WORLD_SEED);
    expect(world.bounds).toBeUndefined();
    expect(world.centre).toEqual({ x: (CHUNK_SIZE - 1) / 2, y: (CHUNK_SIZE - 1) / 2 });
    expect(START_LOAD_RADIUS).toBe(1);
    expect([...world.chunks.values()].map(({ coord }) => coord)).toEqual(
      [-1, 0, 1].flatMap((cy) => [-1, 0, 1].map((cx) => ({ cx, cy }))),
    );
    expect(columnsOf(world)).toHaveLength(9 * CHUNK_SIZE * CHUNK_SIZE);
    expect(entitiesOf(world).length).toBeGreaterThan(0);
  });

  it("generates a chunk the same whatever else is loaded: the world has no seams", () => {
    const world = generateWorld({ seed: 4, entityDefinitions: DEFINITIONS });
    const far = generateWorld({ seed: 4, entityDefinitions: DEFINITIONS });
    far.chunks.stream([{ cx: 5, cy: 5 }], { loadRadius: 0, keepRadius: 0 });
    far.chunks.load({ cx: 1, cy: 0 });
    const chunkOf = (of: World) => of.chunks.get({ cx: 1, cy: 0 });

    expect(far.chunks.has({ cx: 0, cy: 0 })).toBe(false);
    expect(chunkOf(far)?.columns).toEqual(chunkOf(world)?.columns);
    expect(chunkOf(far)?.entities.map((entity) => entity.getData())).toEqual(
      chunkOf(world)?.entities.map((entity) => entity.getData()),
    );
    // Typed with the neighbours' columns, as if the whole area had been generated at once.
    const area = { minX: -32, minY: -32, maxX: 63, maxY: 63 };
    const whole = generateTerrainColumns(area, { seed: 4 });
    expect(
      columnsOf(world)
        .map(({ x, y, elevation, type }) => [x, y, elevation, type])
        .sort(),
    ).toEqual(whole.map(({ x, y, elevation, type }) => [x, y, elevation, type]).sort());
  });

  it("validates the content before generating anything", () => {
    expect(() => generateWorld({ entityDefinitions: [ROCK, { ...ROCK, spawnChance: 3 }] })).toThrow(EntityConfigError);
  });

  it("is fully deterministic for a seed and never uses Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const options = { seed: 42, entityDefinitions: DEFINITIONS };

    const first = generateWorld(options);
    const second = generateWorld(options);
    const other = generateWorld({ ...options, seed: 43 });

    const shape = (world: typeof first) => ({
      columns: columnsOf(world).map((box) => [box.x, box.y, box.elevation]),
      entities: entitiesOf(world).map((entity) => entity.getData()),
    });
    expect(shape(second)).toEqual(shape(first));
    expect(shape(other)).not.toEqual(shape(first));
    expect(entitiesOf(first).some(({ type }) => type === "house")).toBe(true);
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("uses the raw noise terrain, without reshaping any area", () => {
    const world = generateWorld({ seed: 9, ...sized(32, 32), entityDefinitions: [] });

    expect(columnsOf(world).map(({ x, y, elevation }) => ({ x, y, elevation }))).toEqual(
      generatePerlinTerrain({ width: 32, height: 32, seed: 9 }),
    );
  });

  it("keeps color variation independent from entity placement", () => {
    const withColors = generateWorld({ seed: 3, entityDefinitions: [ROCK, HOUSE] });
    const plain = generateWorld({ seed: 3, entityDefinitions: [ROCK, { ...HOUSE, colorReplacements: undefined }] });

    expect(entitiesOf(plain).map(({ id }) => id)).toEqual(entitiesOf(withColors).map(({ id }) => id));
  });
});

describe("World parts", () => {
  it("has no parts unless the game registers them", () => {
    const world = generateWorld({ seed: 5, ...sized(4, 4), entityDefinitions: [] });

    expect(world.parts.ids).toEqual([]);
    expect(world).not.toHaveProperty("clock");
    expect(world).not.toHaveProperty("player");
  });

  it("creates each registered part from the generated terrain and entities", () => {
    const world = generateWorld({
      seed: 42,
      ...sized(16, 16),
      entityDefinitions: DEFINITIONS,
      parts: [probePart()],
    });

    expect(world.parts.ids).toEqual(["probe"]);
    expect(world.parts.get(probePart())).toEqual({ columns: 256, entities: entitiesOf(world).length });
  });

  it("rejects two parts with the same id", () => {
    expect(() => generateWorld({ ...sized(4, 4), entityDefinitions: [], parts: [probePart(), probePart()] })).toThrow(
      'World part "probe" is registered twice',
    );
  });

  it("does not change the terrain or the entities", () => {
    const options = { seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS };
    const bare = generateWorld(options);
    const full = generateWorld({ ...options, parts: [...PARTS, probePart()] });

    expect(columnsOf(full)).toEqual(columnsOf(bare));
    expect(entitiesOf(full).map((entity) => entity.getData())).toEqual(
      entitiesOf(bare).map((entity) => entity.getData()),
    );
  });
});

describe("World clock part", () => {
  it("starts a new world at the world start tick", () => {
    const world = generateWorld({ seed: 5, ...sized(4, 4), entityDefinitions: [], parts: PARTS });

    expect(world.parts.get(CLOCK_PART)).toEqual({ tick: WORLD_START_TICK });
  });

  it("accepts an explicit start tick", () => {
    const world = generateWorld({ seed: 5, ...sized(4, 4), entityDefinitions: [], parts: [createClockPart(0)] });

    expect(world.parts.get(CLOCK_PART).tick).toBe(0);
  });

  it("does not change what is generated", () => {
    const options = { seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS };
    const morning = generateWorld({ ...options, parts: [createClockPart()] });
    const night = generateWorld({ ...options, parts: [createClockPart(3 * TICKS_PER_DAY)] });

    expect(entitiesOf(night).map((entity) => entity.getData())).toEqual(
      entitiesOf(morning).map((entity) => entity.getData()),
    );
  });
});

describe("World occupancy", () => {
  it("indexes every entity over its footprint", () => {
    const world = generateWorld({ seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS });

    expect(world.occupancy.size).toBe(entitiesOf(world).length);
    entitiesOf(world).forEach((entity) => expect(world.occupancy.at(entity.x, entity.y)).toContain(entity));
  });

  it("is rebuilt on restore instead of being saved", () => {
    const world = generateWorld({ seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS });
    const snapshot = serializeWorld(world);
    const restored = restoreWorld(snapshot, { entityDefinitions: DEFINITIONS });

    expect(snapshot).not.toHaveProperty("occupancy");
    expect(restored.occupancy.size).toBe(entitiesOf(world).length);
    entitiesOf(restored).forEach((entity) => expect(restored.occupancy.at(entity.x, entity.y)).toEqual([entity]));
  });
});

describe("World movers", () => {
  it("starts empty, apart from the entities, and is never saved: the systems fill it as things move", () => {
    const world = generateWorld({ seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS, parts: PARTS });
    const player = world.parts.get(PLAYER_PART);
    expect(world.movers.size).toBe(0);

    world.movers.move(player, [{ x: 3, y: 4 }]);
    const snapshot = serializeWorld(world);
    const restored = restoreWorld(snapshot, { entityDefinitions: DEFINITIONS, parts: PARTS });

    expect(world.occupancy.at(3, 4)).not.toContain(player);
    expect(JSON.stringify(snapshot)).not.toContain("movers");
    expect(restored.movers.size).toBe(0);
  });
});

describe("World column index", () => {
  it("finds every column by its cell, and is rebuilt on restore instead of being saved", () => {
    const world = generateWorld({ seed: 3, ...sized(6, 5), entityDefinitions: [] });
    const snapshot = serializeWorld(world);

    expect(world.columnIndex.size).toBe(columnsOf(world).length);
    columnsOf(world).forEach((column) => expect(world.columnIndex.get(column.x, column.y)).toBe(column));
    expect(snapshot).not.toHaveProperty("columnIndex");
    expect(restoreWorld(snapshot, { entityDefinitions: [] }).columnIndex.size).toBe(columnsOf(world).length);
  });
});

describe("World player part", () => {
  it("spawns standing on the walkable column nearest the centre, the same for the same seed", () => {
    const options = { seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS, parts: PARTS };
    const world = generateWorld(options);
    const player = world.parts.get(PLAYER_PART);

    expect(canStandOn(world, player.x, player.y, player.elevation)).toBe(true);
    expect(world.columnIndex.get(player.x, player.y)?.elevation).toBe(player.elevation);
    expect(player.walk).toEqual({ x: 0, y: 0 });
    expect(generateWorld(options).parts.get(PLAYER_PART)).toEqual(player);
  });

  it("saves where the player stands and restores it standing still", () => {
    const world = generateWorld({ seed: 42, ...sized(16, 16), entityDefinitions: DEFINITIONS, parts: PARTS });
    const player = world.parts.get(PLAYER_PART);
    setPlayerWalk(player, { up: true, down: false, left: false, right: true });
    stepPlayer(player, world, 3);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, { entityDefinitions: DEFINITIONS, parts: PARTS }).parts.get(PLAYER_PART);

    expect(snapshot.parts.player).toEqual({ version: 1, data: { x: player.x, y: player.y } });
    expect(restored).toMatchObject({ x: player.x, y: player.y, elevation: player.elevation });
    expect(restored.walk).toEqual({ x: 0, y: 0 });
  });
});

describe("serializeWorld / restoreWorld", () => {
  it("round-trips a world through JSON", () => {
    const world = generateWorld({ seed: 77, ...sized(12, 12), entityDefinitions: DEFINITIONS });

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, { entityDefinitions: DEFINITIONS });

    expect(snapshot.version).toBe(WORLD_SNAPSHOT_VERSION);
    expect(WORLD_SNAPSHOT_VERSION).toBe(7);
    expect(snapshot.size).toEqual({ width: 12, height: 12 });
    // Nothing was edited: the terrain and the entities are generated again.
    expect(snapshot.chunks).toEqual([]);
    expect(restored.seed).toBe(77);
    expect(columnsOf(restored).map((b) => [b.x, b.y, b.elevation])).toEqual(
      columnsOf(world).map((b) => [b.x, b.y, b.elevation]),
    );
    expect(columnsOf(restored).map(({ type }) => type)).toEqual(columnsOf(world).map(({ type }) => type));
    expect(entitiesOf(restored).map((e) => [e.x, e.y, e.getData()])).toEqual(
      entitiesOf(world).map((e) => [e.x, e.y, e.getData()]),
    );
  });

  it("saves and restores the game time", () => {
    const world = generateWorld({ seed: 77, ...sized(4, 4), entityDefinitions: [], parts: PARTS });
    advanceClock(world.parts.get(CLOCK_PART), TICKS_PER_DAY + 123);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, { entityDefinitions: [], parts: PARTS });

    expect(snapshot.parts.clock).toEqual({ version: 1, data: { tick: WORLD_START_TICK + TICKS_PER_DAY + 123 } });
    expect(restored.parts.get(CLOCK_PART)).toEqual(world.parts.get(CLOCK_PART));
    expect(restored.parts.get(CLOCK_PART)).not.toBe(world.parts.get(CLOCK_PART));
  });

  it("rejects a snapshot with an invalid tick", () => {
    const snapshot = serializeWorld(generateWorld({ seed: 1, ...sized(4, 4), entityDefinitions: [], parts: PARTS }));
    const parts = { ...snapshot.parts, clock: { version: 1, data: { tick: -5 } } };

    expect(() => restoreWorld({ ...snapshot, parts }, { entityDefinitions: [], parts: PARTS })).toThrow(RangeError);
  });

  it("stores every part under its id with its own version, and nothing else of them", () => {
    const world = generateWorld({
      seed: 7,
      ...sized(6, 6),
      entityDefinitions: [],
      parts: [...PARTS, probePart()],
    });
    const snapshot = serializeWorld(world);

    expect(Object.keys(snapshot)).toEqual(["version", "seed", "size", "contentFingerprint", "chunks", "parts"]);
    expect(Object.keys(snapshot.parts)).toEqual(["clock", "player", "probe"]);
    expect(snapshot.parts.probe).toEqual({ version: 1, data: 0 });
  });

  it("restores a part added after the save as in a new world, so old saves keep loading", () => {
    const world = generateWorld({ seed: 7, ...sized(6, 6), entityDefinitions: [], parts: [createClockPart(9)] });
    const restored = restoreWorld(serializeWorld(world), { entityDefinitions: [], parts: PARTS });

    expect(restored.parts.get(CLOCK_PART).tick).toBe(9);
    expect(restored.parts.get(PLAYER_PART)).toEqual(
      generateWorld({ seed: 7, ...sized(6, 6), entityDefinitions: [], parts: PARTS }).parts.get(PLAYER_PART),
    );
  });

  it("keeps the saved parts nobody restores, so saving again loses nothing", () => {
    const world = generateWorld({ seed: 7, ...sized(6, 6), entityDefinitions: [], parts: PARTS });
    const snapshot = serializeWorld(world);
    const restored = restoreWorld(snapshot, { entityDefinitions: [], parts: [createClockPart()] });

    expect(restored.parts.ids).toEqual(["clock"]);
    expect(serializeWorld(restored)).toEqual(snapshot);
  });

  it("rejects a part saved at another version of it", () => {
    const snapshot = serializeWorld(generateWorld({ seed: 1, ...sized(4, 4), entityDefinitions: [], parts: PARTS }));

    expect(() =>
      restoreWorld(snapshot, { entityDefinitions: [], parts: [{ ...createClockPart(), version: 2 }] }),
    ).toThrow('Unsupported save of world part "clock": version 1, expected 2');
  });

  it("keeps entity changes made after generation instead of regenerating them", () => {
    const world = generateWorld({ seed: 77, entityDefinitions: DEFINITIONS });
    const origin = { cx: 0, cy: 0 };
    const [removed, ...kept] = world.chunks.get(origin)?.entities ?? [];
    world.chunks.setEntities(origin, kept);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, { entityDefinitions: DEFINITIONS });

    expect(snapshot.size).toBeNull();
    expect(snapshot.chunks.map(({ cx, cy }) => ({ cx, cy }))).toEqual([origin]);
    expect(restored.chunks.get(origin)?.entities.map((entity) => entity.getData())).toEqual(
      kept.map((entity) => entity.getData()),
    );
    expect(restored.occupancy.at(removed.x, removed.y)).toEqual([]);
    // The other chunks are generated again, as they were.
    expect(restored.chunks.get({ cx: 1, cy: 0 })?.entities.map((entity) => entity.getData())).toEqual(
      world.chunks.get({ cx: 1, cy: 0 })?.entities.map((entity) => entity.getData()),
    );
  });

  it("saves the fingerprint of the content the world was generated with", () => {
    const world = generateWorld({ seed: 1, ...sized(4, 4), entityDefinitions: DEFINITIONS });
    const snapshot = serializeWorld(world);
    const restored = restoreWorld(snapshot, { entityDefinitions: DEFINITIONS });

    expect(world.contentFingerprint).toBe(fingerprintEntityDefinitions(DEFINITIONS));
    expect(world.contentChanged).toBe(false);
    expect(snapshot.contentFingerprint).toBe(world.contentFingerprint);
    expect(restored.contentFingerprint).toBe(world.contentFingerprint);
    expect(restored.contentChanged).toBe(false);
  });

  it("regenerates the untouched chunks with the current content when it changed, keeping the edited ones", () => {
    const world = generateWorld({ seed: 77, entityDefinitions: DEFINITIONS, parts: PARTS });
    const origin = { cx: 0, cy: 0 };
    const [, ...kept] = world.chunks.get(origin)?.entities ?? [];
    world.chunks.setEntities(origin, kept);
    const player = world.parts.get(PLAYER_PART);
    // A content update: more rocks, one of them where the player stands.
    const updated = [{ ...ROCK, spawnChance: 0.6 }, HOUSE];
    const fresh = generateWorld({ seed: 77, entityDefinitions: updated });
    expect(fitsPlayerAt(fresh, player)).toBe(false);

    const snapshot = JSON.parse(JSON.stringify(serializeWorld(world))) as WorldSnapshot;
    const restored = restoreWorld(snapshot, { entityDefinitions: updated, parts: PARTS });
    const dataOf = (from: World, coord: { cx: number; cy: number }) =>
      from.chunks.get(coord)?.entities.map((entity) => entity.getData());

    expect(restored.contentChanged).toBe(true);
    expect(restored.contentFingerprint).toBe(fingerprintEntityDefinitions(updated));
    expect(dataOf(restored, origin)).toEqual(kept.map((entity) => entity.getData()));
    expect(dataOf(restored, { cx: 1, cy: 0 })).toEqual(dataOf(fresh, { cx: 1, cy: 0 }));
    expect(dataOf(restored, { cx: 1, cy: 0 })).not.toEqual(dataOf(world, { cx: 1, cy: 0 }));
    // The player is moved off the new rock, and the next save records the current content.
    expect(fitsPlayerAt(restored, restored.parts.get(PLAYER_PART))).toBe(true);
    expect(serializeWorld(restored).contentFingerprint).toBe(fingerprintEntityDefinitions(updated));
  });

  it("validates the content given to restore the world", () => {
    const snapshot = serializeWorld(generateWorld({ seed: 1, ...sized(4, 4), entityDefinitions: [] }));

    expect(() => restoreWorld(snapshot, { entityDefinitions: [{ ...ROCK, spawnChance: 3 }] })).toThrow(
      EntityConfigError,
    );
  });

  it("rejects snapshots from an unknown version", () => {
    const snapshot = serializeWorld(generateWorld({ seed: 1, ...sized(4, 4), entityDefinitions: [] }));

    const content = { entityDefinitions: [] };
    [99, 1, 2, 3, 4, 5, 6].forEach((version) =>
      expect(() => restoreWorld({ ...snapshot, version: version as never }, content)).toThrow(
        `Unsupported world snapshot version ${version}`,
      ),
    );
  });
});

describe("createWorld", () => {
  const columns = generateTerrainColumns({ minX: -40, minY: 0, maxX: 40, maxY: 3 }, { seed: 2 });

  it("builds a world from any chunk source, loading the chunks around its centre", () => {
    const world = createWorld({ seed: 2, source: createFixedChunkSource(columns), centre: { x: -20, y: 1 } });

    expect(world.bounds).toBeUndefined();
    expect(world.centre).toEqual({ x: -20, y: 1 });
    expect([...world.chunks.values()].map(({ coord }) => coord)).toEqual([
      { cx: -2, cy: 0 },
      { cx: -1, cy: 0 },
      { cx: 0, cy: 0 },
    ]);
  });

  it("has no content fingerprint unless given one, and a changed content only against a saved one", () => {
    const source = createFixedChunkSource(columns);
    const world = (options: { contentFingerprint?: string; savedContentFingerprint?: string }) => {
      const { contentFingerprint, contentChanged } = createWorld({ seed: 2, source, ...options });
      return { contentFingerprint, contentChanged };
    };

    expect(world({})).toEqual({ contentFingerprint: "", contentChanged: false });
    expect(world({ contentFingerprint: "abc" })).toEqual({ contentFingerprint: "abc", contentChanged: false });
    expect(world({ contentFingerprint: "abc", savedContentFingerprint: "abc" }).contentChanged).toBe(false);
    expect(world({ contentFingerprint: "abc", savedContentFingerprint: "abd" }).contentChanged).toBe(true);
  });

  it("restores its parts from saved ones", () => {
    const source = createFixedChunkSource(columns);
    const saved = createWorld({ seed: 2, source, parts: [createClockPart(5)] }).parts.serialize();
    const world = createWorld({ seed: 2, source, parts: [createClockPart()], savedParts: saved });

    expect(world.parts.get(CLOCK_PART).tick).toBe(5);
  });
});
