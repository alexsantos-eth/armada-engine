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
  /** Measures the frames and logs a report every few seconds: `?perf` (see `startPerfMonitor()`). */
  readonly perf: boolean;
  /** Whether the camera culls what is off screen; `?cull=off` draws everything (to measure culling). */
  readonly cull: boolean;
  /**
   * The player's squash and stretch and dust: `?effects=off` leaves them out. Off by default when
   * the player prefers reduced motion.
   */
  readonly effects: boolean;
  /** The player's sounds: `?sound=off` mutes them. */
  readonly sound: boolean;
  /** Whether the player starts wearing a jetpack (until it is an item to pick up): `?jetpack`. */
  readonly jetpack: boolean;
  /**
   * Whether the game draws with the mobile profile, which takes less memory (`MOBILE_PROFILE`): on
   * by default on phones and tablets, `?mobile` or `?mobile=off` forces it either way.
   */
  readonly mobile: boolean;
};

/**
 * Reads the launch options from a URL query (`location.search`). `random` only draws a new
 * seed when the query has none; the app passes `Math.random`, the one non-seeded source. With
 * `reducedMotion` (the player's `prefers-reduced-motion`), the effects are off unless the query
 * turns them on; with `mobileDevice` (`isMobileDevice()`), the mobile profile is on unless the
 * query turns it off.
 */
export function resolveLaunchOptions(
  search: string,
  random: RandomSource,
  reducedMotion = false,
  mobileDevice = false,
): LaunchOptions {
  return {
    seed: resolveWorldSeed(search, random),
    startTick: resolveStartTick(search),
    timeScale: resolveTimeScale(search),
    disabledModules: resolveDisabledModules(search),
    perf: resolveSwitch(search, "perf", false),
    cull: resolveSwitch(search, "cull", true),
    effects: resolveSwitch(search, "effects", !reducedMotion),
    sound: resolveSwitch(search, "sound", true),
    jetpack: resolveSwitch(search, "jetpack", false),
    mobile: resolveSwitch(search, "mobile", mobileDevice),
  };
}

/**
 * A switch of the URL query: on when `name` is there (`?perf`, `?perf=1`), off when it says so
 * (`0`, `off` or `false`, in any case), and `fallback` when it is not there.
 */
export function resolveSwitch(search: string, name: string, fallback: boolean): boolean {
  const value = new URLSearchParams(search).get(name);
  if (value === null) return fallback;
  return !["0", "off", "false"].includes(value.trim().toLowerCase());
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
