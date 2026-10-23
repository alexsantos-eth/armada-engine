import { describe, expect, it } from "vitest";
import { SpatialIndex } from "./spatial-index";

type Item = { name: string; kind: string };
const item = (name: string, kind = "rock"): Item => ({ name, kind });

describe("SpatialIndex", () => {
  it("finds items by any cell of their footprint", () => {
    const index = new SpatialIndex<Item>();
    const pier = item("pier");

    index.insert(pier, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);

    expect(index.at(1, 0)).toEqual([pier]);
    expect(index.at(3, 0)).toEqual([]);
    expect(index.isOccupied(2, 0)).toBe(true);
    expect(index.isOccupied(0, 1)).toBe(false);
    expect(index.cellsOf(pier)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(index.cellsOf(item("other"))).toEqual([]);
    expect(index.has(pier)).toBe(true);
    expect(index.size).toBe(1);
  });

  it("allows several items on one cell and ignores repeated cells of one item", () => {
    const index = new SpatialIndex<Item>();
    const a = item("a");
    const b = item("b");

    index.insert(a, [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    index.insert(b, [{ x: 0, y: 0 }]);

    expect(index.at(0, 0)).toEqual([a, b]);
    expect(index.cellsOf(a)).toEqual([{ x: 0, y: 0 }]);
  });

  it("rejects inserting the same item twice", () => {
    const index = new SpatialIndex<Item>();
    const a = item("a");
    index.insert(a, [{ x: 0, y: 0 }]);

    expect(() => index.insert(a, [{ x: 1, y: 1 }])).toThrow("already in the index");
  });

  it("removes and moves items", () => {
    const index = new SpatialIndex<Item>();
    const a = item("a");
    const b = item("b");
    index.insert(a, [{ x: 0, y: 0 }]);
    index.insert(b, [{ x: 0, y: 0 }]);

    expect(index.remove(a)).toBe(true);
    expect(index.remove(a)).toBe(false);
    expect(index.at(0, 0)).toEqual([b]);

    index.move(b, [{ x: 5, y: 5 }]);
    expect(index.isOccupied(0, 0)).toBe(false);
    expect(index.at(5, 5)).toEqual([b]);
    index.move(a, [{ x: 6, y: 6 }]);
    expect(index.at(6, 6)).toEqual([a]);
  });

  it("queries rectangles in insertion order, without duplicates", () => {
    const index = new SpatialIndex<Item>();
    const far = item("far");
    const wide = item("wide");
    const near = item("near", "tree");
    index.insert(far, [{ x: 10, y: 10 }]);
    index.insert(wide, [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    index.insert(near, [{ x: 1, y: 1 }]);

    const rect = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    expect(index.queryRect(rect)).toEqual([wide, near]);
    expect(index.queryRect(rect, ({ kind }) => kind === "tree")).toEqual([near]);
    expect(index.queryRect({ minX: 0, minY: 0, maxX: 20, maxY: 20 })).toEqual([far, wide, near]);
    expect(index.queryRect({ minX: 5, minY: 5, maxX: 4, maxY: 4 })).toEqual([]);
  });

  it("answers whether anything matches a rectangle, by either strategy", () => {
    const index = new SpatialIndex<Item>();
    index.insert(item("outside"), [{ x: 900, y: 900 }]);
    index.insert(item("a"), [{ x: 0, y: 0 }]);

    // Small rectangle: scans cells. Huge rectangle: scans items.
    expect(index.anyInRect({ minX: -1, minY: -1, maxX: 1, maxY: 1 })).toBe(true);
    expect(index.anyInRect({ minX: -500, minY: -500, maxX: 500, maxY: 500 })).toBe(true);
    expect(index.anyInRect({ minX: 2, minY: 2, maxX: 3, maxY: 3 })).toBe(false);
    expect(index.anyInRect({ minX: -500, minY: -500, maxX: 500, maxY: 500 }, ({ kind }) => kind === "tree")).toBe(
      false,
    );
  });

  it("scans cells when the rectangle is smaller than the index", () => {
    const index = new SpatialIndex<Item>();
    const field = item("field");
    const rock = item("rock");
    index.insert(
      field,
      Array.from({ length: 16 }, (_, i) => ({ x: 10 + (i % 4), y: 10 + Math.floor(i / 4) })),
    );
    index.insert(rock, [{ x: 0, y: 0 }]);

    expect(index.anyInRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBe(true);
    expect(index.anyInRect({ minX: 5, minY: 5, maxX: 6, maxY: 6 })).toBe(false);
    expect(index.queryRect({ minX: 11, minY: 11, maxX: 12, maxY: 12 })).toEqual([field]);
  });

  it("queries the Chebyshev neighbourhood around a column", () => {
    const index = new SpatialIndex<Item>();
    const diagonal = item("diagonal");
    index.insert(diagonal, [{ x: 2, y: 2 }]);

    expect(index.queryRadius(1, 1, 1)).toEqual([diagonal]);
    expect(index.queryRadius(0, 0, 1)).toEqual([]);
  });

  it("lists items in insertion order", () => {
    const index = new SpatialIndex<Item>();
    const a = item("a");
    const b = item("b");
    index.insert(b, [{ x: 1, y: 1 }]);
    index.insert(a, [{ x: 0, y: 0 }]);

    expect([...index.items()]).toEqual([b, a]);
  });

  it("finds items across chunk edges and at negative coordinates, by either strategy", () => {
    const index = new SpatialIndex<Item>();
    const pier = item("pier");
    const rock = item("rock");
    index.insert(pier, [
      { x: -1, y: 31 },
      { x: 0, y: 31 },
      { x: 0, y: 32 },
    ]);
    index.insert(rock, [{ x: -33, y: -1 }]);

    expect(index.at(0, 32)).toEqual([pier]);
    expect(index.cellsOf(pier)).toEqual([
      { x: -1, y: 31 },
      { x: 0, y: 31 },
      { x: 0, y: 32 },
    ]);
    expect(index.queryRect({ minX: -1, minY: 32, maxX: 0, maxY: 32 })).toEqual([pier]);
    expect(index.queryRect({ minX: -900, minY: -900, maxX: 900, maxY: 900 })).toEqual([pier, rock]);
    expect(index.queryRect({ minX: -900, minY: -900, maxX: 900, maxY: 0 })).toEqual([rock]);
    index.remove(pier);
    expect(index.isOccupied(0, 32)).toBe(false);
    expect(index.queryRect({ minX: -900, minY: -900, maxX: 900, maxY: 900 })).toEqual([rock]);
  });
});
