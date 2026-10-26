import { describe, expect, it } from "vitest";
import { BAND_REPEAT_TILES, getBandDrift, getBandLight, isDeepSurface, validateTerrainBands } from "./waves";
import type { TerrainBands } from "../../types";

const BANDS: TerrainBands = { count: 2, width: 0.5, alpha: 0.2, period: 8000, deepBelow: -1, deep: 0.5 };

describe("getBandLight", () => {
  it("is brightest in the middle of each band and dark between bands", () => {
    // Two bands every two tiles: one per tile, centred on its middle.
    expect(getBandLight(BANDS, 0.5)).toBeCloseTo(1, 12);
    expect(getBandLight(BANDS, 1.5)).toBeCloseTo(1, 12);
    expect(getBandLight(BANDS, 0)).toBe(0);
    expect(getBandLight(BANDS, 0.25)).toBe(0);
    expect(getBandLight(BANDS, 0.375)).toBeCloseTo(0.5, 12);
  });

  it("repeats every two tiles, on both sides of zero", () => {
    for (let position = -3; position < 3; position += 0.13) {
      expect(getBandLight(BANDS, position + BAND_REPEAT_TILES)).toBeCloseTo(getBandLight(BANDS, position), 9);
    }
  });

  it("stays in [0, 1]", () => {
    for (let position = 0; position < 2; position += 0.01) {
      const light = getBandLight({ count: 3, width: 1 }, position);
      expect(light).toBeGreaterThanOrEqual(0);
      expect(light).toBeLessThanOrEqual(1);
    }
  });
});

describe("isDeepSurface", () => {
  it("is deep only below deepBelow", () => {
    expect(isDeepSurface(BANDS, -1)).toBe(false);
    expect(isDeepSurface(BANDS, -2)).toBe(true);
  });
});

describe("getBandDrift", () => {
  it("drifts two tiles every period, and wraps", () => {
    expect(getBandDrift(BANDS, 0, false)).toBe(0);
    expect(getBandDrift(BANDS, 2000, false)).toBeCloseTo(0.5, 12);
    expect(getBandDrift(BANDS, 10_000, false)).toBeCloseTo(0.5, 12);
  });

  it("drifts slower on deep blocks", () => {
    expect(getBandDrift(BANDS, 2000, true)).toBeCloseTo(0.25, 12);
    expect(getBandDrift({ ...BANDS, deep: 0 }, 5000, true)).toBe(0);
  });
});

describe("validateTerrainBands", () => {
  it("accepts bands that can be drawn", () => {
    expect(validateTerrainBands(BANDS)).toEqual([]);
  });

  it("lists every problem", () => {
    expect(
      validateTerrainBands({ count: 1.5, width: 0, alpha: 2, period: Infinity, deepBelow: -0.5, deep: -1 }),
    ).toEqual([
      "bands.count must be a positive integer (got 1.5)",
      "bands.width must be in (0, 1] (got 0)",
      "bands.alpha must be in (0, 1] (got 2)",
      "bands.period must be a positive number (got Infinity)",
      "bands.deepBelow must be an integer elevation (got -0.5)",
      "bands.deep must be in [0, 1] (got -1)",
    ]);
  });
});
