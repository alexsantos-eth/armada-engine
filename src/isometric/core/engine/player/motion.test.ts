import { describe, expect, it } from "vitest";
import { transitionPlayerMotion, type PlayerMotionEvent } from "./motion";

describe("player motion machine", () => {
  it.each([
    ["idle", { type: "WALK" }, "walking"],
    ["idle", { type: "JUMP" }, "jumping"],
    ["idle", { type: "FALL" }, "falling"],
    ["idle", { type: "CLIMB" }, "climbing"],
    ["walking", { type: "WALK" }, "walking"],
    ["walking", { type: "STOP" }, "idle"],
    ["walking", { type: "JUMP" }, "jumping"],
    ["walking", { type: "FALL" }, "falling"],
    ["walking", { type: "CLIMB" }, "climbing"],
    ["jumping", { type: "JUMP" }, "jumping"],
    ["jumping", { type: "FALL" }, "falling"],
    ["jumping", { type: "LAND_IDLE" }, "idle"],
    ["jumping", { type: "LAND_WALKING" }, "walking"],
    ["jumping", { type: "CLIMB" }, "climbing"],
    ["falling", { type: "FALL" }, "falling"],
    ["falling", { type: "LAND_IDLE" }, "idle"],
    ["falling", { type: "LAND_WALKING" }, "walking"],
    ["falling", { type: "CLIMB" }, "climbing"],
    ["climbing", { type: "CLIMB_TICK" }, "climbing"],
    ["climbing", { type: "CLIMB_DONE_IDLE" }, "idle"],
    ["climbing", { type: "CLIMB_DONE_WALKING" }, "walking"],
  ] as const satisfies readonly (readonly [
    "idle" | "walking" | "jumping" | "falling" | "climbing",
    PlayerMotionEvent,
    string,
  ])[])("%s + %o -> %s", (state, event, expected) => {
    expect(transitionPlayerMotion(state, event)).toBe(expected);
  });

  it("ignores events that are invalid for the current state", () => {
    expect(transitionPlayerMotion("idle", { type: "CLIMB_TICK" })).toBe("idle");
    expect(transitionPlayerMotion("climbing", { type: "JUMP" })).toBe("climbing");
  });
});
