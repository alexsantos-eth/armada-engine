import { describe, expect, it } from "vitest";
import { TERRAIN_HEIGHT, TERRAIN_WIDTH } from "../constants";
import { DEFAULT_WORLD_SEED } from "../random";
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

    expect(first).toHaveLength(TERRAIN_WIDTH * TERRAIN_HEIGHT);
    expect(second).toBe(first);
  });

  it("builds the world terrain from the given seed, deterministically", () => {
    const seeded = getOrCreateTerrain(99);

    expect(seeded).toEqual(
      generatePerlinTerrain({ width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT, seed: 99 }),
    );
    expect(getOrCreateTerrain(99)).toBe(seeded);
    expect(getOrCreateTerrain(100)).not.toEqual(seeded);
  });

  it("defaults to DEFAULT_WORLD_SEED instead of the clock", () => {
    expect(getOrCreateTerrain()).toEqual(
      generatePerlinTerrain({
        width: TERRAIN_WIDTH,
        height: TERRAIN_HEIGHT,
        seed: DEFAULT_WORLD_SEED,
      }),
    );
    expect(generatePerlinTerrain({ width: 3, height: 3 })).toEqual(
      generatePerlinTerrain({ width: 3, height: 3, seed: DEFAULT_WORLD_SEED }),
    );
  });
});