import { describe, expect, it } from "vitest";
import {
  BOX_HEIGHT,
  CHUNK_SIZE,
  GROUND_BLOCK_TEXTURE_KEY,
  GRASS_BLOCK_TEXTURE_KEY,
  POSITIVE_ELEVATION_TINT_STEP,
  SAND_BLOCK_TEXTURE_KEY,
  NEGATIVE_ELEVATION_TINT_STEP,
  TILE_HEIGHT,
  TILE_METRICS,
  TILE_WIDTH,
  WIDTH,
  WATER_BLOCK_TEXTURE_KEY,
} from "./constants";

describe("engine constants", () => {
  it("uses a static view width without reading window", () => {
    expect(typeof window).toBe("undefined");
    expect(WIDTH).toBe(1300);
    expect(TILE_WIDTH).toBe(40);
  });

  it("keeps the isometric block proportions consistent", () => {
    expect(TILE_HEIGHT).toBe(TILE_WIDTH / 2);
    expect(BOX_HEIGHT).toBe(TILE_WIDTH / 3);
    expect(TILE_METRICS).toEqual({
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
    });
  });

  it("provides unique block texture keys", () => {
    expect(new Set([
      GRASS_BLOCK_TEXTURE_KEY,
      GROUND_BLOCK_TEXTURE_KEY,
      WATER_BLOCK_TEXTURE_KEY,
      SAND_BLOCK_TEXTURE_KEY,
    ]).size).toBe(4);
  });

  it("uses a power-of-two chunk size", () => {
    expect(Number.isInteger(Math.log2(CHUNK_SIZE))).toBe(true);
  });

  it("defines a positive elevation tint step", () => {
    expect(POSITIVE_ELEVATION_TINT_STEP).toBeGreaterThan(0);
  });

  it("defines a positive negative elevation tint step", () => {
    expect(NEGATIVE_ELEVATION_TINT_STEP).toBeGreaterThan(0);
  });
});