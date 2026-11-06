import { describe, expect, it } from "vitest";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed, resolveWorldSeed } from "./random";

describe("createSeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    expect(Array.from({ length: 5 }, first)).toEqual(Array.from({ length: 5 }, second));
  });

  it("produces different sequences for different seeds", () => {
    const first = createSeededRandom(1);
    const second = createSeededRandom(2);

    expect(Array.from({ length: 5 }, first)).not.toEqual(Array.from({ length: 5 }, second));
  });

  it("returns values in the [0, 1) range", () => {
    const random = createSeededRandom(DEFAULT_WORLD_SEED);

    for (let index = 0; index < 1000; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("normalizes the seed to an unsigned 32-bit integer", () => {
    expect(createSeededRandom(-1)()).toBe(createSeededRandom(0xffffffff)());
    expect(createSeededRandom(2.9)()).toBe(createSeededRandom(2)());
  });
});

describe("deriveSeed", () => {
  it("is stable for the same seed and label", () => {
    expect(deriveSeed(7, "entities")).toBe(deriveSeed(7, "entities"));
  });

  it("changes with the label and with the seed", () => {
    expect(deriveSeed(7, "entities")).not.toBe(deriveSeed(7, "terrain"));
    expect(deriveSeed(7, "entities")).not.toBe(deriveSeed(8, "entities"));
  });

  it("returns an unsigned 32-bit integer", () => {
    const seed = deriveSeed(-5, "chunk:-3:12");

    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("resolveWorldSeed", () => {
  it("uses a valid integer seed from the query string", () => {
    const random = () => 0.5;

    expect(resolveWorldSeed("?seed=123", random)).toBe(123);
    expect(resolveWorldSeed("?foo=1&seed= 42 ", random)).toBe(42);
    expect(resolveWorldSeed("?seed=-1", random)).toBe(0xffffffff);
  });

  it("creates a new seed when none or an invalid one is given", () => {
    expect(resolveWorldSeed("", () => 0.5)).toBe(2147483648);
    expect(resolveWorldSeed("?seed=abc", () => 0)).toBe(0);
    expect(resolveWorldSeed("?seed=1.5", () => 0.25)).toBe(1073741824);
  });
});
