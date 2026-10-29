import { describe, expect, it } from "vitest";
import { CONNECTION_BITS, getConnectionMask, getPathShape, type PathShape } from "./connections";

describe("getConnectionMask", () => {
  it("has one bit per edge neighbour: +x, +y, −x, −y", () => {
    expect(CONNECTION_BITS).toEqual([1, 2, 4, 8]);
  });

  it("sets the bit of each neighbour the column joins", () => {
    const path = new Set(["0,0", "1,0", "0,-1"]);
    const connects = (_x: number, _y: number, nx: number, ny: number) => path.has(`${nx},${ny}`);
    expect(getConnectionMask(0, 0, connects)).toBe(1 | 8);
    expect(getConnectionMask(1, 0, connects)).toBe(4);
    expect(getConnectionMask(5, 5, connects)).toBe(0);
  });

  it("asks from the column itself", () => {
    const asked: number[][] = [];
    getConnectionMask(2, 3, (x, y, nx, ny) => {
      asked.push([x, y, nx, ny]);
      return false;
    });
    expect(asked).toEqual([
      [2, 3, 3, 3],
      [2, 3, 2, 4],
      [2, 3, 1, 3],
      [2, 3, 2, 2],
    ]);
  });
});

describe("getPathShape", () => {
  it.each<[number, PathShape]>([
    [0, "single"],
    [1, "end"],
    [2, "end"],
    [4, "end"],
    [8, "end"],
    [0b0101, "straight"],
    [0b1010, "straight"],
    [0b0011, "corner"],
    [0b0110, "corner"],
    [0b1100, "corner"],
    [0b1001, "corner"],
    [0b0111, "tee"],
    [0b1011, "tee"],
    [0b1101, "tee"],
    [0b1110, "tee"],
    [0b1111, "cross"],
  ])("draws mask %i as a %s", (mask, shape) => {
    expect(getPathShape(mask)).toBe(shape);
  });
});
