import { describe, expect, it } from "vitest";
import { createTerrainShadowSampler, getReceiverPoint } from "./terrain-shadow";
import { DAY_SHADOW_PROJECTION } from "./phases";
import { TILE_METRICS } from "../constants";

describe("shared terrain shadow rays", () => {
  const terrain = {
    bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
    topHeightAt: (x: number, y: number) =>
      x === 1 && y === 0 ? 3 : x < -2 || x > 2 || y < -2 || y > 2 ? undefined : 0,
  };
  const light = { dirX: -1, dirY: 0, stretch: 2, alpha: 0.34 };
  it("uses the same ray for ground, cliff faces and entity points at every receiver height", () => {
    const sample = createTerrainShadowSampler(terrain);
    expect(sample({ x: 0, y: 0, elevation: 0 }, light)).toBe(1);
    expect(sample({ x: 0, y: 0, elevation: 3.1 }, light)).toBe(0);
    expect(sample({ x: 0.49, y: 0, elevation: 1 }, light)).toBe(1);
    expect(sample({ x: -2, y: -2, elevation: 0 }, light)).toBe(0);
    expect(sample({ x: 0, y: 0, elevation: 0 }, { ...light, stretch: 0 })).toBe(0);
    for (const [x, y] of [
      [-100, 0],
      [100, 0],
      [0, -100],
      [0, 100],
    ])
      expect(sample({ x, y, elevation: 0 }, light)).toBe(0);
  });
  it("converts sprite pixels to the same world height and perpendicular width as silhouette projection", () => {
    const point = getReceiverPoint(
      { x: 0, y: 0, elevation: 1 },
      { x: 0, y: 0 },
      0,
      -TILE_METRICS.boxHeight,
      DAY_SHADOW_PROJECTION,
      TILE_METRICS,
    );
    expect(point).toEqual({ x: 0, y: 0, elevation: 2 });
    expect(getReceiverPoint({ x: 0, y: 0, elevation: 0 }, { x: 0, y: 0 }, 5, 0, light, TILE_METRICS).y).toBeGreaterThan(
      0,
    );
  });
});
