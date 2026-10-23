import { describe, expect, it, vi } from "vitest";
import type { ChunkCoord, EntityDefinition } from "../../types";
import { Entity } from "../entities";
import { CHUNK_SIZE } from "../grid";
import { Box } from "../terrain";
import {
  CHUNK_KEEP_RADIUS,
  CHUNK_LOAD_RADIUS,
  type ChunkSource,
  chunkOfPoint,
  type SavedChunk,
  WorldChunks,
} from "./chunks";

const STATUE: EntityDefinition = {
  id: "statue",
  textureSource: "/assets/statue/block.svg",
  height: 1,
  length: 2,
  spawnChance: 1,
  surface: "grass",
};

/**
 * A source of chunks `−3…3` along both axes: every chunk has its first column at elevation `1` and
 * a two-tile statue on it, so entities cross nothing.
 */
function testSource(): ChunkSource & { generate: ReturnType<typeof vi.fn> } {
  return {
    has: ({ cx, cy }) => Math.abs(cx) <= 3 && Math.abs(cy) <= 3,
    generate: vi.fn(({ cx, cy }: ChunkCoord) => {
      const x = cx * CHUNK_SIZE;
      const y = cy * CHUNK_SIZE;
      return {
        columns: [new Box(x, y, { elevation: 1, type: "grass" }), new Box(x + 1, y, { elevation: 1, type: "grass" })],
        entities: [new Entity(x, y, STATUE, 1)],
      };
    }),
  };
}

const coords = (chunks: WorldChunks) => [...chunks.values()].map(({ coord }) => coord);

describe("chunkOfPoint", () => {
  it("is the chunk of the column nearest the point", () => {
    expect(chunkOfPoint({ x: 31.4, y: 0 })).toEqual({ cx: 0, cy: 0 });
    expect(chunkOfPoint({ x: 31.6, y: -0.6 })).toEqual({ cx: 1, cy: -1 });
  });
});

