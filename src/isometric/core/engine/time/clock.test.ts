import { describe, expect, it } from "vitest";
import {
  advanceClock,
  createWorldClock,
  getClockTime,
  getTimeOfDay,
  TICKS_PER_DAY,
  TICKS_PER_SECOND,
  WORLD_START_TICK,
} from "./clock";

describe("clock constants", () => {
  it("lasts 20 real minutes per game day at 20 ticks per second", () => {
    expect(TICKS_PER_SECOND).toBe(20);
    expect(TICKS_PER_DAY).toBe(20 * 60 * TICKS_PER_SECOND);
  });

  it("starts the world at 08:00 of day 0", () => {
    expect(getClockTime(WORLD_START_TICK)).toEqual({ day: 0, hour: 8, minute: 0 });
  });
});

describe("createWorldClock", () => {
  it("starts at the world start tick by default", () => {
    expect(createWorldClock()).toEqual({ tick: WORLD_START_TICK });
  });

  it("accepts any non-negative integer tick", () => {
    expect(createWorldClock(0)).toEqual({ tick: 0 });
    expect(createWorldClock(123_456)).toEqual({ tick: 123_456 });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid tick %s",
    (tick) => {
      expect(() => createWorldClock(tick)).toThrow(RangeError);
    },
  );
});

describe("advanceClock", () => {
  it("advances one tick by default and returns the new tick", () => {
    const clock = createWorldClock(10);

    expect(advanceClock(clock)).toBe(11);
    expect(clock.tick).toBe(11);
  });

  it("advances several ticks, crossing day boundaries", () => {
    const clock = createWorldClock(TICKS_PER_DAY - 1);

    advanceClock(clock, TICKS_PER_DAY + 2);

    expect(clock.tick).toBe(2 * TICKS_PER_DAY + 1);
    expect(getClockTime(clock.tick).day).toBe(2);
  });

  it("allows advancing zero ticks", () => {
    const clock = createWorldClock(5);

    advanceClock(clock, 0);

    expect(clock.tick).toBe(5);
  });

  it.each([-1, 0.5, Number.NaN])("rejects the invalid step %s without changing the clock", (ticks) => {
    const clock = createWorldClock(5);

    expect(() => advanceClock(clock, ticks)).toThrow(RangeError);
    expect(clock.tick).toBe(5);
  });

  it("rejects a step that would overflow the safe integer range", () => {
    const clock = createWorldClock(Number.MAX_SAFE_INTEGER);

    expect(() => advanceClock(clock, 1)).toThrow(RangeError);
    expect(clock.tick).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("getTimeOfDay", () => {
  it.each([
    [0, 0],
    [TICKS_PER_DAY / 4, 0.25],
    [TICKS_PER_DAY / 2, 0.5],
    [(3 * TICKS_PER_DAY) / 4, 0.75],
  ])("maps tick %s to %s of the day", (tick, fraction) => {
    expect(getTimeOfDay(tick)).toBe(fraction);
  });

  it("repeats every day", () => {
    expect(getTimeOfDay(5 * TICKS_PER_DAY + 6000)).toBe(getTimeOfDay(6000));
    expect(getTimeOfDay(TICKS_PER_DAY)).toBe(0);
  });

  it("stays in [0, 1) for ticks before the start (e.g. a time offset)", () => {
    expect(getTimeOfDay(-TICKS_PER_DAY / 4)).toBe(0.75);
    expect(getTimeOfDay(-TICKS_PER_DAY)).toBe(0);
  });
});

describe("getClockTime", () => {
  it.each([
    [0, { day: 0, hour: 0, minute: 0 }],
    [TICKS_PER_DAY / 2, { day: 0, hour: 12, minute: 0 }],
    [TICKS_PER_DAY - 1, { day: 0, hour: 23, minute: 59 }],
    [3 * TICKS_PER_DAY + TICKS_PER_DAY / 24 * 18.5, { day: 3, hour: 18, minute: 30 }],
    [-TICKS_PER_DAY / 4, { day: -1, hour: 18, minute: 0 }],
  ])("reads tick %s as %o", (tick, time) => {
    expect(getClockTime(tick)).toEqual(time);
  });
});
