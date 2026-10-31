import { describe, expect, it } from "vitest";
import { getWaveLift, WATER_WAVES, type WaterWave } from "./waves";

const SWELL: WaterWave = { direction: [1, 0], length: 4, period: 1000, amplitude: 2 };

describe("getWaveLift", () => {
  it("lifts the water by a sine of the column along the wave minus the time", () => {
    expect(getWaveLift(0, 0, 0, [SWELL])).toBeCloseTo(0);
    expect(getWaveLift(1, 0, 0, [SWELL])).toBeCloseTo(2);
    expect(getWaveLift(3, 7, 0, [SWELL])).toBeCloseTo(-2);
    // A quarter period later the crest has run a quarter length along the wave.
    expect(getWaveLift(2, 0, 250, [SWELL])).toBeCloseTo(2);
    // The direction need not be unit length.
    expect(getWaveLift(1, 0, 0, [{ ...SWELL, direction: [3, 0] }])).toBeCloseTo(2);
  });

  it("adds its waves, never past their amplitudes, and repeats with the same time", () => {
    const most = WATER_WAVES.reduce((sum, { amplitude }) => sum + amplitude, 0);
    for (let x = 0; x < 12; x += 1)
      for (let t = 0; t < 5000; t += 370) expect(Math.abs(getWaveLift(x, 2 * x, t))).toBeLessThanOrEqual(most);
    expect(getWaveLift(5, 3, 1234)).toBe(getWaveLift(5, 3, 1234));
    expect(getWaveLift(5, 3, 0, [])).toBe(0);
  });

  it("moves neighbouring columns almost together: under a world pixel apart", () => {
    for (let x = -10; x < 10; x += 1)
      for (let t = 0; t < 6000; t += 450) {
        expect(Math.abs(getWaveLift(x + 1, 0, t) - getWaveLift(x, 0, t))).toBeLessThan(1);
        expect(Math.abs(getWaveLift(0, x + 1, t) - getWaveLift(0, x, t))).toBeLessThan(1);
      }
  });
});
