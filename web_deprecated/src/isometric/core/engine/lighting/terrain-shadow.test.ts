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

it("visits narrow corner intersections instead of skipping between fixed ray steps", () => {
  const sample = createTerrainShadowSampler({
    bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 },
    topHeightAt: (x, y) => (x === 1 && y === 0 ? 3 : 0),
  });
  expect(sample({ x: 0, y: 0.11, elevation: 0 }, { dirX: -0.8, dirY: -0.6, stretch: 2, alpha: 0.34 })).toBe(1);
});

it("moves the terrain penumbra continuously with small projection changes", () => {
  const sample = createTerrainShadowSampler({
    bounds: { minX: 0, minY: 0, maxX: 2, maxY: 0 },
    topHeightAt: (x, y) => (x === 1 && y === 0 ? 1 : 0),
  });
  const point = { x: 0, y: 0, elevation: 0.45 };
  const light = { dirX: -1, dirY: 0, stretch: 2, alpha: 0.34 };
  const before = sample(point, light);
  const after = sample(point, { ...light, stretch: 2.001 });
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThan(1);
  expect(after).toBeGreaterThan(before);
  expect(after - before).toBeLessThan(0.01);
});

it("casts through exact boundaries in every cardinal direction", () => {
  const sample = createTerrainShadowSampler({
    bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
    topHeightAt: (x, y) => (x === 0 && y === 0 ? 3 : 0),
  });
  for (const [x, y] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
  ]) {
    const length = Math.hypot(x, y);
    expect(sample({ x, y, elevation: 0 }, { dirX: x / length, dirY: y / length, stretch: 2, alpha: 0.34 })).toBe(1);
  }
});

it("projects solid terrain columns as continuous swept footprints for the shared caster pass", async () => {
  const { createTerrainShadowGeometry } = await import("./terrain-shadow");
  const geometry = createTerrainShadowGeometry({
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 0 },
    topHeightAt: (x, y) => (y === 0 && x === 1 ? 3 : undefined),
  });
  expect(geometry.vertices).toHaveLength(0);
  expect(geometry.indices).toHaveLength(0);
  const light = { dirX: 1, dirY: 0, stretch: 2, alpha: 0.34 };
  expect(geometry.project(0, light, { x: 0, y: 0 }, 24)).toBe(true);
  const cached = geometry.vertices;
  expect(geometry.project(0, light, { x: 0, y: 0 }, 24)).toBe(false);
  expect(geometry.vertices).toBe(cached);
  const before = geometry.vertices[2];
  geometry.project(0, { ...light, stretch: 2.0001 }, { x: 0, y: 0 }, 24);
  expect(geometry.vertices[2]).toBeGreaterThan(before);
  expect(geometry.vertices[2] - before).toBeLessThan(0.01);
  geometry.project(3, light, { x: 0, y: 0 }, 24);
  expect(geometry.vertices).toHaveLength(0);
  expect(geometry.indices).toHaveLength(0);
  expect(geometry.uvs).toHaveLength(0);
  geometry.project(0, { ...light, dirX: -1, dirY: -1 }, { x: 0, y: 0 }, 24);
  expect(geometry.vertices.every(Number.isFinite)).toBe(true);
});

it("invalidates a cached projection when its map origin or resolution changes", async () => {
  const { createTerrainShadowGeometry } = await import("./terrain-shadow");
  const geometry = createTerrainShadowGeometry({
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    topHeightAt: (x, y) => (x === 0 && y === 0 ? 1 : undefined),
  });
  const light = { dirX: 1, dirY: 0, stretch: 1, alpha: 0.34 };
  expect(geometry.project(0, light, { x: 0, y: 0 }, 24)).toBe(true);
  expect(geometry.project(0, light, { x: 1, y: 0 }, 24)).toBe(true);
  expect(geometry.project(0, light, { x: 1, y: 1 }, 24)).toBe(true);
  expect(geometry.project(0, light, { x: 1, y: 1 }, 48)).toBe(true);
});

it("compacts only footprints that reach visible receivers and invalidates that cache when their bounds move", async () => {
  const { createTerrainShadowGeometry } = await import("./terrain-shadow");
  const geometry = createTerrainShadowGeometry({
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    topHeightAt: (x, y) => (x === 0 && y === 0 ? 2 : undefined),
  });
  const light = { dirX: 1, dirY: 0, stretch: 2, alpha: 0.34 };
  const origin = { x: 0, y: 0 };
  const bounds = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  geometry.project(0, light, origin, 24, bounds);
  expect(geometry.indices).toHaveLength(18);
  expect(geometry.project(0, light, origin, 24, bounds)).toBe(false);
  for (const moved of [
    { ...bounds, minX: 100 },
    { ...bounds, maxX: -100 },
    { ...bounds, minY: 100 },
    { ...bounds, maxY: -100 },
  ]) {
    expect(geometry.project(0, light, origin, 24, moved)).toBe(true);
    expect(geometry.indices).toHaveLength(0);
    expect(geometry.vertices).toHaveLength(0);
  }
  geometry.project(0, light, origin, 24, bounds);
  expect(geometry.vertices).toHaveLength(24);
});
