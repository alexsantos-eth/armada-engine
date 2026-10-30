import { describe, expect, it } from "vitest";
import { transitionPlayerMotion, type PlayerMotionEvent } from "./motion";

describe("player motion machine", () => {
  it.each([
    ["idle", { type: "WALK" }, "walking"],
    ["idle", { type: "RUN" }, "running"],
    ["idle", { type: "SKID" }, "skidding"],
    ["idle", { type: "JUMP" }, "jumping"],
    ["idle", { type: "FALL" }, "falling"],
    ["idle", { type: "CLIMB" }, "climbing"],
    ["walking", { type: "WALK" }, "walking"],
    ["walking", { type: "RUN" }, "running"],
    ["walking", { type: "SKID" }, "skidding"],
    ["walking", { type: "STOP" }, "idle"],
    ["walking", { type: "JUMP" }, "jumping"],
    ["walking", { type: "FALL" }, "falling"],
    ["walking", { type: "CLIMB" }, "climbing"],
    ["running", { type: "RUN" }, "running"],
    ["running", { type: "WALK" }, "walking"],
    ["running", { type: "SKID" }, "skidding"],
    ["running", { type: "STOP" }, "idle"],
    ["running", { type: "JUMP" }, "jumping"],
    ["running", { type: "FALL" }, "falling"],
    ["running", { type: "CLIMB" }, "climbing"],
    ["skidding", { type: "SKID" }, "skidding"],
    ["skidding", { type: "WALK" }, "walking"],
    ["skidding", { type: "RUN" }, "running"],
    ["skidding", { type: "STOP" }, "idle"],
    ["skidding", { type: "JUMP" }, "jumping"],
    ["skidding", { type: "FALL" }, "falling"],
    ["skidding", { type: "CLIMB" }, "climbing"],
    ["jumping", { type: "JUMP" }, "jumping"],
    ["jumping", { type: "FALL" }, "falling"],
    ["jumping", { type: "LAND_IDLE" }, "idle"],
    ["jumping", { type: "LAND_WALKING" }, "walking"],
    ["jumping", { type: "LAND_RUNNING" }, "running"],
    ["jumping", { type: "LAND_SKIDDING" }, "skidding"],
    ["jumping", { type: "CLIMB" }, "climbing"],
    ["falling", { type: "FALL" }, "falling"],
    ["falling", { type: "LAND_IDLE" }, "idle"],
    ["falling", { type: "LAND_WALKING" }, "walking"],
    ["falling", { type: "LAND_RUNNING" }, "running"],
    ["falling", { type: "LAND_SKIDDING" }, "skidding"],
    ["falling", { type: "CLIMB" }, "climbing"],
    ["climbing", { type: "CLIMB_TICK" }, "climbing"],
    ["climbing", { type: "CLIMB_DONE_IDLE" }, "idle"],
    ["climbing", { type: "CLIMB_DONE_WALKING" }, "walking"],
  ] as const satisfies readonly (readonly [
    "idle" | "walking" | "running" | "skidding" | "jumping" | "falling" | "climbing",
    PlayerMotionEvent,
    string,
  ])[])("%s + %o -> %s", (state, event, expected) => {
    expect(transitionPlayerMotion(state, event)).toBe(expected);
  });

  it("ignores events that are invalid for the current state", () => {
    expect(transitionPlayerMotion("idle", { type: "CLIMB_TICK" })).toBe("idle");
    expect(transitionPlayerMotion("climbing", { type: "JUMP" })).toBe("climbing");
    expect(transitionPlayerMotion("climbing", { type: "RUN" })).toBe("climbing");
    expect(transitionPlayerMotion("falling", { type: "SKID" })).toBe("falling");
  });
});
