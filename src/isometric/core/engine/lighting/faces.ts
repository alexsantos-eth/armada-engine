import type { ShadowProjection, WorldRect } from "../../types";
import { BLOCK_HEIGHT_IN_TILES } from "./shadow";

/** Exposed vertical terrain receiver; x/y names its outward-facing negative-axis plane. */
export type TerrainShadowFace = {
  readonly x: number;
  readonly y: number;
  readonly top: number;
  readonly bottom: number;
  readonly axis: "x" | "y";
};

/** Only the shell toward the camera, in half-block bands so a low caster cannot shade the whole cliff. */
export function getTerrainFaces(
  columns: readonly { readonly x: number; readonly y: number; readonly elevation: number }[],
  heightAt: (x: number, y: number) => number | undefined,
  minimum: number,
): TerrainShadowFace[] {
  const faces: TerrainShadowFace[] = [];
  for (const { x, y, elevation } of columns) {
    for (const axis of ["x", "y"] as const) {
      const neighbour = heightAt(x - Number(axis === "x"), y - Number(axis === "y")) ?? minimum - 1;
      const floor = Math.max(minimum - 1, neighbour);
      for (let top = elevation; top > floor;) {
        const bottom = Math.max(floor, (Math.ceil(top * 2) - 1) / 2);
        faces.push({ x, y, axis, top, bottom });
        top = bottom;
      }
    }
  }
  return faces;
}

/** UVs of a wall's four corners, projected down the light ray to its bottom's horizontal map. */
export function getFaceShadowUvs(
  face: TerrainShadowFace,
  light: ShadowProjection,
  area: WorldRect,
  out: Float32Array = new Float32Array(8),
): Float32Array {
  for (let corner = 0; corner < 4; corner += 1) {
    const along = corner === 1 || corner === 2 ? 0.5 : -0.5;
    const height = corner < 2 ? face.top : face.bottom;
    const shift = (height - face.bottom) * BLOCK_HEIGHT_IN_TILES * light.stretch;
    const x = face.x + (face.axis === "x" ? -0.5 : along) + light.dirX * shift;
    const y = face.y + (face.axis === "y" ? -0.5 : along) + light.dirY * shift;
    out[corner * 2] = (x - area.minX + 0.5) / (area.maxX - area.minX + 1);
    out[corner * 2 + 1] = (y - area.minY + 0.5) / (area.maxY - area.minY + 1);
  }
  return out;
}
