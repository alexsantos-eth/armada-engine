import type { OcclusionTerrain, ShadowProjection } from "../../types";
import { SHADOW_ALPHA } from "./shadow";
import { createTerrainShadowSampler, TERRAIN_RAY_REACH } from "./terrain-shadow";

/** Darkness at the foot of a wall one block (or more) tall. */
export const AO_WALL_ALPHA = 0.12;

/** Reach (tiles) of a wall's occlusion from its base. */
export const AO_WALL_RADIUS = 0.5;

/**
 * Resolution of the occlusion maps: texels per tile along each axis. Occlusion is soft, so a
 * coarser map than the shadow maps is enough; linear filtering interpolates it.
 */
export const AO_PIXELS_PER_TILE = 8;

/** Strong, compact contact darkening around a static entity's ground footprint. */
export const AO_ENTITY_ALPHA = 0.45;
/** Contact shadow radius in tiles, centered in each occupied footprint tile. */
export const AO_ENTITY_RADIUS = 0.3;

/** Maximum world distance sampled toward the sun for a terrain shadow. */
export const AO_TERRAIN_SHADOW_REACH = TERRAIN_RAY_REACH;
/** Distance between terrain height samples along a light ray, in tiles. */
export const AO_TERRAIN_SHADOW_STEP = 0.5;
/** Darkness of a terrain shadow in full sun. */
export const AO_TERRAIN_SHADOW_ALPHA = 0.34;

/** A world tile in a static entity's ground footprint. */
export type OcclusionContact = { readonly x: number; readonly y: number };

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
 * occludes through this rule; static entity contact is baked separately by `buildOcclusionMap`.
 * Cliff tops are never darkened. Contributions stack like shadows, `1 − Π(1 − oᵢ)`, so it
 * never reaches black. Pure and deterministic.
 */
export function getOcclusion(terrain: OcclusionTerrain, x: number, y: number, u: number, v: number): number {
  const steps = tallerNeighbours(terrain, x, y);
  return steps === undefined ? 0 : occlusionAt(steps, u, v);
}

/**
 * Occlusion map of a chunk's shadow map: RGBA texels, black with the occlusion in alpha, sampled
 * at each texel's centre. Laid out like the shadow maps (a square of `pixelsPerTile` texels per
 * column of `terrain.bounds`, texel `(0, 0)` at the corner of its minimum column); every column
 * gets its own top's occlusion, whatever its level, and those without a taller neighbour stay
 * transparent. The neighbours of each column are read once, not once per texel. Each optional
 * contact adds a compact radial shadow around its footprint tile, composited with terrain AO.
 */