describe("WorldChunks", () => {
  it("loads a chunk once, with its columns and entities indexed, and unloads it", () => {
    const source = testSource();
    const chunks = new WorldChunks(source);

    const chunk = chunks.load({ cx: 1, cy: -1 });
    expect(chunks.load({ cx: 1, cy: -1 })).toBe(chunk);
    expect(source.generate).toHaveBeenCalledTimes(1);
    expect(chunk).toMatchObject({
      coord: { cx: 1, cy: -1 },
      rect: { minX: 32, minY: -32, maxX: 63, maxY: -1 },
    });
    expect(chunks.size).toBe(1);
    expect(chunks.has({ cx: 1, cy: -1 })).toBe(true);
    expect(chunks.get({ cx: 1, cy: -1 })).toBe(chunk);
    expect(chunks.columnIndex.get(33, -32)?.elevation).toBe(1);
    // The statue covers its whole footprint.
    expect(chunks.occupancy.at(33, -32)).toEqual(chunk?.entities);

    expect(chunks.unload({ cx: 1, cy: -1 })).toBe(true);
    expect(chunks.unload({ cx: 1, cy: -1 })).toBe(false);
    expect(chunks.size).toBe(0);
    expect(chunks.get({ cx: 1, cy: -1 })).toBeUndefined();
    expect(chunks.columnIndex.size).toBe(0);
    expect(chunks.occupancy.size).toBe(0);
  });

  it("loads nothing where the world has no chunk", () => {
    const chunks = new WorldChunks(testSource());

    expect(chunks.exists({ cx: 4, cy: 0 })).toBe(false);
    expect(chunks.load({ cx: 4, cy: 0 })).toBeUndefined();
    expect(chunks.size).toBe(0);
  });

  it("is ready once every neighbour that exists is loaded too", () => {
    const chunks = new WorldChunks(testSource());
    chunks.loadAround({ x: 0, y: 0 });

    expect(CHUNK_LOAD_RADIUS).toBe(1);
    expect(chunks.size).toBe(9);
    expect(chunks.isReady({ cx: 0, cy: 0 })).toBe(true);
    expect(chunks.isReady({ cx: 1, cy: 0 })).toBe(false);
    expect(chunks.isReady({ cx: 2, cy: 0 })).toBe(false);

    // At the edge of the world, the missing neighbours do not count.
    chunks.loadAround({ x: 3 * CHUNK_SIZE, y: 3 * CHUNK_SIZE });
    expect(chunks.isReady({ cx: 3, cy: 3 })).toBe(true);
  });

  it("streams the chunks around each focus, and unloads those too far from all of them", () => {
    const chunks = new WorldChunks(testSource());

    const first = chunks.stream([{ cx: 0, cy: 0 }]);
    expect(first.loaded).toHaveLength(9);
    expect(first.unloaded).toEqual([]);

    // One chunk on: the far row is kept, within the keep radius.
    const second = chunks.stream([{ cx: 1, cy: 0 }]);
    expect(CHUNK_KEEP_RADIUS).toBe(2);
    expect(second.loaded).toEqual([
      { cx: 2, cy: -1 },
      { cx: 2, cy: 0 },
      { cx: 2, cy: 1 },
    ]);
    expect(second.unloaded).toEqual([]);

    // Further: what is out of reach goes first, then the new ground comes.
    const third = chunks.stream([{ cx: 3, cy: 0 }]);
    expect(third.unloaded).toEqual([
      { cx: -1, cy: -1 },
      { cx: 0, cy: -1 },
      { cx: -1, cy: 0 },
      { cx: 0, cy: 0 },
      { cx: -1, cy: 1 },
      { cx: 0, cy: 1 },
    ]);
    expect(third.loaded).toEqual([
      { cx: 3, cy: -1 },
      { cx: 3, cy: 0 },
      { cx: 3, cy: 1 },
    ]);
    expect(chunks.columnIndex.get(0, 0)).toBeUndefined();
  });

  it("keeps what any focus needs, and never keeps less than it loads", () => {
    const chunks = new WorldChunks(testSource());
    chunks.stream(
      [
        { cx: -3, cy: 0 },
        { cx: 3, cy: 0 },
      ],
      { loadRadius: 0 },
    );
    expect(coords(chunks)).toEqual([
      { cx: -3, cy: 0 },
      { cx: 3, cy: 0 },
    ]);

    chunks.stream([{ cx: 3, cy: 0 }], { loadRadius: 1, keepRadius: 0 });
    expect(chunks.size).toBe(6);
    expect(chunks.has({ cx: -3, cy: 0 })).toBe(false);
  });

  it("keeps edited entities for the next load and the next save, and only those", () => {
    const chunks = new WorldChunks(testSource());
    const origin = chunks.load({ cx: 0, cy: 0 });
    chunks.load({ cx: 1, cy: 0 });
    const tree = new Entity(5, 5, { ...STATUE, id: "tree", length: 1 }, 0);

    chunks.setEntities({ cx: 0, cy: 0 }, [tree]);
    expect(chunks.get({ cx: 0, cy: 0 })?.entities).toEqual([tree]);
    expect(chunks.get({ cx: 0, cy: 0 })?.columns).toBe(origin?.columns);
    expect(chunks.occupancy.at(0, 0)).toEqual([]);
    expect(chunks.occupancy.at(5, 5)).toEqual([tree]);

    chunks.unload({ cx: 0, cy: 0 });
    expect(chunks.load({ cx: 0, cy: 0 })?.entities).toEqual([tree]);

    const saved = chunks.serialize();
    expect(saved).toEqual([{ cx: 0, cy: 0, entities: [{ x: 5, y: 5, data: tree.getData() }] }]);
  });

  it("restores the saved chunks' entities, by chunk key order on the next save", () => {
    const saved: SavedChunk[] = [
      { cx: 1, cy: 0, entities: [] },
      { cx: -1, cy: 0, entities: [{ x: -30, y: 4, data: new Entity(-30, 4, STATUE, 1).getData() }] },
    ];
    const chunks = new WorldChunks(testSource(), saved);

    const restored = chunks.load({ cx: -1, cy: 0 })?.entities ?? [];
    expect(restored.map(({ id, x, y }) => ({ id, x, y }))).toEqual([{ id: "statue@-30,4", x: -30, y: 4 }]);
    expect(chunks.load({ cx: 1, cy: 0 })?.entities).toEqual([]);
    expect(chunks.serialize().map(({ cx }) => cx)).toEqual([-1, 1]);
  });

  it("rejects entities for a chunk that is not loaded, or anchored outside it", () => {
    const chunks = new WorldChunks(testSource());
    chunks.load({ cx: 0, cy: 0 });
    const stray = new Entity(32, 0, STATUE, 1);

    expect(() => chunks.setEntities({ cx: 2, cy: 0 }, [])).toThrow("Chunk (2, 0) is not loaded");
    expect(() => chunks.setEntities({ cx: 0, cy: 0 }, [stray])).toThrow(
      'Entity "statue@32,0" is anchored outside chunk (0, 0)',
    );
    expect(() => chunks.setEntities({ cx: 0, cy: 0 }, [new Entity(0, 40, STATUE, 1)])).toThrow("outside");
    expect(() => chunks.setEntities({ cx: 0, cy: 0 }, [new Entity(0, -1, STATUE, 1)])).toThrow("outside");
    expect(() => chunks.setEntities({ cx: 0, cy: 0 }, [new Entity(-1, 0, STATUE, 1)])).toThrow("outside");
  });
});
