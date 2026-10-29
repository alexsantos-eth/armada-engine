import { describe, expect, it } from "vitest";
import { findPath, PATH_STEPS } from "./astar";

const AREA = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
const flat = () => 1;

describe("findPath", () => {
  it("tries the four edge neighbours in a fixed order", () => {
    expect(PATH_STEPS).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ]);
  });

  it("finds the cheapest path, from the start to the goal", () => {
    const path = findPath({
      area: AREA,
      starts: [{ x: 0, y: 0 }],
      isGoal: (x, y) => x === 2 && y === 0,
      cost: flat,
      heuristic: (x) => 2 - x,
    });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it("goes around columns it cannot step on and stays inside the area", () => {
    // A wall at x = 1 except at y = 4, the far edge.
    const cost = (_fx: number, _fy: number, tx: number, ty: number) => (tx === 1 && ty < 4 ? Infinity : 1);
    const path = findPath({ area: AREA, starts: [{ x: 0, y: 0 }], isGoal: (x, y) => x === 2 && y === 0, cost });
    expect(path).toHaveLength(11);
    expect(path?.every(({ x, y }) => x >= 0 && x <= 4 && y >= 0 && y <= 4)).toBe(true);
    expect(path?.some(({ x, y }) => x === 1 && y < 4)).toBe(false);
  });

  it("prefers cheap columns over short paths", () => {
    // The direct row costs 10 per step; the row above costs 1.
    const cost = (_fx: number, _fy: number, _tx: number, ty: number) => (ty === 0 ? 10 : 1);
    const path = findPath({ area: AREA, starts: [{ x: 0, y: 0 }], isGoal: (x, y) => x === 3 && y === 0, cost });
    expect(path?.slice(1, -1).every(({ y }) => y === 1)).toBe(true);
  });

  it("starts from the cheapest of several starts and ignores those outside the area", () => {
    const path = findPath({
      area: AREA,
      starts: [
        { x: -3, y: 0 },
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 4, y: 4 },
      ],
      isGoal: (x, y) => x === 4 && y === 2,
      cost: flat,
    });
    expect(path).toEqual([
      { x: 4, y: 4 },
      { x: 4, y: 3 },
      { x: 4, y: 2 },
    ]);
  });

  it("returns a single column when a start is a goal", () => {
    expect(findPath({ area: AREA, starts: [{ x: 1, y: 1 }], isGoal: () => true, cost: flat })).toEqual([
      { x: 1, y: 1 },
    ]);
  });

  it("returns undefined when no goal can be reached", () => {
    expect(findPath({ area: AREA, starts: [{ x: 0, y: 0 }], isGoal: () => false, cost: flat })).toBeUndefined();
    expect(findPath({ area: AREA, starts: [], isGoal: () => true, cost: flat })).toBeUndefined();
    expect(
      findPath({ area: AREA, starts: [{ x: 0, y: 0 }], isGoal: (x) => x === 4, cost: () => Infinity }),
    ).toBeUndefined();
  });

  it("breaks ties the same way every time", () => {
    const search = () =>
      findPath({ area: AREA, starts: [{ x: 0, y: 0 }], isGoal: (x, y) => x === 3 && y === 3, cost: flat });
    const path = search();
    expect(path).toHaveLength(7);
    expect(search()).toEqual(path);
  });
});
