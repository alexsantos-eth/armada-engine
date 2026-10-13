import { describe, expect, it } from "vitest";
import { Box } from "../entities";
import {
  buildFilledElevationLevels,
  fillElevations,
  isWithinViewport,
} from "./projection";

describe("elevation projection helpers", () => {
  it("fills levels below the requested minimum", () => {
    expect(buildFilledElevationLevels(3, -2)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(buildFilledElevationLevels(-4, -2)).toEqual([-4, -3]);
  });

  it("creates independent boxes for every filled level", () => {
    const source = new Box(4, 5, {
      elevation: 2,
      metadata: { kind: "hill" },
    });
    const filled = fillElevations([source], 0);

    expect(filled.map((box) => box.elevation)).toEqual([0, 1, 2]);
    expect(filled.every((box) => box !== source)).toBe(true);
    expect(filled.every((box) => box.metadata.kind === "hill")).toBe(true);
  });

  it("culls points outside the viewport margin", () => {
    expect(isWithinViewport(0, 0, 100, 100)).toBe(true);
    expect(isWithinViewport(-120, 100, 100, 100)).toBe(true);
    expect(isWithinViewport(-121, 100, 100, 100)).toBe(false);
    expect(isWithinViewport(221, 100, 100, 100)).toBe(false);
  });
});