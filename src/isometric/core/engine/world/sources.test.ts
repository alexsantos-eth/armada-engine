import { describe, expect, it, vi } from "vitest";
import type { EntityDefinition } from "../../types";
import { Entity } from "../entities";
import { CHUNK_SIZE } from "../grid";
import { Box, generateTerrainColumns } from "../terrain";
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
