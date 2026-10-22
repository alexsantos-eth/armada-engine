import { describe, expect, it } from "vitest";
import { Box } from "../terrain";
import { projectBoxesToIsometric } from "./projection";

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

  // The coordinate system documented in ARCHITECTURE.md ("Sistema de coordenadas"). Screen `y`
  // grows downward, as in PixiJS.
  it("keeps the documented axes: (0,0) nearest the camera, +x up-right, +y up-left, elevation up", () => {
    const config = { tileWidth: 40, tileHeight: 20, elevationStep: 10, originX: 0, originY: 0 };
    const [origin, plusX, plusY, plusXY, plusXMinusY, raised] = projectBoxesToIsometric(
      [new Box(0, 0), new Box(1, 0), new Box(0, 1), new Box(1, 1), new Box(1, -1), new Box(0, 0, { elevation: 1 })],
      config,
    );

    // Column (0,0) at elevation 0 lands exactly on the origin.
    expect(origin).toMatchObject({ screenX: 0, screenY: 0, baseScreenY: 0 });
    // +x: half a tile right and half a tile up (north-east).
    expect(plusX).toMatchObject({ screenX: 20, screenY: -10 });
    // +y: half a tile left and half a tile up (north-west).
    expect(plusY).toMatchObject({ screenX: -20, screenY: -10 });
    // +x +y: straight up (north, away from the camera).
    expect(plusXY).toMatchObject({ screenX: 0, screenY: -20 });
    // +x −y: straight right (east).
    expect(plusXMinusY).toMatchObject({ screenX: 40, screenY: 0 });
    // Elevation only moves up the screen and keeps the ground contact point.
    expect(raised).toMatchObject({ screenX: 0, screenY: -10, baseScreenY: 0 });
  });

  it("defaults the elevation step to half tile height", () => {
    const [projected] = projectBoxesToIsometric([new Box(0, 0, { elevation: 2 })], {
      tileWidth: 40,
      tileHeight: 20,
      originX: 0,
      originY: 0,
    });

    expect(projected.screenY).toBe(-20);
  });
});
