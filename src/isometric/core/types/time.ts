/**
 * Game time and sunlight. Time is an integer tick counter stored in the world; everything
 * else (time of day, sun position, ambient light) is derived from it with pure functions.
 */

/**
 * Mutable game clock held by the world. `tick` is a non-negative safe integer that only the
 * simulation advances (one tick per fixed simulation step), so time stays deterministic and
 * serializable.
 */
export type WorldClock = {
  tick: number;
};

/** Calendar-like reading of a tick: day number and wall-clock time inside that day. */
export type ClockTime = {
  /** Day number, starting at `0`. */
  readonly day: number;
  /** Hour of the day, `0`–`23`. */
  readonly hour: number;
  /** Minute of the hour, `0`–`59`. */
  readonly minute: number;
};

/** Linear RGB color with channels in `[0, 1]`, used as a light multiplier. */
export type Rgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

/** Vector in world grid axes: `x` and `y` follow the columns, `z` points up. */
export type Vector3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

/**
 * One key of a sky palette: the ambient light color when the sun is at `elevation` (sine of
 * its altitude, from `-1` straight below to `1` straight above). Colors between keys are
 * interpolated linearly.
 */
export type SkyKey = {
  readonly elevation: number;
  readonly color: Rgb;
};

/** Sunlight at a given tick, derived from the clock. */
export type SunState = {
  /** Fraction of the day in `[0, 1)`: `0` midnight, `0.25` sunrise, `0.5` noon, `0.75` sunset. */
  readonly timeOfDay: number;
  /**
   * Unit vector pointing from the ground toward the sun, in world grid axes (`+x` east, `-y`
   * south, `+z` up). Shadows fall along its opposite horizontal direction.
   */
  readonly direction: Vector3;
  /** Sine of the sun altitude (`direction.z`): negative while the sun is below the horizon. */
  readonly elevation: number;
  /** Amount of daylight in `[0, 1]`: `0` at night, `1` in full day, smooth through twilight. */
  readonly daylight: number;
  /** Ambient light color to multiply the world with. */
  readonly ambient: Rgb;
};
