import { describe, expect, it } from "vitest";
import { generatePerlinTerrain, getOrCreateTerrain } from "./terrain";

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
    expect(terrain.map(({ x, y }) => `${x}:${y}`)).toEqual([
      "0:0",
      "0:1",
      "1:0",
      "1:1",
      "2:0",
      "2:1",
    ]);
    expect(terrain.every(({ elevation }) => elevation >= -2 && elevation <= 4)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const options = { width: 4, height: 4, seed: 123, octaves: 3 };

    expect(generatePerlinTerrain(options)).toEqual(generatePerlinTerrain(options));
  });

  it("uses defaults and caches the generated world terrain", () => {
    expect(generatePerlinTerrain({ width: 1, height: 1 })).toHaveLength(1);

    const first = getOrCreateTerrain();
    const second = getOrCreateTerrain();

    expect(first).toHaveLength(50 * 50);
    expect(second).toBe(first);
  });
});