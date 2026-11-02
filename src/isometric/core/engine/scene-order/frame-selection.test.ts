import { describe, expect, it } from "vitest";
import { selectPlayerFrame } from "./frame-selection";

describe("player frame selection", () => {
  const sheets = { walk: { frames: 4, stride: 2 } };

  it("prefers climbing, then jumping, idle, and the walking sheet", () => {
    expect(
      selectPlayerFrame({
        ...sheets,
        climb: { frames: 4 },
        jumpPose: 2,
        climbing: 0.5,
        walking: true,
        flying: true,
        walked: 1,
      }),
    ).toEqual({ sheet: "climb", pose: 2 });
    expect(selectPlayerFrame({ ...sheets, jumpPose: 2, walking: true, flying: true, walked: 1 })).toEqual({
      sheet: "jump",
      pose: 2,
    });
    expect(
      selectPlayerFrame({ ...sheets, idle: { frames: 4, period: 2000 }, walking: false, flying: false, stoodMs: 500 }),
    ).toEqual({
      sheet: "idle",
      pose: 1,
    });
    expect(selectPlayerFrame({ ...sheets, walking: false, flying: true, airPose: 3 })).toEqual({
      sheet: "walk",
      pose: 3,
    });
  });

  it("uses the standing walk pose when a matching sheet is unavailable", () => {
    expect(selectPlayerFrame({ ...sheets, climbing: 0.5, walking: false, flying: false })).toEqual({
      sheet: "walk",
      pose: 0,
    });
  });

  it("defaults missing presentation counters and the airborne pose", () => {
    expect(selectPlayerFrame({ ...sheets, idle: { frames: 4, period: 2000 }, walking: false, flying: false })).toEqual({
      sheet: "idle",
      pose: 0,
    });
    expect(selectPlayerFrame({ ...sheets, walking: false, flying: true })).toEqual({ sheet: "walk", pose: 0 });
    expect(selectPlayerFrame({ ...sheets, walking: true, flying: false })).toEqual({ sheet: "walk", pose: 1 });
  });
});
