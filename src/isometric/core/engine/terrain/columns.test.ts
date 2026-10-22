import { describe, expect, it } from "vitest";
import { Box } from "./box";
import { buildFilledElevationLevels, fillElevations } from "./columns";

describe("column filling", () => {
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
});
