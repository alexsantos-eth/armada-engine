import { describe, expect, it } from "vitest";
import { Box } from "./box";
import {
  SAND_ELEVATION,
  SURFACE_REACH,
  classifyColumnSurfaces,
  createTerrainColumns,
  generateTerrainColumns,
  getBlockMaterial,
  getColumnSurface,
} from "./surfaces";
import { generatePerlinTerrain } from "./terrain";

const column = (x: number, y: number, elevation: number) => ({
  x,
  y,
  elevation,
  metadata: {},
});

/** Builds columns from rows of elevations: rows[y][x]; `null` leaves the cell out. */
const grid = (rows: (number | null)[][]) =>
  rows.flatMap((row, y) => row.flatMap((elevation, x) => (elevation === null ? [] : [column(x, y, elevation)])));

describe("getColumnSurface", () => {
  it("is water below zero", () => {
    expect(getColumnSurface(-1, true, true)).toBe("water");
  });

  it("is sand at the sand elevation on a shore of inland ground", () => {
    expect(SAND_ELEVATION).toBe(0);
    expect(getColumnSurface(0, true, true)).toBe("sand");
  });

  it("is grass without water around or without inland ground", () => {
    expect(getColumnSurface(0, false, true)).toBe("grass");
    expect(getColumnSurface(0, true, false)).toBe("grass");
  });

  it("is grass above the sand elevation even next to water", () => {
    expect(getColumnSurface(1, true, true)).toBe("grass");
  });
});

describe("classifyColumnSurfaces", () => {
  it("puts sand only on the shore of a landmass", () => {
    const surfaces = classifyColumnSurfaces(
      grid([
        [-1, -1, -1, -1],
        [-1, 0, 0, -1],
        [-1, 0, 1, -1],
        [-1, -1, -1, -1],
      ]),
    );

    expect(surfaces.get(1, 1)).toBe("sand");
    expect(surfaces.get(2, 1)).toBe("sand");
    expect(surfaces.get(1, 2)).toBe("sand");
    expect(surfaces.get(2, 2)).toBe("grass");
    expect(surfaces.get(0, 0)).toBe("water");
  });

  it("does not put sand on islets in the middle of the water", () => {
    const surfaces = classifyColumnSurfaces(
      grid([
        [-1, -1, -1, -1, -1],
        [-1, 0, -1, 0, 0],
        [-1, -1, -1, -1, -1],
      ]),
    );

    expect(surfaces.get(1, 1)).toBe("grass");
    expect(surfaces.get(3, 1)).toBe("grass");
    expect(surfaces.get(4, 1)).toBe("grass");
  });

  it("counts diagonal inland ground so shore corners stay sand", () => {
    const surfaces = classifyColumnSurfaces(
      grid([
        [-1, -1, -1],
        [-1, 0, 0],
        [-1, 0, 1],
      ]),
    );

    // (1,1)'s edge neighbours are water or other shore cells; its only inland
    // neighbour is the diagonal (2,2).
    expect(surfaces.get(2, 1)).toBe("sand");
    expect(surfaces.get(1, 2)).toBe("sand");
    expect(surfaces.get(1, 1)).toBe("sand");
  });

  it("only counts edge-adjacent water", () => {
    const surfaces = classifyColumnSurfaces(
      grid([
        [-1, null, null],
        [null, 0, 0],
        [null, 0, 0],
      ]),
    );

    expect(surfaces.get(1, 1)).toBe("grass");
  });

  it("uses the top block of filled columns", () => {
    const surfaces = classifyColumnSurfaces([
      column(0, 0, -2),
      column(0, 0, -1),
      column(0, 0, 0),
      column(1, 0, -3),
      column(1, 0, -2),
      column(0, 1, 1),
    ]);

    expect(surfaces.get(0, 0)).toBe("sand");
    expect(surfaces.get(1, 0)).toBe("water");
  });
});

describe("getBlockMaterial", () => {
  it("renders negative blocks as water", () => {
    expect(getBlockMaterial(-1, 2, "grass")).toBe("water");
  });

  it("renders the top block with its column surface", () => {
    expect(getBlockMaterial(0, 0, "sand")).toBe("sand");
    expect(getBlockMaterial(3, 3, "grass")).toBe("grass");
  });

  it("renders blocks under the top as ground", () => {
    expect(getBlockMaterial(1, 3, "grass")).toBe("ground");
  });
});

describe("createTerrainColumns", () => {
  it("creates one box per point, typed once with its column's surface", () => {
    // x: water, shore sand, inland grass, higher grass.
    const points = grid([[-1, 0, 0, 1]]);
    const columns = createTerrainColumns(points);

    expect(columns.every((box) => box instanceof Box)).toBe(true);
    expect(columns.map(({ x, y, elevation }) => ({ x, y, elevation }))).toEqual(
      points.map(({ x, y, elevation }) => ({ x, y, elevation })),
    );
    expect(columns.map(({ type }) => type)).toEqual(["water", "sand", "grass", "grass"]);
  });

  it("matches classifyColumnSurfaces() column by column", () => {
    const points = grid([
      [0, 0, 0, 0],
      [0, 0, 0, -1],
      [0, -1, -1, -1],
    ]);
    const surfaces = classifyColumnSurfaces(points);

    expect(createTerrainColumns(points).every(({ x, y, type }) => surfaces.get(x, y) === type)).toBe(true);
  });
});

describe("generateTerrainColumns", () => {
  const shape = (boxes: readonly Box[]) => boxes.map(({ x, y, elevation, type }) => [x, y, elevation, type]);
  // A seed and an area with shores, so sand depends on columns outside the area.
  const seed = 1337;
  const area = { minX: 0, minY: 0, maxX: 15, maxY: 15 };

  it("types an area's columns as if the whole world had been generated at once", () => {
    const whole = createTerrainColumns(
      generatePerlinTerrain({ seed, originX: -8, originY: -8, width: 32, height: 32 }),
    );
    const inArea = whole.filter(({ x, y }) => x >= 0 && x <= 15 && y >= 0 && y <= 15);

    expect(SURFACE_REACH).toBe(2);
    expect(shape(generateTerrainColumns(area, { seed }))).toEqual(shape(inArea));
    expect(inArea.some(({ type }) => type === "sand")).toBe(true);
  });

  it("generates nothing outside the clip, and classifies the edge with what is inside", () => {
    const clip = { minX: 0, minY: 0, maxX: 9, maxY: 5 };
    const clipped = generateTerrainColumns(area, { seed, clip });

    expect(shape(clipped)).toEqual(shape(createTerrainColumns(generatePerlinTerrain({ seed, width: 10, height: 6 }))));
    expect(generateTerrainColumns({ minX: 20, minY: 0, maxX: 30, maxY: 5 }, { seed, clip })).toEqual([]);
  });
});
