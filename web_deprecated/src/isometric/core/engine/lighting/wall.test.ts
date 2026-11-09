import { expect, it } from "vitest";
import { TILE_METRICS } from "../constants";
import { createWallShadowProjector } from "./wall";

it("intersects a caster directly with a wall and clips its footprint to that receiver", () => {
  const project = createWallShadowProjector(TILE_METRICS);
  const face = { x: 1, y: 0, axis: "x" as const, top: 3, bottom: 0 };
  const caster = {
    worldFoot: { x: 0, y: 0 },
    screenFoot: { x: 0, y: 0 },
    display: { left: -10, top: -40, width: 20, height: 40 },
  };
  const light = { dirX: 1, dirY: 0, stretch: 2, alpha: 0.34 };
  expect(project(face, caster, 0, light)).toBeGreaterThan(0);
  expect(project.positions.every((v) => v >= 0 && v <= 1)).toBe(true);
  expect(project.uvs.every((v) => v >= 0 && v <= 1)).toBe(true);
  expect(project(face, caster, 0, { ...light, dirX: -1 })).toBe(0);
  expect(project(face, caster, 0, { ...light, dirX: 0, dirY: 1 })).toBe(0);
  expect(project(face, caster, 0, { ...light, stretch: 0 })).toBe(0);
  expect(project({ ...face, axis: "y", x: 0, y: 1 }, caster, 0, { ...light, dirX: 0, dirY: 1 })).toBeGreaterThan(0);
  expect(project({ ...face, top: 10, bottom: 9 }, caster, 0, light)).toBe(0);
  expect(project({ ...face, y: 20 }, caster, 0, light)).toBe(0);
});

it("never projects a low caster above its height, for either side of a wall", () => {
  const project = createWallShadowProjector(TILE_METRICS);
  const display = { left: -10, top: -TILE_METRICS.boxHeight, width: 20, height: TILE_METRICS.boxHeight };
  for (const sign of [-1, 1]) {
    const count = project(
      { x: 1, y: 0, axis: "x", top: 3, bottom: 0 },
      { worldFoot: { x: 0.5 - sign, y: 0 }, screenFoot: { x: 0, y: 0 }, display },
      0,
      { dirX: sign, dirY: 0, stretch: 4, alpha: 0.34 },
    );
    expect(count).toBeGreaterThan(0);
    for (let vertex = 0; vertex < count; vertex += 1) expect(project.positions[vertex * 2 + 1]).toBeGreaterThan(2 / 3);
  }
});

it("clips a caster straddling the wall without shading receivers above the caster", () => {
  const project = createWallShadowProjector(TILE_METRICS);
  const display = { left: -10, top: -TILE_METRICS.boxHeight, width: 20, height: TILE_METRICS.boxHeight };
  expect(
    project(
      { x: 0.5, y: 0, axis: "x", top: 2, bottom: 1.1 },
      { worldFoot: { x: 0.25, y: 0 }, screenFoot: { x: 0, y: 0 }, display },
      0,
      { dirX: Math.SQRT1_2, dirY: Math.SQRT1_2, stretch: 2, alpha: 0.34 },
    ),
  ).toBe(0);
});
