import { describe, expect, it } from "vitest";
import { DEFAULT_WIND_STRENGTH, getSwayOffset, getSwayPhase, SWAY_GUST_RATE, SWAY_GUST_WEIGHT } from "./wind";

const SWAY = { amplitude: 2, period: 3000 };

describe("getSwayPhase", () => {
  it("gives each id its own phase, the same every time, in [0, 2π)", () => {
    const ids = Array.from({ length: 50 }, (_, index) => `tree@${index},0`);
    const phases = ids.map(getSwayPhase);

    expect(ids.map(getSwayPhase)).toEqual(phases);
    expect(new Set(phases).size).toBe(ids.length);
    phases.forEach((phase) => {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(2 * Math.PI);
    });
  });
});

describe("getSwayOffset", () => {
  it("adds a slow wave and a faster, lighter one", () => {
    const phase = 0.4;
    const angle = (2 * Math.PI * 500) / SWAY.period + phase;
    const expected =
      SWAY.amplitude *
      DEFAULT_WIND_STRENGTH *
      ((1 - SWAY_GUST_WEIGHT) * Math.sin(angle) + SWAY_GUST_WEIGHT * Math.sin(SWAY_GUST_RATE * angle + phase));

    expect(getSwayOffset(SWAY, phase, 500)).toBeCloseTo(expected, 12);
    expect(getSwayOffset(SWAY, phase, 500, DEFAULT_WIND_STRENGTH)).toBe(getSwayOffset(SWAY, phase, 500));
  });

  it("never leans past the amplitude times the wind strength", () => {
    for (let time = 0; time < 20_000; time += 37) {
      expect(Math.abs(getSwayOffset(SWAY, 1.3, time))).toBeLessThanOrEqual(SWAY.amplitude * DEFAULT_WIND_STRENGTH);
      expect(Math.abs(getSwayOffset(SWAY, 1.3, time, 0.5))).toBeLessThanOrEqual(SWAY.amplitude / 2);
    }
  });

  it("leans both ways, and not at all without wind or amplitude", () => {
    const offsets = Array.from({ length: 100 }, (_, index) => getSwayOffset(SWAY, 0, index * 60));

    expect(Math.min(...offsets)).toBeLessThan(-1);
    expect(Math.max(...offsets)).toBeGreaterThan(1);
    expect(getSwayOffset(SWAY, 2, 1234, 0)).toBeCloseTo(0, 12);
    expect(getSwayOffset({ amplitude: 0, period: 3000 }, 2, 1234)).toBeCloseTo(0, 12);
  });
});
