import { describe, expect, it, vi } from "vitest";
import type { SkyKey } from "../../types";
import { TICKS_PER_DAY } from "./clock";
import {
  DEFAULT_SKY_PALETTE,
  getSunState,
  sampleSkyPalette,
  SUN_MAX_ALTITUDE,
} from "./sun";

const at = (hour: number) => Math.round((hour / 24) * TICKS_PER_DAY);
const length = ({ x, y, z }: { x: number; y: number; z: number }) => Math.hypot(x, y, z);

describe("getSunState", () => {
  it("rises in the east (+x) at 06:00", () => {
    const sun = getSunState(at(6));

    expect(sun.timeOfDay).toBe(0.25);
    expect(sun.direction.x).toBeCloseTo(1);
    expect(sun.direction.y).toBeCloseTo(0);
    expect(sun.elevation).toBeCloseTo(0);
  });

  it("stands in the south (-y) at its highest altitude at noon", () => {
    const sun = getSunState(at(12));

    expect(sun.direction.x).toBeCloseTo(0);
    expect(sun.direction.y).toBeCloseTo(-Math.cos(SUN_MAX_ALTITUDE));
    expect(sun.elevation).toBeCloseTo(Math.sin(SUN_MAX_ALTITUDE));
    expect(sun.daylight).toBe(1);
    expect(sun.ambient).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("sets in the west (-x) at 18:00", () => {
    const sun = getSunState(at(18));

    expect(sun.direction.x).toBeCloseTo(-1);
    expect(sun.elevation).toBeCloseTo(0);
  });

  it("is below the horizon with the night ambient at midnight", () => {
    const sun = getSunState(0);

    expect(sun.elevation).toBeCloseTo(-Math.sin(SUN_MAX_ALTITUDE));
    expect(sun.daylight).toBe(0);
    expect(sun.ambient).toEqual(DEFAULT_SKY_PALETTE[0].color);
  });

  it("keeps the direction a unit vector and its elevation equal to direction.z", () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const sun = getSunState(at(hour));
      expect(length(sun.direction)).toBeCloseTo(1);
      expect(sun.elevation).toBe(sun.direction.z);
    }
  });

  it("brightens through dawn and darkens through dusk, symmetrically around noon", () => {
    const hours = [4, 5, 6, 7, 8, 9, 10, 11, 12];
    const daylight = hours.map((hour) => getSunState(at(hour)).daylight);

    daylight.slice(1).forEach((value, index) => expect(value).toBeGreaterThanOrEqual(daylight[index]));
    expect(daylight[0]).toBe(0);
    expect(getSunState(at(6)).daylight).toBeGreaterThan(0);
    expect(getSunState(at(6)).daylight).toBeLessThan(1);
    expect(getSunState(at(15)).daylight).toBeCloseTo(getSunState(at(9)).daylight);
    expect(getSunState(at(18)).ambient.r).toBeCloseTo(getSunState(at(6)).ambient.r);
  });

  it("tints twilight warm: red above blue at sunrise", () => {
    const { ambient } = getSunState(at(6));

    expect(ambient.r).toBeGreaterThan(ambient.b);
  });

  it("repeats every day and is deterministic without Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random");

    expect(getSunState(at(9) + 7 * TICKS_PER_DAY)).toEqual(getSunState(at(9)));
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("uses a custom sky palette", () => {
    const red = { r: 1, g: 0, b: 0 };
    const palette: SkyKey[] = [{ elevation: 0, color: red }];

    expect(getSunState(at(12), palette).ambient).toEqual(red);
    expect(getSunState(0, palette).ambient).toEqual(red);
  });
});

describe("sampleSkyPalette", () => {
  const palette: SkyKey[] = [
    { elevation: -0.5, color: { r: 0, g: 0, b: 0 } },
    { elevation: 0.5, color: { r: 1, g: 0.5, b: 0 } },
  ];

  it("interpolates linearly between keys", () => {
    expect(sampleSkyPalette(palette, 0)).toEqual({ r: 0.5, g: 0.25, b: 0 });
  });

  it("returns a key's color exactly at its elevation", () => {
    expect(sampleSkyPalette(palette, 0.5)).toEqual(palette[1].color);
  });

  it("clamps outside the first and last keys", () => {
    expect(sampleSkyPalette(palette, -1)).toEqual(palette[0].color);
    expect(sampleSkyPalette(palette, 1)).toEqual(palette[1].color);
  });

  it("rejects an empty palette", () => {
    expect(() => sampleSkyPalette([], 0)).toThrow(RangeError);
  });

  it("rejects keys that are not in strictly ascending elevation", () => {
    expect(() => sampleSkyPalette([palette[1], palette[0]], 0)).toThrow(RangeError);
    expect(() => sampleSkyPalette([palette[0], palette[0]], 0)).toThrow(RangeError);
  });

  it("has a valid default palette covering the whole sky", () => {
    expect(DEFAULT_SKY_PALETTE[0].elevation).toBe(-1);
    expect(DEFAULT_SKY_PALETTE.at(-1)?.elevation).toBe(1);
    expect(() => sampleSkyPalette(DEFAULT_SKY_PALETTE, 0)).not.toThrow();
    DEFAULT_SKY_PALETTE.forEach(({ color }) =>
      Object.values(color).forEach((channel) => {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }),
    );
  });
});
