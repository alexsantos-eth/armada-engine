import { describe, expect, it, vi } from "vitest";
import { TICKS_PER_DAY, TICKS_PER_HOUR, WORLD_START_TICK } from "../core/engine";
import { formatClockLabel, resolveLaunchOptions } from "./launch";

describe("resolveLaunchOptions", () => {
  it("reads the seed, the starting hour and the time scale from the URL query", () => {
    const random = vi.fn(() => 0.5);

    expect(resolveLaunchOptions("?seed=1337&hour=15&timeScale=0", random)).toEqual({
      seed: 1337,
      startTick: 15 * TICKS_PER_HOUR,
      timeScale: 0,
    });
    expect(random).not.toHaveBeenCalled();
  });

  it("draws a fresh seed and keeps the defaults without a query", () => {
    expect(resolveLaunchOptions("", () => 0.25)).toEqual({
      seed: 1073741824,
      startTick: WORLD_START_TICK,
      timeScale: 1,
    });
  });
});

describe("formatClockLabel", () => {
  it("shows the day counted from one and the time of day", () => {
    expect(formatClockLabel(TICKS_PER_DAY + 15 * TICKS_PER_HOUR, 1)).toBe("Día 2 · 15:00");
  });

  it("adds the game speed when time does not run in real time", () => {
    expect(formatClockLabel(WORLD_START_TICK, 60)).toBe("Día 1 · 08:00 · ×60");
    expect(formatClockLabel(WORLD_START_TICK, 0)).toBe("Día 1 · 08:00 · ×0");
  });
});
