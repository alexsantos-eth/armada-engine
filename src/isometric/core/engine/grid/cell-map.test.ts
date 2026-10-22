import { describe, expect, it } from "vitest";
import { CellMap } from "./cell-map";

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

  it("iterates in insertion order with world coordinates", () => {
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
});
