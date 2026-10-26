import type { TerrainBands } from "../../types";

/** Tiles after which the bands repeat: a block's bands are those of its column's parity along `x`. */
export const BAND_REPEAT_TILES = 2;

/**
 * Light of the bands at `position` tiles across the pattern, in `[0, 1]`: `count` bands every
 * {@link BAND_REPEAT_TILES} tiles, each a smooth bump `width` of the space between two bands wide,
 * dark between them. Repeats every {@link BAND_REPEAT_TILES} tiles.
 */
export function getBandLight(bands: Pick<TerrainBands, "count" | "width">, position: number): number {
  const spacing = BAND_REPEAT_TILES / bands.count;
  const within = (((position / spacing) % 1) + 1) % 1;
  const distance = Math.abs(within - 0.5) / (bands.width / 2);
  return distance >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * distance);
}

/** Whether a block at `elevation` shows the deep bands: below `bands.deepBelow`. */
export function isDeepSurface(bands: Pick<TerrainBands, "deepBelow">, elevation: number): boolean {
  return elevation < bands.deepBelow;
}

/**
 * How far the bands have drifted at `timeMs` (real time), in tiles, in `[0, BAND_REPEAT_TILES)`:
 * {@link BAND_REPEAT_TILES} tiles every `bands.period`, or `bands.deep` times as fast on deep blocks.
 * Pure: the same time gives the same drift.
 */
export function getBandDrift(bands: Pick<TerrainBands, "period" | "deep">, timeMs: number, deep: boolean): number {
  const speed = deep ? bands.deep : 1;
  return (((timeMs * speed) / bands.period) % 1) * BAND_REPEAT_TILES;
}

/** The problems of `bands` (game content), one message each; none when they can be drawn. */
export function validateTerrainBands(bands: TerrainBands): string[] {
  const issues: string[] = [];
  const { count, width, alpha, period, deepBelow, deep } = bands;
  if (!(Number.isInteger(count) && count > 0))
    issues.push(`bands.count must be a positive integer (got ${String(count)})`);
  if (!(width > 0 && width <= 1)) issues.push(`bands.width must be in (0, 1] (got ${String(width)})`);
  if (!(alpha > 0 && alpha <= 1)) issues.push(`bands.alpha must be in (0, 1] (got ${String(alpha)})`);
  if (!(period > 0 && Number.isFinite(period)))
    issues.push(`bands.period must be a positive number (got ${String(period)})`);
  if (!Number.isInteger(deepBelow))
    issues.push(`bands.deepBelow must be an integer elevation (got ${String(deepBelow)})`);
  if (!(deep >= 0 && deep <= 1)) issues.push(`bands.deep must be in [0, 1] (got ${String(deep)})`);
  return issues;
}
