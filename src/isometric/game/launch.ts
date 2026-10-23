import {
  formatClockTime,
  getClockTime,
  resolveStartTick,
  resolveTimeScale,
  resolveWorldSeed,
  type RandomSource,
} from "../core/engine";

/**
 * How a game starts, read from the page's URL. Each option is read by the module that owns it
 * (`resolveWorldSeed()`, `resolveStartTick()`, `resolveTimeScale()`); a new option adds its reader
 * here.
 */
export type LaunchOptions = {
  /** World seed: `?seed=` or a fresh one (logged, so the world can be reproduced). */
  readonly seed: number;
  /** World tick the clock starts at: `?hour=17.5` starts at 17:30 (debugging light). */
  readonly startTick: number;
  /** Game speed: `?timeScale=60` runs a game day in 20 real seconds, `0` freezes it. */
  readonly timeScale: number;
  /** Modules and systems left out, by id: `?modules=-shadows,-ambient-light` (debugging a module alone). */
  readonly disabledModules: ReadonlySet<string>;
};

/**
 * Reads the launch options from a URL query (`location.search`). `random` only draws a new
 * seed when the query has none; the app passes `Math.random`, the one non-seeded source.
 */
export function resolveLaunchOptions(search: string, random: RandomSource): LaunchOptions {
  return {
    seed: resolveWorldSeed(search, random),
    startTick: resolveStartTick(search),
    timeScale: resolveTimeScale(search),
    disabledModules: resolveDisabledModules(search),
  };
}

/**
 * Ids of the modules `?modules=` leaves out: each one listed with a leading `-`, separated by
 * commas (`?modules=-shadows,-player`). Entries without `-` are ignored: every module runs by
 * default.
 */
export function resolveDisabledModules(search: string): ReadonlySet<string> {
  const entries = (new URLSearchParams(search).get("modules") ?? "").split(",").map((entry) => entry.trim());
  return new Set(entries.filter((entry) => entry.startsWith("-") && entry.length > 1).map((entry) => entry.slice(1)));
}

/** The clock shown over the game: `Día N · HH:MM`, plus `· ×S` when time runs at speed `S ≠ 1`. */
export function formatClockLabel(tick: number, timeScale: number): string {
  const time = getClockTime(tick);
  const speed = timeScale === 1 ? "" : ` · ×${timeScale}`;
  return `Día ${time.day + 1} · ${formatClockTime(time)}${speed}`;
}
