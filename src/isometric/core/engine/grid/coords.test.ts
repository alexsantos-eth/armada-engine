import { describe, expect, it } from "vitest";
import { CHUNK_SIZE } from "../constants";
import {
  cellFromKey,
  cellKey,
  chunkFromKey,
  chunkKey,
  chunkRect,
  MAX_GRID_COORD,
  toChunkCoord,
  toLocalCoord,
  toWorldCoord,
} from "./coords";

describe("cell keys", () => {
  it("round-trips coordinates, including negatives and the range limits", () => {
    const samples = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, -1],
      [123, -456],
      [MAX_GRID_COORD, MAX_GRID_COORD],
      [-MAX_GRID_COORD, -MAX_GRID_COORD],
    ];
    samples.forEach(([x, y]) => expect(cellFromKey(cellKey(x, y))).toEqual({ x, y }));
  });

  it("gives every cell a distinct, safe integer key", () => {
    const keys = new Set<number>();
    for (let x = -3; x <= 3; x += 1) {
      for (let y = -3; y <= 3; y += 1) keys.add(cellKey(x, y));
    }
    expect(keys.size).toBe(49);
    expect(Number.isSafeInteger(cellKey(MAX_GRID_COORD, MAX_GRID_COORD))).toBe(true);
  });

  it("rejects non-integer or out-of-range coordinates", () => {
    expect(() => cellKey(0.5, 0)).toThrow("Grid coordinate out of range: (0.5, 0)");
    expect(() => cellKey(0, MAX_GRID_COORD + 1)).toThrow(RangeError);
    expect(() => chunkKey(Number.NaN, 0)).toThrow(RangeError);
  });

  it("keys chunks the same way", () => {
    expect(chunkFromKey(chunkKey(-2, 5))).toEqual({ cx: -2, cy: 5 });
  });
});

describe("chunk coordinates", () => {
  it("maps world columns to chunks with floor division, also for negatives", () => {
    expect(toChunkCoord({ x: 0, y: 0 })).toEqual({ cx: 0, cy: 0 });
    expect(toChunkCoord({ x: CHUNK_SIZE - 1, y: CHUNK_SIZE })).toEqual({ cx: 0, cy: 1 });
    expect(toChunkCoord({ x: -1, y: -CHUNK_SIZE })).toEqual({ cx: -1, cy: -1 });
    expect(toChunkCoord({ x: -CHUNK_SIZE - 1, y: 5 })).toEqual({ cx: -2, cy: 0 });
  });

  it("keeps local coordinates inside the chunk", () => {
    expect(toLocalCoord({ x: 5, y: CHUNK_SIZE + 2 })).toEqual({ lx: 5, ly: 2 });
    expect(toLocalCoord({ x: -1, y: -CHUNK_SIZE })).toEqual({ lx: CHUNK_SIZE - 1, ly: 0 });
  });

  it("rebuilds the world coordinate from chunk and local", () => {
    [
      { x: 0, y: 0 },
      { x: -1, y: 37 },
      { x: -70, y: -33 },
    ].forEach((world) => {
      expect(toWorldCoord(toChunkCoord(world), toLocalCoord(world))).toEqual(world);
    });
  });

  it("returns the world rectangle covered by a chunk", () => {
    expect(chunkRect({ cx: -1, cy: 2 })).toEqual({
      minX: -CHUNK_SIZE,
      minY: 2 * CHUNK_SIZE,
      maxX: -1,
      maxY: 3 * CHUNK_SIZE - 1,
    });
  });
});
