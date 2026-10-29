import { describe, expect, it, vi } from "vitest";
import type { EntityDefinition } from "../../types";
import { createPatchChances, Entity } from "../entities";
import { CHUNK_SIZE } from "../grid";
import { Box, generateTerrainColumns } from "../terrain";
import { createSettlementPaths } from "./settlement-paths";
import { createFixedChunkSource, createSeededChunkSource } from "./sources";

const BUSH: EntityDefinition = {
  id: "bush",
  textureSource: "/assets/bush/block.svg",
  height: 1,
  spawnChance: 0.2,
  surface: "grass",
  colorReplacements: { "#000000": ["#111111", "#222222"] },
};
const PIER: EntityDefinition = {
  id: "pier",
  textureSource: "/assets/pier/block.svg",
  height: 1,
  length: 3,
  spawnChance: 1,
  surface: "grass",
};

describe("createSeededChunkSource", () => {
  it("generates the terrain of a chunk as the whole world would have it", () => {
    const source = createSeededChunkSource({ seed: 8, entityDefinitions: [] });
    const area = { minX: 32, minY: -32, maxX: 63, maxY: -1 };

    expect(source.has({ cx: 1, cy: -1 })).toBe(true);
    expect(source.generate({ cx: 1, cy: -1 }).columns).toEqual(generateTerrainColumns(area, { seed: 8 }));
  });

  it("lays the settlements' paths on the terrain, where nothing that grows on grass spawns", () => {
    const house: EntityDefinition = {
      ...BUSH,
      id: "house",
      spawnChance: 1,
      colorReplacements: undefined,
      settlementLot: { regionSize: 64, offset: { x: 12, y: 12 }, reservedPathWidth: 4 },
    };
    const bush = { ...BUSH, spawnChance: 1, colorReplacements: undefined };
    const paths = createSettlementPaths({ seed: 21, entityDefinitions: [house] });
    const source = createSeededChunkSource({ seed: 21, entityDefinitions: [house, bush] });
    const chunks = [0, 1].flatMap((cx) => [0, 1].map((cy) => source.generate({ cx, cy })));
    const columns = chunks.flatMap((chunk) => chunk.columns);
    const onPath = new Set(columns.filter(({ type }) => type === "path").map(({ x, y }) => x * 1000 + y));

    expect(onPath.size).toBeGreaterThan(0);
    columns.forEach(({ x, y, type }) => expect(type === "path").toBe(paths(x, y)));
    expect(chunks.flatMap((chunk) => chunk.entities).some(({ x, y }) => onPath.has(x * 1000 + y))).toBe(false);
  });

  it("grows patches from the world seed, seamless across chunks", () => {
    const forest = {
      ...BUSH,
      spawnChance: 1,
      colorReplacements: undefined,
      patches: { field: "f", scale: 6, threshold: 0 },
    };
    const source = createSeededChunkSource({ seed: 8, entityDefinitions: [forest] });
    const entities = [0, 1].flatMap((cx) => source.generate({ cx, cy: 0 }).entities);
    const factors = (entity: Entity) =>
      createPatchChances(8)(forest.patches, [new Box(entity.x, entity.y, { elevation: 1 })])[0];

    expect(entities.length).toBeGreaterThan(0);
    expect(entities.every((entity) => factors(entity) > 0)).toBe(true);
  });

  it("places each chunk's entities from its own seeded streams, never with Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const source = createSeededChunkSource({ seed: 8, entityDefinitions: [BUSH] });
    const entities = (cx: number) => source.generate({ cx, cy: 0 }).entities.map((entity) => entity.getData());

    expect(entities(0).length).toBeGreaterThan(0);
    expect(entities(0)).toEqual(entities(0));
    expect(entities(1)).not.toEqual(entities(0));
    expect(new Set(entities(0).map(({ colorVariant }) => colorVariant)).size).toBeGreaterThan(1);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("keeps every footprint inside its chunk", () => {
    const source = createSeededChunkSource({ seed: 8, entityDefinitions: [PIER] });
    const piers = source.generate({ cx: 0, cy: 0 }).entities;

    expect(piers.length).toBeGreaterThan(0);
    expect(piers.every(({ x }) => x + 2 < CHUNK_SIZE)).toBe(true);
  });

  it("has no chunk and no column past the bounds of a bounded world", () => {
    const bounds = { minX: 0, minY: 0, maxX: 39, maxY: 9 };
    const source = createSeededChunkSource({ seed: 8, entityDefinitions: [], bounds });

    expect(source.has({ cx: 1, cy: 0 })).toBe(true);
    expect(source.has({ cx: 2, cy: 0 })).toBe(false);
    expect(source.has({ cx: 0, cy: 1 })).toBe(false);
    expect(source.has({ cx: -1, cy: 0 })).toBe(false);
    expect(source.has({ cx: 0, cy: -1 })).toBe(false);
    expect(source.generate({ cx: 1, cy: 0 }).columns).toHaveLength(8 * 10);
  });
});

describe("createFixedChunkSource", () => {
  it("cuts columns and entities into the chunks they are in", () => {
    const columns = [new Box(0, 0), new Box(40, 0), new Box(-1, 0)];
    const rock = new Entity(40, 0, { ...BUSH, id: "rock" }, 0);
    const source = createFixedChunkSource(columns, [rock]);

    expect(source.has({ cx: 0, cy: 0 })).toBe(true);
    expect(source.has({ cx: 2, cy: 0 })).toBe(false);
    expect(source.generate({ cx: 1, cy: 0 })).toEqual({ columns: [columns[1]], entities: [rock] });
    expect(source.generate({ cx: -1, cy: 0 })).toEqual({ columns: [columns[2]], entities: [] });
  });

  it("has no chunk where only entities are", () => {
    const source = createFixedChunkSource([], [new Entity(0, 0, BUSH, 0)]);

    expect(source.has({ cx: 0, cy: 0 })).toBe(false);
  });
});
