import { describe, expect, it } from "vitest";
import { Box } from "../entities";
import { projectBoxesToIsometric } from "./board";

describe("projectBoxesToIsometric", () => {
  it("projects grid coordinates and elevation", () => {
    const box = new Box(2, 1, { elevation: 3 });
    const [projected] = projectBoxesToIsometric([box], {
      tileWidth: 40,
      tileHeight: 20,
      elevationStep: 10,
      originX: 100,
      originY: 200,
    });

    expect(projected).toMatchObject({
      x: 2,
      y: 1,
      screenX: 120,
      baseScreenY: 170,
      screenY: 140,
      box,
    });
  });

  it("defaults the elevation step to half tile height", () => {
    const [projected] = projectBoxesToIsometric(
      [new Box(0, 0, { elevation: 2 })],
      { tileWidth: 40, tileHeight: 20, originX: 0, originY: 0 },
    );

    expect(projected.screenY).toBe(-20);
  });
});