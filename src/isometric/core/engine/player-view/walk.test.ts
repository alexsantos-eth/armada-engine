import { describe, expect, it } from "vitest";
import { PLAYER_FACINGS } from "../player";
import {
  getClimbPose,
  getClimbSheetLayout,
  getIdlePose,
  getIdleSheetLayout,
  getJumpPose,
  getJumpSheetLayout,
  getWalkPose,
  getWalkSheetCell,
  getWalkSheetLayout,
  PLAYER_START_FACING,
} from "./walk";

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
    // Backwards (negative distance, feet pedalling against a skid), the same cycle in reverse.
    expect([-0.25, -0.75, -2.25].map((distance) => getWalkPose(distance, SHEET))).toEqual([4, 3, 4]);
  });

  const IDLE = { source: "/assets/player/idle.svg", frames: 4, period: 2000 };

  it("lays out the idle sheet like the walk sheet, a column per pose of a breath", () => {
    expect(getIdleSheetLayout(SHEET, IDLE)).toEqual({ columns: 4, rows: 8, cellWidth: 400, cellHeight: 400, gap: 40 });
  });

  it("steps through the poses of a breath by time, from the standing one, one breath per period", () => {
    const poses = [0, 499, 500, 1000, 1999, 2000, 2600, -5].map((ms) => getIdlePose(ms, IDLE));

    expect(poses).toEqual([0, 0, 1, 2, 3, 0, 1, 0]);
  });

  const CLIMB = { source: "/assets/player/climb.svg", frames: 4 };

  it("lays out the climb sheet like the walk sheet, a column per pose of a climb", () => {
    expect(getClimbSheetLayout(SHEET, CLIMB)).toEqual({
      columns: 4,
      rows: 8,
      cellWidth: 400,
      cellHeight: 400,
      gap: 40,
    });
  });

  it("steps through the poses of a climb in order, an equal share of it each", () => {
    const poses = [0, 0.24, 0.25, 0.5, 0.99, 1, -0.1].map((progress) => getClimbPose(progress, CLIMB));

    expect(poses).toEqual([0, 0, 1, 2, 3, 3, 0]);
  });

  it("lays out a jump sheet like the walk sheet, one column per pose of a jump, and picks its pose by phase", () => {
    const jump = { source: "/assets/player/jump.svg", poses: { takeoff: 0, rise: 1, apex: 2, fall: 3, landing: 4 } };
    expect(getJumpSheetLayout(SHEET, jump)).toEqual({ ...getWalkSheetLayout(SHEET), columns: 5 });
    expect(getJumpPose("ground", jump)).toBeUndefined();
    expect(getJumpPose("apex", jump)).toBe(2);
    expect(getJumpPose("landing", jump)).toBe(4);
  });
});
