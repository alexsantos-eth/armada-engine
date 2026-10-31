import { describe, expect, it } from "vitest";
import { TILE_METRICS } from "../constants";
import { CellMap } from "../grid";
import { projectBoxesToIsometric } from "../projection";
import { Box } from "../terrain";
import {
  composeInto,
  getFaceUvs,
  getReflectedFaces,
  getReflectionMatrix,
  getWaterPlaneMatrix,
  getWaterTopMatrix,
  groupWaterLevels,
  REFLECTION_PIXELS_PER_TILE,
  REFLECTION_REACH,
  REFLECTION_SPREAD,
  type ReflectionArea,
  reflectsOn,
} from "./reflection";
import type { Affine2D, TerrainMaterial } from "../../types";

const PROJECTION = {
  tileWidth: TILE_METRICS.tileWidth,
  tileHeight: TILE_METRICS.tileHeight,
  elevationStep: TILE_METRICS.boxHeight,
  originX: 0,
  originY: 0,
};
const P = REFLECTION_PIXELS_PER_TILE;
const blank = () => ({ a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 });
const apply = (m: Affine2D, x: number, y: number) => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });
const box = (x: number, y: number, elevation: number, type: TerrainMaterial) => new Box(x, y, { elevation, type });

/** Scene pixels of world point `(x, y)` (fractional) `height` blocks up. */
const screenOf = (x: number, y: number, height: number) => ({
  x: (x - y) * (TILE_METRICS.tileWidth / 2),
  y: -(x + y) * (TILE_METRICS.tileHeight / 2) - height * TILE_METRICS.boxHeight,
});

const AREA: ReflectionArea = { level: -1, rect: { minX: 2, minY: 3, maxX: 5, maxY: 6 }, columns: [] };

describe("groupWaterLevels", () => {
  it("groups the water columns by the level of their tops, lowest first, each with its rectangle", () => {
    const columns = [
      box(0, 0, -1, "water"),
      box(1, 0, 0, "sand"),
      box(3, 2, -1, "water"),
      box(2, 5, -2, "water"),
      box(4, 4, -2, "water"),
    ];

    const levels = groupWaterLevels(columns);

    expect(levels.map(({ level, rect }) => ({ level, rect }))).toEqual([
      { level: -2, rect: { minX: 2, minY: 4, maxX: 4, maxY: 5 } },
      { level: -1, rect: { minX: 0, minY: 0, maxX: 3, maxY: 2 } },
    ]);
    expect(levels[1].columns).toEqual([columns[0], columns[2]]);
    expect(groupWaterLevels([box(0, 0, 2, "grass")])).toEqual([]);
  });
});

describe("reflectsOn", () => {
  it("takes what stands over the water, beside it within the spread, or behind it within the reach", () => {
    const reach = REFLECTION_REACH + REFLECTION_SPREAD;
    expect(reflectsOn(AREA, 2, 3)).toBe(true);
    // Beside the water: a wide sprite's reflection spreads sideways onto it (a boat beside a chunk edge).
    expect(reflectsOn(AREA, 2 - REFLECTION_SPREAD, 3 - REFLECTION_SPREAD)).toBe(true);
    expect(reflectsOn(AREA, 5 + reach, 6 + reach)).toBe(true);
    expect(reflectsOn(AREA, 1 - REFLECTION_SPREAD, 4)).toBe(false);
    expect(reflectsOn(AREA, 4, 2 - REFLECTION_SPREAD)).toBe(false);
    expect(reflectsOn(AREA, 6 + reach, 4)).toBe(false);
    expect(reflectsOn(AREA, 4, 7 + reach)).toBe(false);
  });
});

describe("composeInto", () => {
  it("applies the inner transform first, into `out`", () => {
    const inner = { a: 2, b: 0, c: 0, d: 3, tx: 1, ty: 1 };
    const outer = { a: 0, b: 1, c: -1, d: 0, tx: 5, ty: 0 };
    const out = blank();

    expect(composeInto(outer, inner, out)).toBe(out);
    expect(apply(out, 1, 2)).toEqual(apply(outer, ...(Object.values(apply(inner, 1, 2)) as [number, number])));
  });
});

