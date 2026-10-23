import type { OcclusionTerrain } from "../../types";

/** Darkness at the foot of a wall one block (or more) tall. */
export const AO_WALL_ALPHA = 0.12;

/** Reach (tiles) of a wall's occlusion from its base. */
export const AO_WALL_RADIUS = 0.5;

/**
 * Resolution of the occlusion maps: texels per tile along each axis. Occlusion is soft, so a
 * coarser map than the shadow maps is enough; linear filtering interpolates it.
 */
export const AO_PIXELS_PER_TILE = 8;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** `1` at distance `0`, easing out to `0` at `radius`. */
const fade = (distance: number, radius: number) => 1 - smoothstep(0, radius, distance);

/** Distance from `(px, py)` to the unit tile centred on `(cx, cy)`; `0` inside. */
function distanceToTile(px: number, py: number, cx: number, cy: number): number {
  const dx = Math.max(cx - 0.5 - px, 0, px - (cx + 0.5));
  const dy = Math.max(cy - 0.5 - py, 0, py - (cy + 0.5));
  return Math.hypot(dx, dy);
}

/**
 * Height steps of the eight neighbours of column `(x, y)` over its top, row by row (`dy`, then
 * `dx`, from `−1` to `1`; the column itself in the middle): each step capped at one block, `0`
 * where the neighbour is not taller or off the terrain. `undefined` when none is taller or the
 * column is off the terrain: nothing occludes it. Read once per column, not once per texel.
 */
function tallerNeighbours(terrain: OcclusionTerrain, x: number, y: number): number[] | undefined {
  const own = terrain.topHeightAt(x, y);
  if (own === undefined) return undefined;

  const steps: number[] = [];
  let taller = false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const height = terrain.topHeightAt(x + dx, y + dy);
      const step = height === undefined || height <= own ? 0 : Math.min(1, height - own);
      steps.push(step);
      taller ||= step > 0;
    }
  }
  return taller ? steps : undefined;
}

/** Occlusion at `(u, v)` of a column whose neighbours stand `steps` over it (see {@link tallerNeighbours}). */
function occlusionAt(steps: readonly number[], u: number, v: number): number {
  const px = u - 0.5;
  const py = v - 0.5;
  let light = 1;
  let index = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const step = steps[index];
      index += 1;
      if (step === 0) continue;
      light *= 1 - AO_WALL_ALPHA * step * fade(distanceToTile(px, py, dx, dy), AO_WALL_RADIUS);
    }
  }
  return 1 - light;
}

/**
 * Ambient occlusion at a point of a column's top: how much of the sky it misses. `(u, v)` runs
 * across the tile from its `−x`/`−y` edge (`0`) to its `+x`/`+y` edge (`1`), the layout of the
 * shadow maps.
 *
 * Every taller neighbour darkens the ground at its foot by its height step (fully from one
 * block; a sand top, half a block lower, counts half) with {@link AO_WALL_ALPHA}, fading out
 * within {@link AO_WALL_RADIUS}: bands along steps and darker inner corners. Only terrain
 * occludes: entities leave no contact shadow (their sun shadows are drawn separately). Cliff
 * tops are never darkened. Contributions stack like shadows, `1 − Π(1 − oᵢ)`, so it never
 * reaches black. Pure and deterministic.
 */
export function getOcclusion(terrain: OcclusionTerrain, x: number, y: number, u: number, v: number): number {
  const steps = tallerNeighbours(terrain, x, y);
  return steps === undefined ? 0 : occlusionAt(steps, u, v);
}

/**
 * Occlusion map of one level: RGBA texels, black with the occlusion in alpha, sampled at each
 * texel's centre. Laid out like the shadow maps (a square of `pixelsPerTile` texels per column
 * of `terrain.bounds`, texel `(0, 0)` at the corner of its minimum column); only the columns
 * whose top belongs to `level` and that have a taller neighbour are written, the rest stay
 * transparent. The neighbours of each column are read once, not once per texel.
 */
export function buildOcclusionMap(
  terrain: OcclusionTerrain,
  level: number,
  pixelsPerTile = AO_PIXELS_PER_TILE,
): Uint8ClampedArray {
  const { minX, minY, maxX, maxY } = terrain.bounds;
  const width = (maxX - minX + 1) * pixelsPerTile;
  const height = (maxY - minY + 1) * pixelsPerTile;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (terrain.levelAt(x, y) !== level) continue;
      const steps = tallerNeighbours(terrain, x, y);
      if (steps === undefined) continue;
      for (let j = 0; j < pixelsPerTile; j += 1) {
        for (let i = 0; i < pixelsPerTile; i += 1) {
          const occlusion = occlusionAt(steps, (i + 0.5) / pixelsPerTile, (j + 0.5) / pixelsPerTile);
          const texel = ((y - minY) * pixelsPerTile + j) * width + (x - minX) * pixelsPerTile + i;
          pixels[texel * 4 + 3] = Math.round(occlusion * 255);
        }
      }
    }
  }
  return pixels;
}
