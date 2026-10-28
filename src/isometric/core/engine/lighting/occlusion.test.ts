import { describe, expect, it } from "vitest";
import type { OcclusionTerrain } from "../../types";
import {
  AO_ENTITY_ALPHA,
  AO_ENTITY_RADIUS,
  AO_PIXELS_PER_TILE,
  AO_WALL_ALPHA,
  AO_WALL_RADIUS,
  buildOcclusionMap,
  getOcclusion,
} from "./occlusion";

type Column = { x: number; y: number; height: number };

/** A terrain from explicit columns (a sand top sits half a block lower than its block). */
const terrainOf = (columns: Column[]): OcclusionTerrain => {
  const at = (x: number, y: number) => columns.find((column) => column.x === x && column.y === y);
  return {
    bounds: {
      minX: Math.min(...columns.map(({ x }) => x)),
      minY: Math.min(...columns.map(({ y }) => y)),
      maxX: Math.max(...columns.map(({ x }) => x)),
      maxY: Math.max(...columns.map(({ y }) => y)),
    },
    topHeightAt: (x, y) => at(x, y)?.height,
  };
};

/** A 3 × 3 flat plateau at height 0 around (0, 0), with `overrides` replacing columns. */
const plateau = (...overrides: Column[]) => {
  const columns: Column[] = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      columns.push(overrides.find((column) => column.x === x && column.y === y) ?? { x, y, height: 0 });
    }
  }
  return terrainOf(columns);
};

describe("ambient occlusion constants", () => {
  it("keeps the documented strengths, reaches and map resolution", () => {
    expect(AO_WALL_ALPHA).toBe(0.12);
    expect(AO_WALL_RADIUS).toBe(0.5);
    expect(AO_PIXELS_PER_TILE).toBe(8);
  });
});

describe("getOcclusion", () => {
  it("leaves flat open ground unoccluded", () => {
    expect(getOcclusion(plateau(), 0, 0, 0.5, 0.5)).toBe(0);
    expect(getOcclusion(plateau(), 0, 0, 0, 0)).toBe(0);
  });

  it("returns 0 outside the terrain", () => {
    expect(getOcclusion(plateau(), 5, 5, 0.5, 0.5)).toBe(0);
  });

  it("darkens the foot of a taller neighbour, fading out within AO_WALL_RADIUS", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 });

    // u runs along +x: u = 1 touches the wall at x + 0.5.
    expect(getOcclusion(terrain, 0, 0, 1, 0.5)).toBeCloseTo(AO_WALL_ALPHA);
    const near = getOcclusion(terrain, 0, 0, 0.9, 0.5);
    const far = getOcclusion(terrain, 0, 0, 0.7, 0.5);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(getOcclusion(terrain, 0, 0, 1 - AO_WALL_RADIUS, 0.5)).toBe(0);
    expect(getOcclusion(terrain, 0, 0, 0.2, 0.5)).toBe(0);
  });

  it("follows the wall on both axes and in both directions", () => {
    expect(getOcclusion(plateau({ x: -1, y: 0, height: 1 }), 0, 0, 0, 0.5)).toBeCloseTo(AO_WALL_ALPHA);
    expect(getOcclusion(plateau({ x: 0, y: 1, height: 1 }), 0, 0, 0.5, 1)).toBeCloseTo(AO_WALL_ALPHA);
    expect(getOcclusion(plateau({ x: 0, y: -1, height: 1 }), 0, 0, 0.5, 0)).toBeCloseTo(AO_WALL_ALPHA);
  });

  it("scales with the height step: half a block counts half, a block or more counts fully", () => {
    const half = getOcclusion(plateau({ x: 1, y: 0, height: 0.5 }), 0, 0, 1, 0.5);
    const full = getOcclusion(plateau({ x: 1, y: 0, height: 1 }), 0, 0, 1, 0.5);
    const tall = getOcclusion(plateau({ x: 1, y: 0, height: 3 }), 0, 0, 1, 0.5);

    expect(half).toBeCloseTo(AO_WALL_ALPHA / 2);
    expect(tall).toBe(full);
  });

  it("never darkens the top of a cliff", () => {
    const terrain = plateau({ x: 0, y: 0, height: 2 });

    expect(getOcclusion(terrain, 0, 0, 1, 0.5)).toBe(0);
    expect(getOcclusion(terrain, 0, 0, 0, 0)).toBe(0);
  });

  it("darkens inner corners more than a single wall, without ever reaching black", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 }, { x: 0, y: 1, height: 1 }, { x: 1, y: 1, height: 1 });
    const corner = getOcclusion(terrain, 0, 0, 1, 1);

    expect(corner).toBeGreaterThan(AO_WALL_ALPHA);
    expect(corner).toBeLessThan(1);
    // Stacked shadows: 1 − Π(1 − oᵢ).
    expect(corner).toBeCloseTo(1 - (1 - AO_WALL_ALPHA) ** 3);
  });

  it("casts a diagonal neighbour only onto the nearest corner", () => {
    const terrain = plateau({ x: 1, y: 1, height: 1 });

    expect(getOcclusion(terrain, 0, 0, 1, 1)).toBeCloseTo(AO_WALL_ALPHA);
    expect(getOcclusion(terrain, 0, 0, 1, 0.3)).toBe(0);
  });

  it("lets only taller terrain occlude, never what stands on the same ground", () => {
    // A neighbour at the same height or lower adds nothing, whatever stands on it.
    expect(getOcclusion(plateau({ x: 1, y: 0, height: -1 }), 0, 0, 1, 0.5)).toBe(0);
    expect(getOcclusion(plateau(), 0, 0, 1, 0.5)).toBe(0);
  });
});

