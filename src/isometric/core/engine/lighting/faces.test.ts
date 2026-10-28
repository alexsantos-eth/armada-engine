import { describe, expect, it } from "vitest";
import { getTerrainFaces, getFaceShadowUvs } from "./faces";
import { DAY_SHADOW_PROJECTION } from "./phases";

describe("terrain shadow receiver faces", () => {
  it("creates only exposed camera-facing walls, split at half-block receiver heights", () => {
    const columns = [{ x: 0, y: 0, elevation: 2 }];
    const faces = getTerrainFaces(columns, (x, y) => (x === -1 ? 2 : y === -1 ? 0 : undefined), -3);
    expect(faces).toHaveLength(4);
    expect(faces.every((face) => face.axis === "y" && face.top - face.bottom === 0.5)).toBe(true);
    expect(getTerrainFaces([{ x: 0, y: 0, elevation: -0.5 }], () => undefined, -1)).toHaveLength(6);
  });
  it("projects vertical receiver points down the same light ray into a horizontal shadow map", () => {
    const face = { x: 0, y: 0, top: 1, bottom: 0.5, axis: "x" as const };
    const area = { minX: -2, minY: -2, maxX: 2, maxY: 2 };
    const day = getFaceShadowUvs(face, DAY_SHADOW_PROJECTION, area);
    const dusk = getFaceShadowUvs(face, { ...DAY_SHADOW_PROJECTION, dirX: 1, dirY: 0 }, area);
    expect(day).toHaveLength(8);
    expect(day).not.toEqual(dusk);
    expect(day[4]).toBeCloseTo((face.x - 0.5 - area.minX + 0.5) / 5);
    expect(day.every(Number.isFinite)).toBe(true);
    expect(getFaceShadowUvs({ ...face, axis: "y" }, DAY_SHADOW_PROJECTION, area)).not.toEqual(day);
  });
});
