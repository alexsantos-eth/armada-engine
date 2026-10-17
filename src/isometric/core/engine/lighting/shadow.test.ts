import { describe, expect, it, vi } from "vitest";
import type { ShadowCaster, SunState } from "../../types";
import { BOX_HEIGHT, TILE_WIDTH } from "../constants";
import { getSunState, TICKS_PER_DAY } from "../time";
import {
  BLOCK_HEIGHT_IN_TILES,
  FOOTPRINT_HALF_SIZE,
  getShadowShape,
  MAX_SHADOW_LENGTH,
  SHADOW_ALPHA,
  SHADOW_FADE_ELEVATION,
} from "./shadow";

const TREE: ShadowCaster = { height: 1, length: 1, lengthAxis: "x" };
const WHITE = { r: 1, g: 1, b: 1 };

/** A sun at `altitude` radians whose horizontal direction points at `toward` (from +x to +y). */
const sunAt = (altitude: number, toward = -3 * Math.PI / 4): SunState => ({
  timeOfDay: 0.5,
  direction: {
    x: Math.cos(altitude) * Math.cos(toward),
    y: Math.cos(altitude) * Math.sin(toward),
    z: Math.sin(altitude),
  },
  elevation: Math.sin(altitude),
  daylight: 1,
  ambient: WHITE,
});

describe("shadow constants", () => {
  it("measures a block in tiles from the 2:1 projection (about half a tile)", () => {
    expect(BLOCK_HEIGHT_IN_TILES).toBeCloseTo((BOX_HEIGHT / TILE_WIDTH) * Math.sqrt(2.5));
    expect(BLOCK_HEIGHT_IN_TILES).toBeCloseTo(0.527, 3);
  });
});

describe("getShadowShape", () => {
  it("casts no shadow while the sun is at or below the horizon", () => {
    expect(getShadowShape(sunAt(0), TREE)).toBeNull();
    expect(getShadowShape(sunAt(-0.4), TREE)).toBeNull();
  });

  it("points away from the sun", () => {
    const shape = getShadowShape(sunAt(0.5, -3 * Math.PI / 4), TREE);

    expect(shape?.angle).toBeCloseTo(Math.PI / 4);
    expect(shape?.centerX).toBeGreaterThan(0);
    expect(shape?.centerY).toBeCloseTo(shape?.centerX ?? Number.NaN);
  });

  it("grows as the sun gets lower: length = height in tiles / tan(altitude)", () => {
    const altitude = Math.PI / 4;
    const shape = getShadowShape(sunAt(altitude, Math.PI), TREE);
    const length = BLOCK_HEIGHT_IN_TILES / Math.tan(altitude);

    expect(Math.cos(shape?.angle ?? 0)).toBeCloseTo(1);
    expect(shape?.radiusAlong).toBeCloseTo(FOOTPRINT_HALF_SIZE + length / 2);
    expect(shape?.radiusAcross).toBeCloseTo(FOOTPRINT_HALF_SIZE);
    expect(shape?.centerX).toBeCloseTo(length / 2);
    expect(shape?.centerY).toBeCloseTo(0);
  });

  it("scales with the caster height and is capped at MAX_SHADOW_LENGTH", () => {
    const low = getShadowShape(sunAt(1), TREE);
    const tall = getShadowShape(sunAt(1), { ...TREE, height: 3 });
    const tower = getShadowShape(sunAt(0.05), { ...TREE, height: 6 });

    expect((tall?.radiusAlong ?? 0) - FOOTPRINT_HALF_SIZE)
      .toBeCloseTo(3 * ((low?.radiusAlong ?? 0) - FOOTPRINT_HALF_SIZE));
    expect(tower?.radiusAlong).toBeCloseTo(FOOTPRINT_HALF_SIZE + MAX_SHADOW_LENGTH / 2);
  });

  it("starts from the centre of a multi-tile footprint and covers its extent", () => {
    const sun = sunAt(Math.PI / 2 - 1e-9, 0);
    const alongX = getShadowShape(sun, { height: 1, length: 3, lengthAxis: "x" });
    const alongY = getShadowShape(sun, { height: 1, length: 3, lengthAxis: "y" });

    expect(alongX?.centerX).toBeCloseTo(1);
    expect(alongX?.centerY).toBeCloseTo(0);
    expect(alongX?.radiusAlong).toBeCloseTo(1 + FOOTPRINT_HALF_SIZE);
    expect(alongX?.radiusAcross).toBeCloseTo(FOOTPRINT_HALF_SIZE);
    expect(alongY?.centerX).toBeCloseTo(0);
    expect(alongY?.centerY).toBeCloseTo(1);
    expect(alongY?.radiusAlong).toBeCloseTo(FOOTPRINT_HALF_SIZE);
    expect(alongY?.radiusAcross).toBeCloseTo(1 + FOOTPRINT_HALF_SIZE);
  });

  it("handles a sun straight overhead as a round contact shadow", () => {
    const zenith: SunState = { ...sunAt(0), direction: { x: 0, y: 0, z: 1 }, elevation: 1 };
    const shape = getShadowShape(zenith, TREE);

    expect(shape).toMatchObject({ centerX: 0, centerY: 0, angle: 0 });
    expect(shape?.radiusAlong).toBeCloseTo(FOOTPRINT_HALF_SIZE);
    expect(shape?.radiusAcross).toBeCloseTo(FOOTPRINT_HALF_SIZE);
  });

  it("fades in as the sun rises and reaches SHADOW_ALPHA", () => {
    const low = getShadowShape(sunAt(Math.asin(SHADOW_FADE_ELEVATION / 4)), TREE);
    const high = getShadowShape(sunAt(Math.asin(SHADOW_FADE_ELEVATION)), TREE);

    expect(low?.alpha).toBeGreaterThan(0);
    expect(low?.alpha).toBeLessThan(SHADOW_ALPHA);
    expect(high?.alpha).toBeCloseTo(SHADOW_ALPHA);
  });

  it("is pure and deterministic", () => {
    const randomSpy = vi.spyOn(Math, "random");

    expect(getShadowShape(sunAt(0.7), TREE)).toEqual(getShadowShape(sunAt(0.7), TREE));
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("never reaches the tiles in front of the caster at any hour, so nothing drawn later cuts it", () => {
    const casters: ShadowCaster[] = [
      TREE,
      { height: 6, length: 1, lengthAxis: "x" },
      { height: 3, length: 3, lengthAxis: "x" },
      { height: 3, length: 2, lengthAxis: "y" },
    ];
    // Tiles in front of the anchor start half a tile before its centre on x or y; the shadow
    // stays within the footprint on that side.
    const front = -FOOTPRINT_HALF_SIZE - 1e-9;

    for (let hour = 6; hour <= 18; hour += 0.1) {
      const sun = getSunState(Math.round((hour / 24) * TICKS_PER_DAY));
      casters.forEach((caster) => {
        const shape = getShadowShape(sun, caster);
        if (!shape) return;
        const cos = Math.cos(shape.angle);
        const sin = Math.sin(shape.angle);
        const minX = shape.centerX - Math.hypot(shape.radiusAlong * cos, shape.radiusAcross * sin);
        const minY = shape.centerY - Math.hypot(shape.radiusAlong * sin, shape.radiusAcross * cos);
        expect(minX).toBeGreaterThan(front);
        expect(minY).toBeGreaterThan(front);
        expect(minX).toBeGreaterThan(-0.5);
        expect(minY).toBeGreaterThan(-0.5);
      });
    }
  });
});