describe("getReflectionMatrix", () => {
  const foot = { x: 4, y: 7, elevation: 1 };
  const reflect = getReflectionMatrix(
    { ...foot, screenX: screenOf(4, 7, 1).x, screenY: screenOf(4, 7, 1).y },
    AREA,
    TILE_METRICS,
    blank(),
  );
  const texelOf = (x: number, y: number) => ({ x: (x - 1.5) * P, y: (y - 2.5) * P });

  it("takes a point on the water to where it is in the map", () => {
    // The point of the water under the foot, and one beside it in the plane of the sprite.
    const water = screenOf(4, 7, -1);
    expect(apply(reflect, water.x, water.y).x).toBeCloseTo(texelOf(4, 7).x);
    expect(apply(reflect, water.x, water.y).y).toBeCloseTo(texelOf(4, 7).y);
    const beside = screenOf(4.5, 6.5, -1);
    expect(apply(reflect, beside.x, beside.y).x).toBeCloseTo(texelOf(4.5, 6.5).x);
    expect(apply(reflect, beside.x, beside.y).y).toBeCloseTo(texelOf(4.5, 6.5).y);
  });

  it("lays a point h blocks above the water h · boxHeight pixels below it on screen", () => {
    const above = screenOf(4, 7, 2);
    const mapped = apply(reflect, above.x, above.y);
    const sink = (3 * TILE_METRICS.boxHeight) / TILE_METRICS.tileHeight;
    expect(mapped.x).toBeCloseTo(texelOf(4 - sink, 7 - sink).x);
    expect(mapped.y).toBeCloseTo(texelOf(4 - sink, 7 - sink).y);
    // Laid back on the water's top, it shows under the water point by the height it had above it.
    const back = screenOf(4 - sink, 7 - sink, -1);
    expect(back.x).toBeCloseTo(screenOf(4, 7, -1).x);
    expect(back.y - screenOf(4, 7, -1).y).toBeCloseTo(screenOf(4, 7, -1).y - above.y);
  });

  it("takes another map size", () => {
    const half = getReflectionMatrix({ ...foot, screenX: 0, screenY: 0 }, AREA, TILE_METRICS, blank(), P / 2);
    const full = getReflectionMatrix({ ...foot, screenX: 0, screenY: 0 }, AREA, TILE_METRICS, blank());
    expect(half.a * 2).toBeCloseTo(full.a);
    expect(half.ty * 2).toBeCloseTo(full.ty);
  });
});

describe("getWaterPlaneMatrix", () => {
  it("takes a point on the water to where it is in the map, without flipping what is drawn", () => {
    const plane = getWaterPlaneMatrix(AREA, TILE_METRICS, blank());
    [
      [4, 7],
      [2.5, 3.5],
      [5.25, 6.75],
    ].forEach(([x, y]) => {
      const water = screenOf(x, y, -1);
      expect(apply(plane, water.x, water.y).x).toBeCloseTo((x - 1.5) * P);
      expect(apply(plane, water.x, water.y).y).toBeCloseTo((y - 2.5) * P);
    });
    // Lower on screen is nearer the camera: −x −y in the map.
    expect(plane.c).toBeLessThan(0);
    expect(plane.d).toBeLessThan(0);
    expect(getWaterPlaneMatrix(AREA, TILE_METRICS, blank(), P / 2).tx).toBeCloseTo(plane.tx / 2);
  });
});

describe("getWaterTopMatrix", () => {
  it("lays a column's square on its top diamond: its corner (0, 0) at the bottom, +x of the map to the right", () => {
    const [top] = projectBoxesToIsometric([box(3, 4, -1, "water")], PROJECTION);
    const tileTop = { x: top.screenX, y: top.screenY };
    const lay = getWaterTopMatrix(tileTop, TILE_METRICS, blank());

    const corner = apply(lay, 0, 0);
    const right = apply(lay, P, 0);
    const left = apply(lay, 0, P);
    expect(corner.x).toBeCloseTo(screenOf(2.5, 3.5, -1).x);
    expect(corner.y).toBeCloseTo(screenOf(2.5, 3.5, -1).y);
    expect(right.x).toBeCloseTo(screenOf(3.5, 3.5, -1).x);
    expect(right.y).toBeCloseTo(screenOf(3.5, 3.5, -1).y);
    expect(left.x).toBeCloseTo(screenOf(2.5, 4.5, -1).x);
    expect(left.y).toBeCloseTo(screenOf(2.5, 4.5, -1).y);
    expect(getWaterTopMatrix(tileTop, TILE_METRICS, blank(), P / 2).a).toBeCloseTo(lay.a * 2);
  });
});