export function buildOcclusionMap(
  terrain: OcclusionTerrain,
  pixelsPerTile = AO_PIXELS_PER_TILE,
  contacts: readonly OcclusionContact[] = [],
  projection: ShadowProjection | null = null,
  terrainShadowOutput?: Uint8Array,
): Uint8ClampedArray {
  const { minX, minY, maxX, maxY } = terrain.bounds;
  const width = (maxX - minX + 1) * pixelsPerTile;
  const height = (maxY - minY + 1) * pixelsPerTile;
  const pixels = new Uint8ClampedArray(width * height * 4);
  terrainShadowOutput?.fill(0);
  const terrainShadowAlpha = projection ? new Uint8Array(width * height) : undefined;
  // Cache the small ray search area in a contiguous array: per-texel ray marches must not
  // repeatedly cross the terrain's world/chunk lookup boundary.
  const reach = projection ? AO_TERRAIN_SHADOW_REACH : 0;
  const heightsMinX = minX - reach - 1;
  const heightsMinY = minY - reach - 1;
  const heightsWidth = maxX - minX + 2 * (reach + 1) + 1;
  const heights = new Float32Array(heightsWidth * (maxY - minY + 2 * (reach + 1) + 1));
  heights.fill(Number.NaN);
  for (let y = heightsMinY; y < heightsMinY + heights.length / heightsWidth; y += 1) {
    for (let x = heightsMinX; x < heightsMinX + heightsWidth; x += 1) {
      const value = terrain.topHeightAt(x, y);
      if (value !== undefined) heights[(y - heightsMinY) * heightsWidth + x - heightsMinX] = value;
    }
  }
  const cachedHeightAt = (x: number, y: number): number | undefined => {
    const localX = x - heightsMinX;
    const localY = y - heightsMinY;
    const value = heights[localY * heightsWidth + localX];
    return Number.isNaN(value) ? undefined : value;
  };

  const sample = projection && createTerrainShadowSampler({ bounds: terrain.bounds, topHeightAt: cachedHeightAt });
  const point = { x: 0, y: 0, elevation: 0 };
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const steps = tallerNeighbours(terrain, x, y);
      const ownHeight = cachedHeightAt(x, y);
      for (let j = 0; j < pixelsPerTile; j += 2) {
        for (let i = 0; i < pixelsPerTile; i += 2) {
          const u = (i + 1) / pixelsPerTile;
          const v = (j + 1) / pixelsPerTile;
          let strength = 0;
          if (projection && sample && ownHeight !== undefined) {
            point.x = x + u - 0.5;
            point.y = y + v - 0.5;
            point.elevation = ownHeight;
            strength = (sample(point, projection) * AO_TERRAIN_SHADOW_ALPHA * projection.alpha) / SHADOW_ALPHA;
          }
          for (let dy = 0; dy < 2 && j + dy < pixelsPerTile; dy += 1) {
            for (let dx = 0; dx < 2 && i + dx < pixelsPerTile; dx += 1) {
              const sampleU = (i + dx + 0.5) / pixelsPerTile;
              const sampleV = (j + dy + 0.5) / pixelsPerTile;
              const occlusion = steps === undefined ? 0 : occlusionAt(steps, sampleU, sampleV);
              const texel = ((y - minY) * pixelsPerTile + j + dy) * width + (x - minX) * pixelsPerTile + i + dx;
              pixels[texel * 4 + 3] = Math.round(occlusion * 255);
              if (terrainShadowAlpha) terrainShadowAlpha[texel] = Math.round(strength * 255);
            }
          }
        }
      }
    }
  }

  // Feather only the directional mask. A 3×3 binomial blur removes isolated coarse ray hits
  // while preserving the crisp wall/contact AO already written to the output map.
  if (terrainShadowAlpha) {
    const weights = [1, 2, 1];
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const receiverHeight = cachedHeightAt(
          minX + Math.floor(px / pixelsPerTile),
          minY + Math.floor(py / pixelsPerTile),
        );
        let weighted = 0;
        let total = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const sy = py + dy;
          if (sy < 0 || sy >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const sx = px + dx;
            if (sx < 0 || sx >= width) continue;
            if (
              cachedHeightAt(minX + Math.floor(sx / pixelsPerTile), minY + Math.floor(sy / pixelsPerTile)) !==
              receiverHeight
            )
              continue;
            const weight = weights[dx + 1] * weights[dy + 1];
            weighted += terrainShadowAlpha[sy * width + sx] * weight;
            total += weight;
          }
        }
        if (weighted === 0) continue;
        const index = (py * width + px) * 4 + 3;
        const shadow = weighted / total / 255;
        if (terrainShadowOutput) terrainShadowOutput[py * width + px] = Math.round(shadow * 255);
        const existing = pixels[index] / 255;
        pixels[index] = Math.round((1 - (1 - existing) * (1 - shadow)) * 255);
      }
    }
  }

  // Bake static entity contact into the same low-resolution map. Visit only the small texel
  // bounds around each footprint cell; this work happens once when a chunk is shown.
  const radiusInPixels = AO_ENTITY_RADIUS * pixelsPerTile;
  const radiusSquared = radiusInPixels * radiusInPixels;
  for (const { x, y } of contacts) {
    const centerX = (x + 0.5 - minX) * pixelsPerTile;
    const centerY = (y + 0.5 - minY) * pixelsPerTile;
    const left = Math.max(0, Math.floor(centerX - radiusInPixels));
    const right = Math.min(width - 1, Math.ceil(centerX + radiusInPixels));
    const top = Math.max(0, Math.floor(centerY - radiusInPixels));
    const bottom = Math.min(height - 1, Math.ceil(centerY + radiusInPixels));
    for (let py = top; py <= bottom; py += 1) {
      for (let px = left; px <= right; px += 1) {
        const dx = px + 0.5 - centerX;
        const dy = py + 0.5 - centerY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= radiusSquared) continue;
        const amount = AO_ENTITY_ALPHA * fade(Math.sqrt(distanceSquared) / pixelsPerTile, AO_ENTITY_RADIUS);
        const alphaIndex = (py * width + px) * 4 + 3;
        const existing = pixels[alphaIndex] / 255;
        pixels[alphaIndex] = Math.round((1 - (1 - existing) * (1 - amount)) * 255);
      }
    }
  }
  return pixels;
}
