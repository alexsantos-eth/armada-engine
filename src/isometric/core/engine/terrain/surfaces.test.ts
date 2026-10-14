import { describe, expect, it } from "vitest";
import {
  SAND_ELEVATION,
  classifyColumnSurfaces,
  getBlockMaterial,
  getColumnSurface,
} from "./surfaces";

const column = (x: number, y: number, elevation: number) => ({
  x,
  y,
  elevation,
  metadata: {},
});

describe("getColumnSurface", () => {
  it("is water below zero", () => {
    expect(getColumnSurface(-1, [])).toBe("water");
  });

  it("is sand at the sand elevation next to water", () => {
    expect(SAND_ELEVATION).toBe(0);
    expect(getColumnSurface(0, [undefined, 1, -2])).toBe("sand");
  });

  it("is grass at the sand elevation without water around", () => {
    expect(getColumnSurface(0, [undefined, 0, 2])).toBe("grass");
  });

  it("is grass above the sand elevation even next to water", () => {
    expect(getColumnSurface(1, [-1])).toBe("grass");
  });
});

describe("classifyColumnSurfaces", () => {
  it("only treats edge-adjacent water columns as neighbours", () => {
    const surfaces = classifyColumnSurfaces([
      column(0, 0, -1),
      column(1, 0, 0),
      column(1, 1, 0),
      column(2, 2, 0),
      column(0, 2, 1),
    ]);

    expect(Object.fromEntries(surfaces)).toEqual({
      "0:0": "water",
      "1:0": "sand",
      "1:1": "grass",
      "2:2": "grass",
      "0:2": "grass",
    });
  });

  it("uses the top block of filled columns", () => {
    const surfaces = classifyColumnSurfaces([
      column(0, 0, -2),
      column(0, 0, -1),
      column(0, 0, 0),
      column(1, 0, -3),
      column(1, 0, -2),
    ]);

    expect(surfaces.get("0:0")).toBe("sand");
    expect(surfaces.get("1:0")).toBe("water");
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