describe("getReflectedFaces", () => {
  const sink = TILE_METRICS.boxHeight / TILE_METRICS.tileHeight;
  const texel = (x: number, y: number, height: number) => [
    (x - height * sink - 1.5) * P,
    (y - height * sink - 2.5) * P,
  ];

  it("mirrors the camera-facing sides of the land behind the water, block by block, the furthest first", () => {
    const columns = new CellMap<Box>();
    const set = (column: Box) => columns.set(column.x, column.y, column);
    // Water at -1 on the area, a grass column two blocks above it at (3, 4), sand at the water's
    // level beside it, and a lower ground column behind that hides the foot of nothing.
    for (let x = 2; x <= 5; x += 1) for (let y = 3; y <= 6; y += 1) set(box(x, y, -1, "water"));
    set(box(3, 4, 1, "grass"));
    set(box(3, 3, 0, "sand"));
    set(box(4 + REFLECTION_REACH, 7, 0, "path"));
    set(box(6 + REFLECTION_REACH, 7, 3, "grass"));

    const faces = getReflectedFaces(AREA, columns, TILE_METRICS);

    // The path furthest behind (its neighbours unloaded: from the water up), then the grass, then the sand.
    expect(faces.map(({ material, side }) => `${material}:${side}`)).toEqual([
      "path:left",
      "path:right",
      "ground:left",
      "grass:left",
      "grass:right",
      "sand:left",
      "sand:right",
    ]);
    // The grass's `−x` side: its top block from 1 to 2 blocks above the water, ground under it.
    expect(faces[2].corners).toEqual([
      ...texel(2.5, 4.5, 1),
      ...texel(2.5, 3.5, 1),
      ...texel(2.5, 3.5, 0),
      ...texel(2.5, 4.5, 0),
    ]);
    expect(faces[3].corners).toEqual([
      ...texel(2.5, 4.5, 2),
      ...texel(2.5, 3.5, 2),
      ...texel(2.5, 3.5, 1),
      ...texel(2.5, 4.5, 1),
    ]);
    // Its `−y` side is hidden by the sand up to the sand's top: only its top block shows.
    expect(faces[4].corners).toEqual([
      ...texel(2.5, 3.5, 2),
      ...texel(3.5, 3.5, 2),
      ...texel(3.5, 3.5, 1),
      ...texel(2.5, 3.5, 1),
    ]);
    expect(faces.every(({ cut }) => cut[0] === 0 && cut[1] === 1)).toBe(true);
    // Each face knows its column and how high its edges stand above the water, for the waves.
    expect(faces[3]).toMatchObject({ x: 3, y: 4, heights: [2, 1] });
    expect(getReflectedFaces(AREA, columns, TILE_METRICS, undefined, P / 2)[3].corners[0]).toBeCloseTo(
      faces[3].corners[0] / 2,
    );
  });

  it("shows only what rises above a sunk top, and what a sunk neighbour leaves uncovered", () => {
    const columns = new CellMap<Box>();
    const set = (column: Box) => columns.set(column.x, column.y, column);
    for (let x = 2; x <= 5; x += 1) for (let y = 3; y <= 6; y += 1) set(box(x, y, -1, "water"));
    // A sand shore half a block sunk, a grass column behind it and sand beside it.
    set(box(3, 3, 0, "sand"));
    set(box(3, 4, 1, "grass"));
    set(box(4, 3, 0, "sand"));
    const insetAt = (x: number, y: number) => ((columns.get(x, y) as Box).type === "sand" ? 0.5 : 0);

    const faces = getReflectedFaces(AREA, columns, TILE_METRICS, insetAt);
    const of = (material: string, side: string) =>
      faces
        .filter((face) => face.material === material && face.side === side)
        .map(({ corners, cut }) => ({ corners, cut }));

    // The sand's sides: from the water to its sunk top, the lower half of the block's side.
    expect(of("sand", "right")).toContainEqual({
      corners: [...texel(2.5, 2.5, 0.5), ...texel(3.5, 2.5, 0.5), ...texel(3.5, 2.5, 0), ...texel(2.5, 2.5, 0)],
      cut: [0.5, 1],
    });
    // The grass behind: its ground block from the sand's sunk top up, then its own top block.
    expect(of("ground", "right")).toEqual([
      {
        corners: [...texel(2.5, 3.5, 1), ...texel(3.5, 3.5, 1), ...texel(3.5, 3.5, 0.5), ...texel(2.5, 3.5, 0.5)],
        cut: [0, 0.5],
      },
    ]);
    expect(of("grass", "right")).toHaveLength(1);
    // The sand beside the sand: its `−x` side is level with its neighbour's top, so nothing shows.
    expect(of("sand", "left")).toHaveLength(1);
  });
});

describe("getFaceUvs", () => {
  it("finds a block's sides under its top diamond in its texture", () => {
    // A block 40 wide: a 20 tall diamond over sides 40/3 tall.
    const texture = { width: 40, height: 20 + 40 / 3 };
    const top = 20 / texture.height;
    const tall = 40 / 3 / texture.height;

    expect(getFaceUvs("left", texture, TILE_METRICS)).toEqual([
      0,
      top / 2,
      0.5,
      top,
      0.5,
      top + tall,
      0,
      top / 2 + tall,
    ]);
    expect(getFaceUvs("right", texture, TILE_METRICS)).toEqual([
      0.5,
      top,
      1,
      top / 2,
      1,
      top / 2 + tall,
      0.5,
      top + tall,
    ]);
    expect(getFaceUvs("right", texture, TILE_METRICS)[6]).toBeCloseTo(0.5);
    // The lower half of the side only.
    const lowerHalf = [0, top / 2 + tall / 2, 0.5, top + tall / 2, 0.5, top + tall, 0, top / 2 + tall];
    getFaceUvs("left", texture, TILE_METRICS, [0.5, 1]).forEach((uv, index) =>
      expect(uv).toBeCloseTo(lowerHalf[index]),
    );
    expect(top + tall).toBeCloseTo(1);
  });
});
