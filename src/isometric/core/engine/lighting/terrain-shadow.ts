import type { OcclusionTerrain, ShadowProjection, TileMetrics } from "../../types";
import { BLOCK_HEIGHT_IN_TILES } from "./shadow";

/** A receiver point in world coordinates, with height in blocks. */
export type ShadowPoint = { readonly x: number; readonly y: number; readonly elevation: number };
/** Shared terrain visibility test: 1 means occluded, 0 means sunlit. */
export type TerrainShadowSampler = (point: ShadowPoint, light: ShadowProjection) => number;
/** Light rays extend beyond the chunk to include its loaded neighbours. */
export const TERRAIN_RAY_REACH = 12;
const RAY_STEP = 0.25;
const SURFACE_BIAS = 0.04;

/** Caches column heights once, then samples any horizontal or vertical receiver with the same light ray. */
export function createTerrainShadowSampler(terrain: OcclusionTerrain): TerrainShadowSampler {
  const minX = terrain.bounds.minX - TERRAIN_RAY_REACH - 1;
  const minY = terrain.bounds.minY - TERRAIN_RAY_REACH - 1;
  const width = terrain.bounds.maxX - minX + TERRAIN_RAY_REACH + 2;
  const height = terrain.bounds.maxY - minY + TERRAIN_RAY_REACH + 2;
  const heights = new Float32Array(width * height);
  heights.fill(-Infinity);
  let maximum = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = terrain.topHeightAt(minX + x, minY + y) ?? -Infinity;
      heights[y * width + x] = value;
      maximum = Math.max(maximum, value);
    }
  }
  return (point, light) => {
    if (light.stretch <= 0) return 0;
    const reach = Math.min(
      TERRAIN_RAY_REACH,
      (maximum - point.elevation - SURFACE_BIAS) * light.stretch * BLOCK_HEIGHT_IN_TILES,
    );
    for (let distance = RAY_STEP; distance <= reach; distance += RAY_STEP) {
      const x = Math.round(point.x - light.dirX * distance) - minX;
      const y = Math.round(point.y - light.dirY * distance) - minY;
      if (x < 0 || x >= width || y < 0 || y >= height) return 0;
      const rayHeight = point.elevation + distance / (light.stretch * BLOCK_HEIGHT_IN_TILES);
      if (heights[y * width + x] > rayHeight + SURFACE_BIAS) return 1;
    }
    return 0;
  };
}

/** Upright receiver billboard, with the same height scale and across-light axis as getSilhouetteMatrix. */
export function getReceiverPoint(
  foot: ShadowPoint,
  screenFoot: { readonly x: number; readonly y: number },
  screenX: number,
  screenY: number,
  light: ShadowProjection,
  metrics: TileMetrics,
  out = { x: 0, y: 0, elevation: 0 },
): ShadowPoint {
  const across = ((screenX - screenFoot.x) * Math.SQRT2) / metrics.tileWidth;
  out.x = foot.x + light.dirY * across;
  out.y = foot.y - light.dirX * across;
  out.elevation = foot.elevation + Math.max(0, screenFoot.y - screenY) / metrics.boxHeight;
  return out;
}
