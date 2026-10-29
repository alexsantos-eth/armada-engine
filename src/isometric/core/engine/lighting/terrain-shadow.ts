import type { OcclusionTerrain, ShadowProjection, TileMetrics, WorldRect } from "../../types";
import { BLOCK_HEIGHT_IN_TILES } from "./shadow";

/** A receiver point in world coordinates, with height in blocks. */
export type ShadowPoint = { readonly x: number; readonly y: number; readonly elevation: number };
/** Shared terrain visibility test: 1 means occluded, 0 means sunlit. */
export type TerrainShadowHorizon = { elevation: number; width: number };
export type TerrainShadowSampler = ((point: ShadowPoint, light: ShadowProjection) => number) & {
  readonly horizon?: (x: number, y: number, light: ShadowProjection, out: TerrainShadowHorizon) => TerrainShadowHorizon;
};
/** Cached height field with a reusable skyline query for all heights at the same horizontal point. */
export type TerrainShadowField = TerrainShadowSampler & {
  readonly horizon: NonNullable<TerrainShadowSampler["horizon"]>;
};
/** Evaluates a shared shadow skyline at a receiver height. */
export function sampleTerrainHorizon(horizon: TerrainShadowHorizon, elevation: number): number {
  return Math.min(1, Math.max(0, (horizon.elevation - elevation - SURFACE_BIAS) / horizon.width));
}
/** Light rays extend beyond the chunk to include its loaded neighbours. */
export const TERRAIN_RAY_REACH = 12;
const SURFACE_BIAS = 0.04;

