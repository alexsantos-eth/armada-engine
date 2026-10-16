import { describe, expect, it } from "vitest";
import { applySpawnPlateau, getSpawnArea } from "./spawn";

describe("getSpawnArea", () => {
  it("centers an area of up to 8 cells on the map", () => {
    expect(getSpawnArea(32, 32)).toEqual({ startX: 12, startY: 12, endX: 20, endY: 20 });
  });

  it("shrinks with small maps but keeps at least 4 cells", () => {
    expect(getSpawnArea(8, 8)).toEqual({ startX: 1, startY: 1, endX: 7, endY: 7 });
    expect(getSpawnArea(4, 4)).toEqual({ startX: 0, startY: 0, endX: 4, endY: 4 });
  });
});

describe("applySpawnPlateau", () => {
  it("flattens the spawn area with a raised back edge and leaves the rest untouched", () => {
    const points = Array.from({ length: 64 }, (_, index) => ({
      x: Math.floor(index / 8),
      y: index % 8,
      elevation: 3,
    }));

    const result = applySpawnPlateau(points, 8, 8);
    const at = (x: number, y: number) => result.find((p) => p.x === x && p.y === y)?.elevation;

    expect(at(0, 0)).toBe(3);
    expect(at(1, 1)).toBe(1);
    expect(at(1, 4)).toBe(1);
    expect(at(4, 1)).toBe(1);
    expect(at(4, 4)).toBe(0);
    expect(at(6, 6)).toBe(0);
    expect(at(7, 7)).toBe(3);
    expect(points[9].elevation).toBe(3);
  });
});
