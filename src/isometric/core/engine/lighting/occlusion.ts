import type { OcclusionTerrain } from "../../types";

/** Darkness at the foot of a wall one block (or more) tall. */
export const AO_WALL_ALPHA = 0.13;

/** Reach (tiles) of a wall's occlusion from its base. */
export const AO_WALL_RADIUS = 0.5;

/** Darkness of the contact shadow under an entity. */
export const AO_CONTACT_ALPHA = 0.4;

/** Inset (tiles) from the tile's edge of the core of an entity's contact shadow. */
export const AO_CONTACT_INSET = 0.2;

/** Reach (tiles) of an entity's contact shadow beyond its core. */
export const AO_CONTACT_RADIUS = 0.35;

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

/** Distance from `(px, py)` to the square `[min, max]²` offset by `(cx, cy)`; `0` inside. */
function distanceToSquare(px: number, py: number, cx: number, cy: number, min: number, max: number): number {
  const dx = Math.max(cx + min - px, 0, px - (cx + max));
  const dy = Math.max(cy + min - py, 0, py - (cy + max));
  return Math.hypot(dx, dy);
}

/**
 * Ambient occlusion at a point of a column's top: how much of the sky it misses. `(u, v)` runs
 * across the tile from its `−x`/`−y` edge (`0`) to its `+x`/`+y` edge (`1`), the layout of the
 * shadow maps.
 *
 * Every taller neighbour darkens the ground at its foot by its height step (fully from one
 * block; a sand top, half a block lower, counts half) with {@link AO_WALL_ALPHA}, fading out
 * within {@link AO_WALL_RADIUS}: bands along steps and darker inner corners. Every entity on the
 * same ground (the column itself or a neighbour at the same height) adds a contact shadow of
 * {@link AO_CONTACT_ALPHA} over a core {@link AO_CONTACT_INSET} inside its tile, fading out
 * within {@link AO_CONTACT_RADIUS}. Cliff tops are never darkened. Contributions stack like
 * shadows, `1 − Π(1 − oᵢ)`, so it never reaches black. Pure and deterministic.
 */
export function getOcclusion(terrain: OcclusionTerrain, x: number, y: number, u: number, v: number): number {
  const own = terrain.topHeightAt(x, y);
  if (own === undefined) return 0;

  const px = u - 0.5;
  const py = v - 0.5;
  let light = 1;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const height = terrain.topHeightAt(x + dx, y + dy);
      if (height === undefined) continue;

      if (height > own) {
        const distance = distanceToSquare(px, py, dx, dy, -0.5, 0.5);
        light *= 1 - AO_WALL_ALPHA * Math.min(1, height - own) * fade(distance, AO_WALL_RADIUS);
      } else if (height === own && terrain.occupiedAt(x + dx, y + dy)) {
        const distance = distanceToSquare(px, py, dx, dy, -0.5 + AO_CONTACT_INSET, 0.5 - AO_CONTACT_INSET);
        light *= 1 - AO_CONTACT_ALPHA * fade(distance, AO_CONTACT_RADIUS);
      }
    }
  }
  return 1 - light;
}

/**
 * Occlusion map of one level: RGBA texels, black with the occlusion in alpha, sampled at each
 * texel's centre. Laid out like the shadow maps (a square of `pixelsPerTile` texels per column
 * of `terrain.bounds`, texel `(0, 0)` at the corner of its minimum column); only the columns
 * whose top belongs to `level` are written, the rest stay transparent.
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
      for (let j = 0; j < pixelsPerTile; j += 1) {
        for (let i = 0; i < pixelsPerTile; i += 1) {
          const occlusion = getOcclusion(terrain, x, y, (i + 0.5) / pixelsPerTile, (j + 0.5) / pixelsPerTile);
          const texel = ((y - minY) * pixelsPerTile + j) * width + (x - minX) * pixelsPerTile + i;
          pixels[texel * 4 + 3] = Math.round(occlusion * 255);
        }
      }
    }
  }
  return pixels;
}
