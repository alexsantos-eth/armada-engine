import { describe, expect, it, vi } from "vitest";
import { TICKS_PER_DAY, TICKS_PER_HOUR, WORLD_START_TICK } from "../core/engine";
import { formatClockLabel, resolveDisabledModules, resolveLaunchOptions, resolveSwitch } from "./launch";

describe("resolveLaunchOptions", () => {
  it("reads the seed, the starting hour and the time scale from the URL query", () => {
    const random = vi.fn(() => 0.5);

    expect(resolveLaunchOptions("?seed=1337&hour=15&timeScale=0&modules=-shadows&perf&cull=off", random)).toEqual({
      seed: 1337,
      startTick: 15 * TICKS_PER_HOUR,
      timeScale: 0,
      disabledModules: new Set(["shadows"]),
      perf: true,
      cull: false,
    });
    expect(random).not.toHaveBeenCalled();
  });

  it("draws a fresh seed and keeps the defaults without a query", () => {
    expect(resolveLaunchOptions("", () => 0.25)).toEqual({
      seed: 1073741824,
      startTick: WORLD_START_TICK,
      timeScale: 1,
      disabledModules: new Set(),
      perf: false,
      cull: true,
    });
  });
});

describe("resolveSwitch", () => {
  it("is on when the parameter is there, unless it says off", () => {
    expect(resolveSwitch("?perf", "perf", false)).toBe(true);
    expect(resolveSwitch("?perf=1", "perf", false)).toBe(true);
    expect(resolveSwitch("?perf=on", "perf", false)).toBe(true);
    ["0", "off", "false", "OFF"].forEach((value) => expect(resolveSwitch(`?cull=${value}`, "cull", true)).toBe(false));
  });

  it("keeps its default without the parameter", () => {
    expect(resolveSwitch("?seed=4", "perf", false)).toBe(false);
    expect(resolveSwitch("", "cull", true)).toBe(true);
  });
});

describe("resolveDisabledModules", () => {
  it("leaves out the modules listed with a leading minus", () => {
    expect(resolveDisabledModules("?modules=-shadows, -ambient-light")).toEqual(new Set(["shadows", "ambient-light"]));
  });

  it("ignores entries without a minus, a lone minus and an empty list", () => {
    expect(resolveDisabledModules("?modules=shadows,-,")).toEqual(new Set());
    expect(resolveDisabledModules("?modules=")).toEqual(new Set());
    expect(resolveDisabledModules("?seed=4")).toEqual(new Set());
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
