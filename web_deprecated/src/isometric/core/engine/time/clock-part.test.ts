import { describe, expect, it } from "vitest";
import { WORLD_START_TICK } from "./clock";
import { CLOCK_PART, createClockPart } from "./clock-part";

describe("createClockPart", () => {
  it("is the clock part, starting at the world start tick by default", () => {
    const part = createClockPart();

    expect(part.id).toBe(CLOCK_PART.id);
    expect(part.create(undefined)).toEqual({ tick: WORLD_START_TICK });
  });

  it("starts a new world at the given tick", () => {
    expect(createClockPart(42).create(undefined)).toEqual({ tick: 42 });
  });

  it("rejects an invalid start tick when it is made, before any world exists", () => {
    expect(() => createClockPart(-1)).toThrow(RangeError);
    expect(() => createClockPart(1.5)).toThrow(RangeError);
  });

  it("gives every world its own clock", () => {
    const part = createClockPart(7);

    expect(part.create(undefined)).not.toBe(part.create(undefined));
  });

  it("saves the tick and restores it as it was, whatever the start tick", () => {
    const saved = JSON.parse(JSON.stringify(createClockPart().serialize({ tick: 123 }))) as { tick: number };

    expect(saved).toEqual({ tick: 123 });
    expect(createClockPart(5).restore(saved, undefined)).toEqual({ tick: 123 });
  });

  it("rejects a saved tick that is not a non-negative safe integer", () => {
    expect(() => createClockPart().restore({ tick: -5 }, undefined)).toThrow(RangeError);
  });
});
