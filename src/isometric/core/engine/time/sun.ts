import type { Rgb, SkyKey, SunState } from "../../types";
import { getTimeOfDay } from "./clock";

/** Highest altitude the sun reaches, at noon, in radians (60°). */
export const SUN_MAX_ALTITUDE = Math.PI / 3;

/** Sun elevation (sine of altitude) below which there is no daylight at all. */
export const NIGHT_ELEVATION = -0.1;

/** Sun elevation (sine of altitude) from which daylight is full. */
export const DAY_ELEVATION = 0.15;

const NIGHT: Rgb = { r: 0.3, g: 0.36, b: 0.6 };
const DAY: Rgb = { r: 1, g: 1, b: 1 };

/**
 * Default ambient light by sun elevation: a cool, dim night, a warm orange horizon at sunrise
 * and sunset, golden low sun and plain white daylight (no tint) from mid-morning to
 * mid-afternoon. Games can pass their own palette to {@link getSunState}.
 */
export const DEFAULT_SKY_PALETTE: readonly SkyKey[] = [
  { elevation: -1, color: NIGHT },
  { elevation: -0.15, color: NIGHT },
  { elevation: 0, color: { r: 1, g: 0.62, b: 0.45 } },
  { elevation: 0.2, color: { r: 1, g: 0.88, b: 0.75 } },
  { elevation: 0.45, color: DAY },
  { elevation: 1, color: DAY },
];

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Ambient color of a sky palette at a sun elevation: linear interpolation between the two
 * surrounding keys, clamped to the first and last key outside their range.
 *
 * @throws `RangeError` when the palette is empty or its elevations are not strictly
 * ascending.
 */
export function sampleSkyPalette(palette: readonly SkyKey[], elevation: number): Rgb {
  if (palette.length === 0) {
    throw new RangeError("Sky palette needs at least one key");
  }
  palette.slice(1).forEach((key, index) => {
    if (key.elevation <= palette[index].elevation) {
      throw new RangeError("Sky palette keys must have strictly ascending elevations");
    }
  });

  const next = palette.findIndex((key) => key.elevation >= elevation);
  if (next === 0) return palette[0].color;
  if (next === -1) return palette[palette.length - 1].color;

  const from = palette[next - 1];
  const to = palette[next];
  const amount = (elevation - from.elevation) / (to.elevation - from.elevation);

  return {
    r: lerp(from.color.r, to.color.r, amount),
    g: lerp(from.color.g, to.color.g, amount),
    b: lerp(from.color.b, to.color.b, amount),
  };
}

/** Sun azimuth at sunrise, in radians from `+x` toward `+y`: `−y`, the lower right of the screen. */
const SUNRISE_AZIMUTH = -Math.PI / 2;
/** Azimuth swept from sunrise to sunset: a quarter turn, to `−x`, the lower left of the screen. */
const AZIMUTH_SWEEP = -Math.PI / 2;

/**
 * Sunlight at a tick. The sun rises at 06:00, peaks at {@link SUN_MAX_ALTITUDE} at noon and
 * sets at 18:00. Its azimuth turns steadily from `−y` (the lower right of the screen) through
 * `−x −y` (the camera side) to `−x` (the lower left): a stylised quarter turn instead of the
 * real half turn, so the sun always stays in front of the scene. Shadows then only fall on
 * the caster's own tile and the tiles behind it, which are drawn before the caster; the tiles
 * in front (smaller `x` or `y`) are drawn later and would cut any shadow reaching them.
 *
 * Pure and deterministic: the same tick always gives the same state.
 *
 * @param palette Ambient colors by sun elevation; defaults to {@link DEFAULT_SKY_PALETTE}.
 */
export function getSunState(tick: number, palette: readonly SkyKey[] = DEFAULT_SKY_PALETTE): SunState {
  const timeOfDay = getTimeOfDay(tick);
  const angle = 2 * Math.PI * (timeOfDay - 0.25);
  const elevation = Math.sin(angle) * Math.sin(SUN_MAX_ALTITUDE);
  const horizontal = Math.sqrt(1 - elevation * elevation);
  const azimuth = SUNRISE_AZIMUTH + AZIMUTH_SWEEP * (angle / Math.PI);

  return {
    timeOfDay,
    direction: {
      x: Math.cos(azimuth) * horizontal,
      y: Math.sin(azimuth) * horizontal,
      z: elevation,
    },
    elevation,
    daylight: smoothstep(NIGHT_ELEVATION, DAY_ELEVATION, elevation),
    ambient: sampleSkyPalette(palette, elevation),
  };
}
