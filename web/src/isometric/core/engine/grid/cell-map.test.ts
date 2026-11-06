import { describe, expect, it } from "vitest";
import { CellMap } from "./cell-map";
import { CHUNK_SIZE, MAX_GRID_COORD } from "./coords";

describe("CellMap", () => {
  it("stores one value per column, including negative coordinates", () => {
    const map = new CellMap<string>();

    map.set(0, 0, "a").set(-3, 7, "b").set(0, 0, "c");

    expect(map.get(0, 0)).toBe("c");
    expect(map.get(-3, 7)).toBe("b");
    expect(map.get(1, 1)).toBeUndefined();
    expect(map.has(-3, 7)).toBe(true);
    expect(map.has(7, -3)).toBe(false);
    expect(map.size).toBe(2);
  });

  it("deletes values", () => {
    const map = new CellMap<number>().set(1, 2, 3);

    expect(map.delete(1, 2)).toBe(true);
    expect(map.delete(1, 2)).toBe(false);
    expect(map.size).toBe(0);
  });

  it("iterates in insertion order with world coordinates (cells of one chunk)", () => {
    const map = new CellMap<number>().set(2, 0, 1).set(-1, 5, 2);
    const seen: string[] = [];

    map.forEach((value, x, y) => seen.push(`${x},${y}=${value}`));

    expect(seen).toEqual(["2,0=1", "-1,5=2"]);
    expect([...map.values()]).toEqual([1, 2]);
    expect([...map.entries()]).toEqual([
      [{ x: 2, y: 0 }, 1],
      [{ x: -1, y: 5 }, 2],
    ]);
  });

  it("builds from grid objects", () => {
    const map = CellMap.from(
      [
        { x: 1, y: 1, elevation: 4 },
        { x: 2, y: 1, elevation: 5 },
      ],
      ({ elevation }) => elevation,
    );

    expect(map.get(2, 1)).toBe(5);
    expect(map.size).toBe(2);
  });

  it("keeps the cells on both sides of a chunk edge apart, also at negative coordinates", () => {
    const map = new CellMap<string>();
    const cells = [
      [CHUNK_SIZE - 1, 0],
      [CHUNK_SIZE, 0],
      [-1, 0],
      [0, -1],
      [-CHUNK_SIZE, -CHUNK_SIZE - 1],
      [MAX_GRID_COORD, -MAX_GRID_COORD],
    ];

    cells.forEach(([x, y]) => map.set(x, y, `${x},${y}`));

    cells.forEach(([x, y]) => expect(map.get(x, y)).toBe(`${x},${y}`));
    expect(map.get(0, 0)).toBeUndefined();
    expect(map.size).toBe(cells.length);
    expect([...map.entries()].map(([{ x, y }]) => [x, y]).sort()).toEqual([...cells].sort());
  });

  it("forgets a chunk once its last cell is deleted, and can fill it again", () => {
    const map = new CellMap<number>().set(5, 5, 1).set(40, 5, 2);

    map.delete(5, 5);
    expect(map.has(5, 5)).toBe(false);
    expect(map.get(6, 6)).toBeUndefined();
    map.set(6, 6, 3);

    expect(map.get(6, 6)).toBe(3);
    expect(map.get(40, 5)).toBe(2);
    expect(map.delete(7, 7)).toBe(false);
    expect(map.delete(500, 500)).toBe(false);
    expect(map.size).toBe(2);
  });

  it("iterates chunk by chunk, in the order their first cell was set, then in insertion order", () => {
    const map = new CellMap<number>()
      .set(2, 0, 1)
      .set(CHUNK_SIZE + 3, 0, 2)
      .set(3, 0, 3);

    expect([...map.values()]).toEqual([1, 3, 2]);
  });

  it("holds any value, `undefined` included", () => {
    const map = new CellMap<number | undefined>().set(1, 1, undefined);

    expect(map.has(1, 1)).toBe(true);
    expect(map.size).toBe(1);
  });

  it("rejects non-integer or out-of-range coordinates", () => {
    const map = new CellMap<number>();

    expect(() => map.set(0.5, 0, 1)).toThrow("Grid coordinate out of range: (0.5, 0)");
    expect(() => map.get(0, MAX_GRID_COORD + 1)).toThrow(RangeError);
    expect(() => map.has(Number.NaN, 0)).toThrow(RangeError);
    expect(() => map.delete(0, -MAX_GRID_COORD - 1)).toThrow(RangeError);
  });
});
