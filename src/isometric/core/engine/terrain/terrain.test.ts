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
