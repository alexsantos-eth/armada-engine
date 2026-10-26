import { describe, expect, it } from "vitest";
import { PLAYER_FACINGS } from "../player";
import { getWalkPose, getWalkSheetCell, getWalkSheetLayout, PLAYER_START_FACING } from "./walk";

const SHEET = {
  source: "/assets/player/walk.svg",
  canvas: { width: 1000, height: 800 },
  cell: { x: 300, y: 200, width: 400, height: 400 },
  gap: 40,
  frames: 4,
  stride: 2,
};

describe("player walk sheet", () => {
  it("starts facing the camera", () => {
    expect(PLAYER_FACINGS[PLAYER_START_FACING]).toBe("south");
  });

  it("has a row per facing and a column per pose, the standing one first", () => {
    expect(getWalkSheetLayout(SHEET)).toEqual({ columns: 5, rows: 8, cellWidth: 400, cellHeight: 400, gap: 40 });
  });

  it("gives the window of the canvas its cells show in fractions of the canvas", () => {
    expect(getWalkSheetCell(SHEET)).toEqual({ x: 0.3, y: 0.25, width: 0.4, height: 0.5 });
  });

  it("steps through the walk poses by distance, one cycle per stride", () => {
    const poses = [0, 0.49, 0.5, 1, 1.5, 1.99, 2, 2.5].map((distance) => getWalkPose(distance, SHEET));

    expect(poses).toEqual([1, 1, 2, 3, 4, 4, 1, 2]);
  });
});
