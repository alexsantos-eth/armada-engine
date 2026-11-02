import { describe, expect, it } from "vitest";
import { getClimbPose, getIdlePose, getJumpPose, getWalkPose } from "./poses";

describe("player frame columns", () => {
  it("reverses the walk cycle for negative distance", () => {
    expect(getWalkPose(-0.75, { frames: 4, stride: 2 })).toBe(3);
    expect(getWalkPose(2, { frames: 4, stride: 2 })).toBe(1);
  });

  it("clamps climbing and loops idle time", () => {
    expect(getClimbPose(1.2, { frames: 4 })).toBe(3);
    expect(getIdlePose(2600, { frames: 4, period: 2000 })).toBe(1);
  });

  it("has no jump frame while grounded", () => {
    const jump = { poses: { takeoff: 0, rise: 1, apex: 2, fall: 3, landing: 4 } };
    expect(getJumpPose("ground", jump)).toBeUndefined();
    expect(getJumpPose("fall", jump)).toBe(3);
  });
});