describe("buildOcclusionMap", () => {
  it("bakes a compact dark contact shadow around entity footprint cells", () => {
    const terrain = plateau();
    const map = buildOcclusionMap(terrain, 8, [{ x: 0, y: 0 }]);
    const alphaAt = (x: number, y: number) => map[(y * 24 + x) * 4 + 3] / 255;
    const center = alphaAt(12, 12);
    const edge = alphaAt(13, 12);

    expect(center).toBeGreaterThan(AO_ENTITY_ALPHA * 0.7);
    expect(center).toBeGreaterThan(edge);
    expect(edge).toBeGreaterThan(0);
    expect(alphaAt(14, 12)).toBe(0);
    expect(AO_ENTITY_RADIUS).toBeLessThan(1);
  });

  it("composites contact darkening over terrain occlusion", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 });
    const terrainOnly = buildOcclusionMap(terrain, 8);
    const combined = buildOcclusionMap(terrain, 8, [{ x: 0, y: 0 }]);
    const alphaIndex = (12 * 24 + 13) * 4 + 3;

    expect(combined[alphaIndex]).toBeGreaterThan(terrainOnly[alphaIndex]);
  });

  it("lays every column's square out like the shadow maps, black with the occlusion in alpha", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 });
    const pixels = 4;
    const map = buildOcclusionMap(terrain, pixels);
    const width = 3 * pixels;
    const texel = (x: number, y: number) => map.slice((y * width + x) * 4, (y * width + x) * 4 + 4);

    expect(map).toBeInstanceOf(Uint8ClampedArray);
    expect(map).toHaveLength(3 * pixels * 3 * pixels * 4);
    // Column (0, 0) is the middle square; its last texel along +x touches the wall.
    const nearWall = texel(2 * pixels - 1, pixels + 1);
    expect([...nearWall.slice(0, 3)]).toEqual([0, 0, 0]);
    expect(nearWall[3]).toBe(Math.round(getOcclusion(terrain, 0, 0, (pixels - 0.5) / pixels, 1.5 / pixels) * 255));
    expect(nearWall[3]).toBeGreaterThan(0);
    // Open ground stays transparent.
    expect(texel(1, 1)[3]).toBe(0);
  });

  it("gives every column its own top's occlusion, whatever its level", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 });
    const map = buildOcclusionMap(terrain, 2);
    const width = 3 * 2;
    const alphaAt = (x: number, y: number) => map[(y * width + x) * 4 + 3];

    // The cliff top (1, 0) is never darkened; the ground at its foot is.
    expect(alphaAt(5, 2)).toBe(0);
    expect(alphaAt(3, 2)).toBeGreaterThan(0);
    // A sand top (height −0.5) is darkened by the grass next to it.
    const shore = terrainOf([
      { x: 0, y: 0, height: -0.5 },
      { x: 1, y: 0, height: 0 },
    ]);
    expect(buildOcclusionMap(shore, 2)[(0 * 4 + 1) * 4 + 3]).toBeGreaterThan(0);
  });

  it("uses AO_PIXELS_PER_TILE by default", () => {
    expect(buildOcclusionMap(plateau())).toHaveLength((3 * AO_PIXELS_PER_TILE) ** 2 * 4);
  });
});

describe("baked directional terrain shadows", () => {
  it("keeps cliff tops lit while feathering only across the same receiver height", () => {
    const terrain = terrainOf([
      { x: 0, y: 0, height: 2 },
      { x: 1, y: 0, height: 0 },
    ]);
    const projection = { dirX: 1, dirY: 0, stretch: 2, alpha: 0.32 };
    const output = new Uint8Array(2 * 8 * 8);
    expect(buildOcclusionMap(terrain, 8, [], projection)).toHaveLength(2 * 8 * 8 * 4);
    const map = buildOcclusionMap(terrain, 8, [], projection, output);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) expect(map[(y * 16 + x) * 4 + 3]).toBe(0);
    }
    expect(output.some((alpha) => alpha > 0)).toBe(true);
    expect(map.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });
  it("does not cast a ray for flat, missing, or half-height ground and handles map edges", () => {
    const projection = { dirX: -1, dirY: 0, stretch: 0, alpha: 0.32 };
    const terrain = plateau();
    const map = buildOcclusionMap(terrain, 3, [], projection);
    expect(map.every((value) => value === 0)).toBe(true);
    const open = { bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, topHeightAt: () => undefined };
    expect(buildOcclusionMap(open, 1, [], { ...projection, stretch: 1 }).every((value) => value === 0)).toBe(true);
  });
});
