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

/** East in world grid axes: screen right (north is screen up, `+x +y`). */
const EAST = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
/** South in world grid axes: toward the camera (screen down). */
const SOUTH = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

/**
 * Sunlight at a tick. North is screen up, so the camera looks north. The sun follows a tilted
 * circle: it rises in the east (screen right, `+x −y`) at 06:00, peaks in the south (the
 * camera side, `−x −y`) at {@link SUN_MAX_ALTITUDE} at noon and sets in the west (screen left,
 * `−x +y`) at 18:00. It never lights the scene from behind, so shadows fall sideways at dawn
 * and dusk and away from the viewer at noon.
 *
 * Pure and deterministic: the same tick always gives the same state.
 *
 * @param palette Ambient colors by sun elevation; defaults to {@link DEFAULT_SKY_PALETTE}.
 */
export function getSunState(tick: number, palette: readonly SkyKey[] = DEFAULT_SKY_PALETTE): SunState {
  const timeOfDay = getTimeOfDay(tick);
  const angle = 2 * Math.PI * (timeOfDay - 0.25);
  const elevation = Math.sin(angle) * Math.sin(SUN_MAX_ALTITUDE);
  const east = Math.cos(angle);
  const south = Math.sin(angle) * Math.cos(SUN_MAX_ALTITUDE);

  return {
    timeOfDay,
    direction: {
      x: east * EAST.x + south * SOUTH.x,
      y: east * EAST.y + south * SOUTH.y,
      z: elevation,
    },
    elevation,
    daylight: smoothstep(NIGHT_ELEVATION, DAY_ELEVATION, elevation),
    ambient: sampleSkyPalette(palette, elevation),
  };
}
