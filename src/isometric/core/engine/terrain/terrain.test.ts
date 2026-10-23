import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_SEED } from "../random";
import { generatePerlinTerrain } from "./terrain";

describe("generatePerlinTerrain", () => {
  it("returns no points for empty dimensions", () => {
    expect(generatePerlinTerrain({ width: 0, height: 4 })).toEqual([]);
    expect(generatePerlinTerrain({ width: 4, height: -1 })).toEqual([]);
  });

  it("generates the requested grid within the configured range", () => {
    const terrain = generatePerlinTerrain({
      width: 3,
      height: 2,
      seed: 7,
      minElevation: -2,
      maxElevation: 4,
    });

    expect(terrain).toHaveLength(6);
    expect(terrain.map(({ x, y }) => `${x}:${y}`)).toEqual(["0:0", "0:1", "1:0", "1:1", "2:0", "2:1"]);
    expect(terrain.every(({ elevation }) => elevation >= -2 && elevation <= 4)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const options = { width: 4, height: 4, seed: 123, octaves: 3 };

    expect(generatePerlinTerrain(options)).toEqual(generatePerlinTerrain(options));
  });

  it("defaults to DEFAULT_WORLD_SEED instead of the clock", () => {
    expect(generatePerlinTerrain({ width: 3, height: 3 })).toEqual(
      generatePerlinTerrain({ width: 3, height: 3, seed: DEFAULT_WORLD_SEED }),
    );
  });
});

describe("generatePerlinTerrain origin", () => {
  it("samples absolute world positions, so areas of one seed meet without a seam", () => {
    const whole = generatePerlinTerrain({ width: 6, height: 4, seed: 11, originX: -2, originY: -1 });
    const part = generatePerlinTerrain({ width: 2, height: 2, seed: 11, originX: 1, originY: 0 });

    expect(whole[0]).toMatchObject({ x: -2, y: -1 });
    expect(part).toEqual(whole.filter(({ x, y }) => x >= 1 && x <= 2 && y >= 0 && y <= 1));
  });
});
