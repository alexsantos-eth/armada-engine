import { describe, expect, it } from "vitest";
import {
  BOX_HEIGHT,
  GROUND_BLOCK_TEXTURE_KEY,
  GRASS_BLOCK_TEXTURE_KEY,
  POSITIVE_ELEVATION_TINT_STEP,
  SAND_BLOCK_TEXTURE_KEY,
  NEGATIVE_ELEVATION_TINT_STEP,
  TILE_HEIGHT,
  TILE_WIDTH,
  VIEW_CULL_MARGIN,
  WATER_BLOCK_TEXTURE_KEY,
} from "./constants";

describe("engine constants", () => {
  it("keeps the isometric block proportions consistent", () => {
    expect(TILE_HEIGHT).toBe(TILE_WIDTH / 2);
    expect(BOX_HEIGHT).toBe(TILE_WIDTH / 3);
  });

  it("provides unique block texture keys", () => {
    expect(new Set([
      GRASS_BLOCK_TEXTURE_KEY,
      GROUND_BLOCK_TEXTURE_KEY,
      WATER_BLOCK_TEXTURE_KEY,
      SAND_BLOCK_TEXTURE_KEY,
    ]).size).toBe(4);
  });

  it("defines a positive viewport culling margin", () => {
    expect(VIEW_CULL_MARGIN).toBeGreaterThan(0);
  });

  it("defines a positive elevation tint step", () => {
    expect(POSITIVE_ELEVATION_TINT_STEP).toBeGreaterThan(0);
  });

  it("defines a positive negative elevation tint step", () => {
    expect(NEGATIVE_ELEVATION_TINT_STEP).toBeGreaterThan(0);
  });
});