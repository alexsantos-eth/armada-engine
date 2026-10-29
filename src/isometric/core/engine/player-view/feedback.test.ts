import { describe, expect, it } from "vitest";
import { TILE_METRICS } from "../constants";
import { PLAYER_JUMP_SPEED } from "../player";
import { DUST_MS, getBodyScale, getDust, getVoxelFaces, LANDING_SQUASH_MS, TAKEOFF_STRETCH_MS } from "./feedback";

describe("getBodyScale", () => {
  it("is the body's own scale when nothing happened", () => {
    expect(getBodyScale(Infinity, Infinity, 0)).toEqual({ x: 1, y: 1 });
    expect(getBodyScale(TAKEOFF_STRETCH_MS, LANDING_SQUASH_MS, PLAYER_JUMP_SPEED)).toEqual({ x: 1, y: 1 });
  });

  it("stretches up at a take-off and squashes at a landing, harder landings more", () => {
    const stretched = getBodyScale(0, Infinity, 0);
    expect(stretched.y).toBeGreaterThan(1);
    expect(stretched.x).toBeLessThan(1);

    const soft = getBodyScale(Infinity, 0, 0.02);
    const hard = getBodyScale(Infinity, 0, PLAYER_JUMP_SPEED);
    const harder = getBodyScale(Infinity, 0, 10);
    expect(soft.y).toBeLessThan(1);
    expect(hard.y).toBeLessThan(soft.y);
    expect(harder.y).toBeLessThan(hard.y);
    expect(harder).toEqual(getBodyScale(Infinity, 0, PLAYER_JUMP_SPEED * 1.5));
    expect(getBodyScale(Infinity, LANDING_SQUASH_MS / 2, PLAYER_JUMP_SPEED).y).toBeCloseTo(1 - 0.07);
  });
});

describe("getDust", () => {
  it("spreads and fades, and is gone after DUST_MS", () => {
    expect(getDust(0)).toEqual({ scale: 0.6, alpha: 0.55 });
    expect(getDust(DUST_MS / 2)).toEqual({ scale: expect.closeTo(1), alpha: expect.closeTo(0.275) });
    expect(getDust(DUST_MS)).toBeUndefined();
  });
});

describe("getVoxelFaces", () => {
  it("draws a voxel standing on the point, with the proportions of a terrain block", () => {
    const { tileWidth, tileHeight, boxHeight } = TILE_METRICS;
    const faces = getVoxelFaces(0, 0, 1, TILE_METRICS);
    expect(faces.top).toEqual([
      0,
      -boxHeight - tileHeight / 2,
      tileWidth / 2,
      -boxHeight,
      0,
      -boxHeight + tileHeight / 2,
      -tileWidth / 2,
      -boxHeight,
    ]);
    expect(faces.left).toEqual([
      -tileWidth / 2,
      -boxHeight,
      0,
      -boxHeight + tileHeight / 2,
      0,
      tileHeight / 2,
      -tileWidth / 2,
      0,
    ]);
    expect(faces.right).toEqual([
      0,
      -boxHeight + tileHeight / 2,
      tileWidth / 2,
      -boxHeight,
      tileWidth / 2,
      0,
      0,
      tileHeight / 2,
    ]);
  });

  it("is placed by tiles from the point and scaled by its size", () => {
    const small = getVoxelFaces(0.5, 0.25, 0.1, TILE_METRICS);
    expect(small.left.slice(4, 6)).toEqual([
      0.5 * TILE_METRICS.tileWidth,
      0.25 * TILE_METRICS.tileWidth + (0.1 * TILE_METRICS.tileHeight) / 2,
    ]);
  });
});
