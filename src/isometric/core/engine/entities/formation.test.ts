import { describe, expect, it } from "vitest";
import {
  parseFormationMap,
  pickFormationOffsets,
  resolveFormation,
  rotateFormation,
} from "./formation";

describe("parseFormationMap", () => {
  it("returns member offsets relative to the first member, anchor first", () => {
    expect(parseFormationMap(["XX", "X."])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it("anchors on the first member in reading order, even off the first column", () => {
    expect(parseFormationMap([".X.", "X.X"])).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it("skips empty leading rows and accepts rows of different lengths", () => {
    expect(parseFormationMap(["...", "X", "..X"])).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it("rejects maps without members", () => {
    expect(() => parseFormationMap([])).toThrow(/at least one "X"/);
    expect(() => parseFormationMap(["..", "."])).toThrow(/at least one "X"/);
  });

  it("rejects unknown characters", () => {
    expect(() => parseFormationMap(["X#"])).toThrow(/"#" at row 0, column 1/);
  });
});

describe("rotateFormation", () => {
  const lShape = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];

  it("keeps the offsets without a turn", () => {
    expect(rotateFormation(lShape, 0)).toEqual(lShape);
  });

  it("rotates a quarter turn around the anchor", () => {
    expect(rotateFormation(lShape, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]);
  });

  it("normalises any number of turns, negative included", () => {
    expect(rotateFormation(lShape, 2)).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ]);
    expect(rotateFormation(lShape, 4)).toEqual(lShape);
    expect(rotateFormation(lShape, -1)).toEqual(rotateFormation(lShape, 3));
  });
});

describe("resolveFormation", () => {
  it("treats a missing formation as a single anchor", () => {
    expect(resolveFormation(undefined)).toEqual({
      rotations: [[{ x: 0, y: 0 }]],
      minMembers: 1,
    });
  });

  it("requires every member by default and keeps one orientation", () => {
    const resolved = resolveFormation({ map: ["XX", "X."] });

    expect(resolved.minMembers).toBe(3);
    expect(resolved.rotations).toEqual([parseFormationMap(["XX", "X."])]);
  });

  it("precomputes the four orientations when rotation is enabled", () => {
    const offsets = parseFormationMap(["XX", "X."]);
    const resolved = resolveFormation({ map: ["XX", "X."], rotate: true });

    expect(resolved.rotations).toEqual([0, 1, 2, 3].map((turns) =>
      rotateFormation(offsets, turns),
    ));
  });

  it("clamps minMembers between one and the member count", () => {
    expect(resolveFormation({ map: ["XXX"], minMembers: 2 }).minMembers).toBe(2);
    expect(resolveFormation({ map: ["XXX"], minMembers: 2.7 }).minMembers).toBe(2);
    expect(resolveFormation({ map: ["XXX"], minMembers: 0 }).minMembers).toBe(1);
    expect(resolveFormation({ map: ["XXX"], minMembers: 9 }).minMembers).toBe(3);
  });
});

describe("pickFormationOffsets", () => {
  it("does not consume randomness with a single orientation", () => {
    const resolved = resolveFormation({ map: ["XX"] });
    let calls = 0;

    expect(pickFormationOffsets(resolved, () => {
      calls++;
      return 0.9;
    })).toBe(resolved.rotations[0]);
    expect(calls).toBe(0);
  });

  it("picks an orientation from the random result", () => {
    const resolved = resolveFormation({ map: ["XX"], rotate: true });

    expect(pickFormationOffsets(resolved, () => 0)).toBe(resolved.rotations[0]);
    expect(pickFormationOffsets(resolved, () => 0.5)).toBe(resolved.rotations[2]);
    expect(pickFormationOffsets(resolved, () => 0.99)).toBe(resolved.rotations[3]);
    // Injected generators may return 1; it must not fall out of range.
    expect(pickFormationOffsets(resolved, () => 1)).toBe(resolved.rotations[3]);
  });
});
