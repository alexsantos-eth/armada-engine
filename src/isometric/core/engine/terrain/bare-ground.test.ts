import { describe, expect, it } from "vitest";
import { BARE_GROUND_ELEVATION, createBareGroundField } from "./bare-ground";
import { SAND_ELEVATION } from "./surfaces";

/** The bare cells of a field in a square of `size` columns from the origin, as `"x,y"` lines. */
const bareCells = (field: (x: number, y: number) => boolean, size: number, originX = 0, originY = 0) => {
  const cells: string[] = [];
  for (let x = originX; x < originX + size; x += 1) {
    for (let y = originY; y < originY + size; y += 1) if (field(x, y)) cells.push(`${x},${y}`);
  }
  return cells;
};

describe("createBareGroundField", () => {
  it("only applies at the lowest land elevation, the same as the beaches", () => {
    expect(BARE_GROUND_ELEVATION).toBe(0);
    expect(BARE_GROUND_ELEVATION).toBe(SAND_ELEVATION);
  });

  it("is deterministic: the same seed gives the same patches", () => {
    expect(bareCells(createBareGroundField(1337), 48)).toEqual(bareCells(createBareGroundField(1337), 48));
  });

  it("depends on the seed", () => {
    expect(bareCells(createBareGroundField(1337), 48)).not.toEqual(bareCells(createBareGroundField(7), 48));
  });

  it("leaves bare a minority of the columns, in patches rather than scattered cells", () => {
    const field = createBareGroundField(1337);
    const size = 96;
    const bare = new Set(bareCells(field, size, -48, -48));
    const share = bare.size / (size * size);
    // Most bare cells have a bare edge neighbour.
    const clustered = [...bare].filter((cell) => {
      const [x, y] = cell.split(",").map(Number);
      return [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`].some((next) => bare.has(next));
    }).length;

    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.35);
    expect(clustered / bare.size).toBeGreaterThan(0.85);
  });
});
