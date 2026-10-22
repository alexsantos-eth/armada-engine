import { describe, expect, it } from "vitest";
import type { OcclusionTerrain } from "../../types";
import {
  AO_CONTACT_ALPHA,
  AO_CONTACT_INSET,
  AO_CONTACT_RADIUS,
  AO_PIXELS_PER_TILE,
  AO_WALL_ALPHA,
  AO_WALL_RADIUS,
  buildOcclusionMap,
  getOcclusion,
} from "./occlusion";

type Column = { x: number; y: number; height: number; level?: number; occupied?: boolean };

/** A terrain from explicit columns; `level` defaults to the height rounded up (sand tops sit half a block lower). */
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
    levelAt: (x, y) => {
      const column = at(x, y);
      return column === undefined ? undefined : (column.level ?? Math.ceil(column.height));
    },
    occupiedAt: (x, y) => at(x, y)?.occupied ?? false,
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
    expect(AO_WALL_ALPHA).toBe(0.13);
    expect(AO_WALL_RADIUS).toBe(0.5);
    expect(AO_CONTACT_ALPHA).toBe(0.4);
    expect(AO_CONTACT_INSET).toBe(0.2);
    expect(AO_CONTACT_RADIUS).toBe(0.35);
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

  it("adds a contact shadow under an entity, strongest in its core", () => {
    const terrain = plateau({ x: 0, y: 0, height: 0, occupied: true });

    expect(getOcclusion(terrain, 0, 0, 0.5, 0.5)).toBeCloseTo(AO_CONTACT_ALPHA);
    expect(getOcclusion(terrain, 0, 0, AO_CONTACT_INSET, 0.5)).toBeCloseTo(AO_CONTACT_ALPHA);
    expect(getOcclusion(terrain, 0, 0, 0, 0.5)).toBeLessThan(AO_CONTACT_ALPHA);
    expect(getOcclusion(terrain, 0, 0, 0, 0.5)).toBeGreaterThan(0);
  });

  it("spills an entity's contact shadow onto neighbours on the same ground", () => {
    const terrain = plateau({ x: 1, y: 0, height: 0, occupied: true });
    const spill = getOcclusion(terrain, 0, 0, 1, 0.5);

    expect(spill).toBeGreaterThan(0);
    expect(spill).toBeLessThan(AO_CONTACT_ALPHA);
    // Beyond the core plus AO_CONTACT_RADIUS it is gone.
    expect(getOcclusion(terrain, 0, 0, 1 + AO_CONTACT_INSET - AO_CONTACT_RADIUS, 0.5)).toBe(0);
  });

  it("ignores entities standing on other ground levels", () => {
    expect(getOcclusion(plateau({ x: 1, y: 0, height: -1, occupied: true }), 0, 0, 1, 0.5)).toBe(0);
  });

  it("combines walls and contact shadows as stacked shadows", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 }, { x: 0, y: 0, height: 0, occupied: true });
    const wall = getOcclusion(plateau({ x: 1, y: 0, height: 1 }), 0, 0, 0.75, 0.5);
    const contact = getOcclusion(plateau({ x: 0, y: 0, height: 0, occupied: true }), 0, 0, 0.75, 0.5);

    expect(getOcclusion(terrain, 0, 0, 0.75, 0.5)).toBeCloseTo(1 - (1 - wall) * (1 - contact));
  });
});

describe("buildOcclusionMap", () => {
  it("lays every column's square out like the shadow maps, black with the occlusion in alpha", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 });
    const pixels = 4;
    const map = buildOcclusionMap(terrain, 0, pixels);
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

  it("only writes the columns whose top belongs to the level", () => {
    const terrain = plateau({ x: 1, y: 0, height: 1 });

    // Level 1 holds only (1, 0), a cliff top: nothing to darken there.
    expect(buildOcclusionMap(terrain, 1, 2).every((value) => value === 0)).toBe(true);
    // A sand top (height −0.5) belongs to level 0 and is darkened by the grass next to it.
    const shore = terrainOf([
      { x: 0, y: 0, height: -0.5, level: 0 },
      { x: 1, y: 0, height: 0 },
    ]);
    const map = buildOcclusionMap(shore, 0, 2);
    expect(map[(0 * 4 + 1) * 4 + 3]).toBeGreaterThan(0);
  });

  it("uses AO_PIXELS_PER_TILE by default", () => {
    expect(buildOcclusionMap(plateau(), 0)).toHaveLength((3 * AO_PIXELS_PER_TILE) ** 2 * 4);
  });
});