/** Caches column heights once, then samples any horizontal or vertical receiver with the same light ray. */
export function createTerrainShadowSampler(terrain: OcclusionTerrain): TerrainShadowField {
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
  const horizon: TerrainShadowField["horizon"] = (px, py, light, out) => {
    out.elevation = -Infinity;
    out.width = 0.1;
    if (light.stretch <= 0) return out;
    const rayX = -light.dirX;
    const rayY = -light.dirY;
    const stepX = Math.sign(rayX);
    const stepY = Math.sign(rayY);
    let x = Math.floor(px + 0.5) - minX;
    let y = Math.floor(py + 0.5) - minY;
    const deltaX = stepX === 0 ? Infinity : 1 / Math.abs(rayX);
    const deltaY = stepY === 0 ? Infinity : 1 / Math.abs(rayY);
    let nextX = stepX === 0 ? Infinity : (minX + x + stepX * 0.5 - px) / rayX;
    let nextY = stepY === 0 ? Infinity : (minY + y + stepY * 0.5 - py) / rayY;
    // Traverse exact column boundaries. Fixed-distance steps miss short corner intersections
    // and make a shadow jump whenever the first hit changes to the next ray sample.
    for (let distance = 0; distance <= TERRAIN_RAY_REACH;) {
      if (x < 0 || x >= width || y < 0 || y >= height) break;
      const elevation = heights[y * width + x] - distance / (light.stretch * BLOCK_HEIGHT_IN_TILES);
      if (elevation > out.elevation) {
        out.elevation = elevation;
        out.width = 0.1 + distance * 0.02;
      }
      distance = Math.min(nextX, nextY);
      if (maximum - distance / (light.stretch * BLOCK_HEIGHT_IN_TILES) <= out.elevation) break;
      if (nextX === distance) {
        x += stepX;
        nextX += deltaX;
      }
      if (nextY === distance) {
        y += stepY;
        nextY += deltaY;
      }
    }
    return out;
  };
  const query = { elevation: 0, width: 0.1 };
  return Object.assign(
    (point: ShadowPoint, light: ShadowProjection) =>
      sampleTerrainHorizon(horizon(point.x, point.y, light, query), point.elevation),
    { horizon },
  );
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

/** GPU-ready solid-column footprints: top and two swept sides, united with entity casters before grading. */
export type TerrainShadowGeometry = {
  readonly vertices: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  project(
    level: number,
    light: ShadowProjection,
    origin: { readonly x: number; readonly y: number },
    pixels: number,
    bounds?: WorldRect,
  ): boolean;
};

/** Caches loaded occluders once. Their projected edges then move continuously with the authored light. */
export function createTerrainShadowGeometry(terrain: OcclusionTerrain): TerrainShadowGeometry {
  const columns: { x: number; y: number; elevation: number }[] = [];
  const { minX, minY, maxX, maxY } = terrain.bounds;
  for (let y = minY - TERRAIN_RAY_REACH; y <= maxY + TERRAIN_RAY_REACH; y += 1)
    for (let x = minX - TERRAIN_RAY_REACH; x <= maxX + TERRAIN_RAY_REACH; x += 1) {
      const elevation = terrain.topHeightAt(x, y);
      if (elevation !== undefined) columns.push({ x, y, elevation });
    }
  const buffers = (count: number) => {
    const vertices = new Float32Array(count * 24);
    const uvs = new Float32Array(vertices.length);
    const indices = new Uint32Array(count * 18);
    for (let quad = 0; quad < count * 3; quad += 1) {
      const v = quad * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], quad * 6);
    }
    return { storage: vertices, vertices, uvs, allIndices: indices, indices };
  };
  let current = buffers(0);
  const planes = new Map<
    number,
    ReturnType<typeof buffers> & {
      light: ShadowProjection;
      originX: number;
      originY: number;
      pixels: number;
      columns: typeof columns;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
  >();
  return {
    get vertices() {
      return current.vertices;
    },
    get uvs() {
      return current.uvs;
    },
    get indices() {
      return current.indices;
    },
    project(level, light, origin, pixels, bounds) {
      const minX = bounds?.minX ?? -Infinity,
        minY = bounds?.minY ?? -Infinity;
      const maxX = bounds?.maxX ?? Infinity,
        maxY = bounds?.maxY ?? Infinity;
      let plane = planes.get(level);
      if (
        plane?.light === light &&
        plane.originX === origin.x &&
        plane.originY === origin.y &&
        plane.pixels === pixels &&
        plane.minX === minX &&
        plane.minY === minY &&
        plane.maxX === maxX &&
        plane.maxY === maxY
      ) {
        current = plane;
        return false;
      }
      if (!plane) {
        // Lower columns cannot occlude this receiver. Keep them out of both the CPU work and GPU buffers.
        const higher = columns.filter(({ elevation }) => elevation > level);
        plane = {
          ...buffers(higher.length),
          columns: higher,
          light,
          originX: origin.x,
          originY: origin.y,
          pixels,
          minX,
          minY,
          maxX,
          maxY,
        };
        planes.set(level, plane);
      } else {
        plane.light = light;
        plane.originX = origin.x;
        plane.originY = origin.y;
        plane.pixels = pixels;
        plane.minX = minX;
        plane.minY = minY;
        plane.maxX = maxX;
        plane.maxY = maxY;
      }
      current = plane;
      const { storage: vertices } = plane;
      let shown = 0;
      const write = (index: number, vertex: number, px: number, py: number) => {
        vertices[index * 24 + vertex * 2] = (px - origin.x) * pixels;
        vertices[index * 24 + vertex * 2 + 1] = (py - origin.y) * pixels;
      };
      plane.columns.forEach(({ x, y, elevation }) => {
        const reach = (elevation - level) * BLOCK_HEIGHT_IN_TILES * light.stretch;
        const dx = light.dirX * reach;
        const dy = light.dirY * reach;
        if (
          x + 0.5 + Math.max(0, dx) < minX ||
          x - 0.5 + Math.min(0, dx) > maxX ||
          y + 0.5 + Math.max(0, dy) < minY ||
          y - 0.5 + Math.min(0, dy) > maxY
        )
          return;
        const index = shown++;
        // Cap at the displaced top, then the two boundary edges facing along the shadow.
        const edgeX = light.dirX >= 0 ? 0.5 : -0.5;
        const edgeY = light.dirY >= 0 ? 0.5 : -0.5;
        write(index, 0, x - 0.5 + dx, y - 0.5 + dy);
        write(index, 1, x + 0.5 + dx, y - 0.5 + dy);
        write(index, 2, x + 0.5 + dx, y + 0.5 + dy);
        write(index, 3, x - 0.5 + dx, y + 0.5 + dy);
        write(index, 4, x + edgeX, y - 0.5);
        write(index, 5, x + edgeX, y + 0.5);
        write(index, 6, x + edgeX + dx, y + 0.5 + dy);
        write(index, 7, x + edgeX + dx, y - 0.5 + dy);
        write(index, 8, x - 0.5, y + edgeY);
        write(index, 9, x + 0.5, y + edgeY);
        write(index, 10, x + 0.5 + dx, y + edgeY + dy);
        write(index, 11, x - 0.5 + dx, y + edgeY + dy);
      });
      if (plane.vertices.length !== shown * 24) {
        plane.vertices = vertices.subarray(0, shown * 24);
        plane.indices = plane.allIndices.subarray(0, shown * 18);
      }
      return true;
    },
  };
}
