import type { ShadowProjection, TileMetrics } from "../../types";
import type { TerrainShadowFace } from "./faces";
import { BLOCK_HEIGHT_IN_TILES } from "./shadow";

type WallCaster = {
  readonly worldFoot: { readonly x: number; readonly y: number };
  readonly screenFoot: { readonly x: number; readonly y: number };
  readonly display: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
};

/** Reusable clipped polygon in receiver-local [0,1] coordinates; its UVs address the caster texture. */
export type WallShadowProjector = {
  (face: TerrainShadowFace, caster: WallCaster, elevation: number, light: ShadowProjection): number;
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
};

/** Intersects sun rays with a vertical wall, rejecting rays behind the caster and clipping to the wall. */
export function createWallShadowProjector(metrics: TileMetrics): WallShadowProjector {
  let input = new Float64Array(60);
  let output = new Float64Array(60);
  const positions = new Float32Array(24);
  const uvs = new Float32Array(24);
  const project: WallShadowProjector = Object.assign(
    (face: TerrainShadowFace, caster: WallCaster, elevation: number, light: ShadowProjection) => {
      const alongX = face.axis === "y";
      const direction = alongX ? light.dirY : light.dirX;
      if (Math.abs(direction) < 1e-6 || light.stretch <= 0) return 0;
      const dx = face.x - (alongX ? 0 : 0.5) - caster.worldFoot.x;
      const dy = face.y - (alongX ? 0.5 : 0) - caster.worldFoot.y;
      const along = light.dirX * dx + light.dirY * dy;
      const span = 0.5 * Math.abs(alongX ? light.dirX : light.dirY);
      const reach =
        (elevation + (caster.screenFoot.y - caster.display.top) / metrics.boxHeight - face.bottom) *
        light.stretch *
        BLOCK_HEIGHT_IN_TILES;
      if (along + span <= 0 || along - span > reach) return 0;
      const cross = light.dirY * dx - light.dirX * dy;
      const crossSpan = 0.5 * Math.abs(alongX ? light.dirY : light.dirX);
      const left = ((caster.display.left - caster.screenFoot.x) * Math.SQRT2) / metrics.tileWidth;
      const right = left + (caster.display.width * Math.SQRT2) / metrics.tileWidth;
      if (cross + crossSpan < left || cross - crossSpan > right) return 0;
      const acrossX = (light.dirY * Math.SQRT2) / metrics.tileWidth;
      const acrossY = (-light.dirX * Math.SQRT2) / metrics.tileWidth;
      const wall = (alongX ? face.y : face.x) - 0.5;
      const base = alongX ? caster.worldFoot.y : caster.worldFoot.x;
      const across = alongX ? acrossY : acrossX;
      const other = alongX ? caster.worldFoot.x : caster.worldFoot.y;
      const otherDirection = alongX ? light.dirX : light.dirY;
      const otherAcross = alongX ? acrossX : acrossY;
      const origin = alongX ? face.x : face.y;
      for (let corner = 0; corner < 4; corner += 1) {
        const u = Number(corner === 1 || corner === 2);
        const v = Number(corner >= 2);
        const px = caster.display.left - caster.screenFoot.x + u * caster.display.width;
        const py = caster.display.top - caster.screenFoot.y + v * caster.display.height;
        const distance = (wall - base - across * px) / direction;
        input[corner * 5] = other + otherAcross * px + otherDirection * distance - origin + 0.5;
        const z = elevation - py / metrics.boxHeight - distance / (light.stretch * BLOCK_HEIGHT_IN_TILES);
        input[corner * 5 + 1] = (face.top - z) / (face.top - face.bottom);
        input[corner * 5 + 2] = distance;
        input[corner * 5 + 3] = u;
        input[corner * 5 + 4] = v;
      }
      let count = 4;
      // Clip t >= 0, x >= 0, x <= 1, y >= 0, y <= 1, carrying texture coordinates.
      for (let plane = 0; plane < 5; plane += 1) {
        const component = plane === 0 ? 2 : plane < 3 ? 0 : 1;
        const upper = plane === 2 || plane === 4;
        let written = 0;
        for (let index = 0; index < count; index += 1) {
          const previous = (index + count - 1) % count;
          const a = upper ? 1 - input[previous * 5 + component] : input[previous * 5 + component];
          const b = upper ? 1 - input[index * 5 + component] : input[index * 5 + component];
          if (a >= 0 !== b >= 0) {
            const fraction = a / (a - b);
            for (let value = 0; value < 5; value += 1)
              output[written * 5 + value] =
                input[previous * 5 + value] + fraction * (input[index * 5 + value] - input[previous * 5 + value]);
            written += 1;
          }
          if (b >= 0) {
            for (let value = 0; value < 5; value += 1) output[written * 5 + value] = input[index * 5 + value];
            written += 1;
          }
        }
        [input, output] = [output, input];
        count = written;
        if (count < 3) return 0;
      }
      positions.fill(0);
      uvs.fill(0);
      for (let index = 0; index < count; index += 1) {
        positions[index * 2] = input[index * 5];
        positions[index * 2 + 1] = input[index * 5 + 1];
        uvs[index * 2] = input[index * 5 + 3];
        uvs[index * 2 + 1] = input[index * 5 + 4];
      }
      return count;
    },
    { positions, uvs },
  );
  return project;
}
