import {
  formatClockTime,
  getClockTime,
  resolveStartTick,
  resolveTimeScale,
  resolveWorldSeed,
  type RandomSource,
} from "../core/engine";

/** How a game starts, read from the page's URL. */
export type LaunchOptions = {
  /** World seed: `?seed=` or a fresh one (logged, so the world can be reproduced). */
  readonly seed: number;
  /** World tick the clock starts at: `?hour=17.5` starts at 17:30 (debugging light). */
  readonly startTick: number;
  /** Game speed: `?timeScale=60` runs a game day in 20 real seconds, `0` freezes it. */
  readonly timeScale: number;
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
  };
}

/** The clock shown over the game: `Día N · HH:MM`, plus `· ×S` when time runs at speed `S ≠ 1`. */
export function formatClockLabel(tick: number, timeScale: number): string {
  const time = getClockTime(tick);
  const speed = timeScale === 1 ? "" : ` · ×${timeScale}`;
  return `Día ${time.day + 1} · ${formatClockTime(time)}${speed}`;
}
