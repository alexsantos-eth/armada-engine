import { describe, expect, it, vi } from "vitest";
import type { ChunkCoord, EntityDefinition } from "../../types";
import { Entity } from "../entities";
import { CHUNK_SIZE } from "../grid";
import { Box } from "../terrain";
import {
  CHUNK_KEEP_RADIUS,
  CHUNK_LOAD_RADIUS,
  CHUNK_PREFETCH_RADIUS,
  CHUNKS_LOADED_PER_FRAME,
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
    expect(CHUNK_KEEP_RADIUS).toBe(3);
    expect(second.loaded).toEqual([
      { cx: 2, cy: -1 },
      { cx: 2, cy: 0 },
      { cx: 2, cy: 1 },
    ]);
    expect(second.unloaded).toEqual([]);

    // Further: what is out of reach goes first, then the new ground comes (the world ends at 3).
    const third = chunks.stream([{ cx: 4, cy: 0 }]);
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
    expect(third.pending).toBe(0);
  });

  it("loads within a budget, the needed chunks first, and says how many are left", () => {
    const chunks = new WorldChunks(testSource());
    expect(CHUNKS_LOADED_PER_FRAME).toBe(1);

    const first = chunks.stream([{ cx: 0, cy: 0 }], { maxLoads: 4 });
    expect(first.loaded).toEqual([
      { cx: -1, cy: -1 },
      { cx: 0, cy: -1 },
      { cx: 1, cy: -1 },
      { cx: -1, cy: 0 },
    ]);
    expect(first.pending).toBe(5);
    expect(chunks.stream([{ cx: 0, cy: 0 }], { maxLoads: 4 }).pending).toBe(1);
    const last = chunks.stream([{ cx: 0, cy: 0 }], { maxLoads: 4 });
    expect(last.loaded).toEqual([{ cx: 1, cy: 1 }]);
    expect(last.pending).toBe(0);
    expect(chunks.isReady({ cx: 0, cy: 0 })).toBe(true);
  });

  it("loads ahead within the prefetch radius only once every needed chunk is in", () => {
    const chunks = new WorldChunks(testSource());
    expect(CHUNK_PREFETCH_RADIUS).toBe(2);

    const first = chunks.stream([{ cx: 0, cy: 0 }], { prefetchRadius: 2, maxLoads: 10 });
    expect(first.loaded).toHaveLength(10);
    // The nine needed ones, then the first of the ring ahead.
    expect(first.loaded[9]).toEqual({ cx: -2, cy: -2 });
    expect(first.pending).toBe(0);

    // A needed chunk is short of budget: nothing is loaded ahead.
    const moved = chunks.stream([{ cx: 2, cy: 0 }], { prefetchRadius: 2, maxLoads: 1 });
    expect(moved.loaded).toHaveLength(1);
    expect(moved.pending).toBe(5);

    chunks.stream([{ cx: 0, cy: 0 }], { prefetchRadius: 2 });
    expect(chunks.size).toBe(25);
  });

  it("loads prepared content instead of generating it, once", () => {
    const source = testSource();
    const chunks = new WorldChunks(source);
    const made = testSource().generate({ cx: 1, cy: 0 });

    chunks.prepare({ cx: 1, cy: 0 }, made);
    expect(chunks.isPrepared({ cx: 1, cy: 0 })).toBe(true);
    const chunk = chunks.load({ cx: 1, cy: 0 });

    expect(source.generate).not.toHaveBeenCalled();
    expect(chunk?.columns).toBe(made.columns);
    expect(chunk?.entities).toBe(made.entities);
    expect(chunks.occupancy.at(CHUNK_SIZE, 0)).toEqual(made.entities);
    expect(chunks.isPrepared({ cx: 1, cy: 0 })).toBe(false);
    // Unloaded and loaded again: generated, the prepared content was used up.
    chunks.unload({ cx: 1, cy: 0 });
    chunks.load({ cx: 1, cy: 0 });
    expect(source.generate).toHaveBeenCalledTimes(1);
  });

  it("ignores content prepared for a loaded chunk or one the world does not have", () => {
    const chunks = new WorldChunks(testSource());
    const content = { columns: [], entities: [] };
    chunks.load({ cx: 0, cy: 0 });

    chunks.prepare({ cx: 0, cy: 0 }, content);
    chunks.prepare({ cx: 9, cy: 0 }, content);

    expect(chunks.isPrepared({ cx: 0, cy: 0 })).toBe(false);
    expect(chunks.isPrepared({ cx: 9, cy: 0 })).toBe(false);
  });

  it("loads ahead only prepared chunks when asked, and drops those it would not keep", () => {
    const source = testSource();
    const chunks = new WorldChunks(source);
    const content = (coord: ChunkCoord) => testSource().generate(coord);
    chunks.prepare({ cx: 2, cy: 2 }, content({ cx: 2, cy: 2 }));
    chunks.prepare({ cx: -3, cy: -3 }, content({ cx: -3, cy: -3 }));

    const { loaded } = chunks.stream([{ cx: 0, cy: 0 }], { prefetchRadius: 2, keepRadius: 2, prefetchPrepared: true });

    // The nine needed ones, generated, then the one prepared ahead.
    expect(loaded).toHaveLength(10);
    expect(loaded[9]).toEqual({ cx: 2, cy: 2 });
    expect(source.generate).toHaveBeenCalledTimes(9);
    // Out of the kept radius: dropped.
    expect(chunks.isPrepared({ cx: -3, cy: -3 })).toBe(false);
  });

  it("counts a chunk two foci share once", () => {
    const source = testSource();
    const chunks = new WorldChunks(source);

    const { loaded, pending } = chunks.stream(
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
      ],
      { maxLoads: 12 },
    );

    expect(loaded).toHaveLength(12);
    expect(pending).toBe(0);
    expect(source.generate).toHaveBeenCalledTimes(12);
  });

  it("keeps at least the chunks it loads ahead", () => {
    const chunks = new WorldChunks(testSource());
    chunks.stream([{ cx: 0, cy: 0 }], { prefetchRadius: 2, keepRadius: 0 });

    expect(chunks.stream([{ cx: 0, cy: 0 }], { prefetchRadius: 2, keepRadius: 0 }).unloaded).toEqual([]);
    expect(chunks.size).toBe(25);
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
