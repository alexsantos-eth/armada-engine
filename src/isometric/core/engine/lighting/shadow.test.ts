import { describe, expect, it, vi } from "vitest";
import type { Affine2D, SunState } from "../../types";
import { BOX_HEIGHT, TILE_METRICS, TILE_WIDTH } from "../constants";
import {
  BLOCK_HEIGHT_IN_TILES,
  getShadowProjection,
  getSilhouetteMatrix,
  MAX_SHADOW_STRETCH,
  SHADOW_ALPHA,
  SHADOW_FADE_ELEVATION,
} from "./shadow";

const WHITE = { r: 1, g: 1, b: 1 };

/** A sun at `altitude` radians whose horizontal direction points at `toward` (from +x to +y). */
const sunAt = (altitude: number, toward = (-3 * Math.PI) / 4): SunState => ({
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

const apply = (m: Affine2D, x: number, y: number) => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });

/** World tile offset → screen offset in the 2:1 projection. */
const toScreen = (wx: number, wy: number) => ({
  x: (wx - wy) * (TILE_WIDTH / 2),
  y: -(wx + wy) * (TILE_METRICS.tileHeight / 2),
});

describe("BLOCK_HEIGHT_IN_TILES", () => {
  it("measures a block in tiles from the 2:1 projection (about half a tile)", () => {
    expect(BLOCK_HEIGHT_IN_TILES).toBeCloseTo((BOX_HEIGHT / TILE_WIDTH) * Math.sqrt(2.5));
    expect(BLOCK_HEIGHT_IN_TILES).toBeCloseTo(0.527, 3);
  });
});

describe("getShadowProjection", () => {
  it("casts no shadow while the sun is at or below the horizon", () => {
    expect(getShadowProjection(sunAt(0))).toBeNull();
    expect(getShadowProjection(sunAt(-0.3))).toBeNull();
  });

  it("points shadows away from the sun", () => {
    const projection = getShadowProjection(sunAt(0.6, (-3 * Math.PI) / 4));

    expect(projection?.dirX).toBeCloseTo(Math.SQRT1_2);
    expect(projection?.dirY).toBeCloseTo(Math.SQRT1_2);
  });

  it("stretches one tile of height to 1 / tan(altitude) tiles, capped", () => {
    expect(getShadowProjection(sunAt(Math.PI / 3))?.stretch).toBeCloseTo(1 / Math.tan(Math.PI / 3));
    expect(getShadowProjection(sunAt(0.01))?.stretch).toBe(MAX_SHADOW_STRETCH);
  });

  it("handles a sun straight overhead", () => {
    const zenith: SunState = { ...sunAt(0), direction: { x: 0, y: 0, z: 1 }, elevation: 1 };

    expect(getShadowProjection(zenith)).toMatchObject({ dirX: 1, dirY: 0, stretch: 0 });
  });

  it("fades in from the horizon to SHADOW_ALPHA", () => {
    const low = getShadowProjection(sunAt(Math.asin(SHADOW_FADE_ELEVATION / 4)));
    const high = getShadowProjection(sunAt(Math.asin(SHADOW_FADE_ELEVATION)));

    expect(low?.alpha).toBeGreaterThan(0);
    expect(low?.alpha).toBeLessThan(SHADOW_ALPHA);
    expect(high?.alpha).toBeCloseTo(SHADOW_ALPHA);
  });

  it("is pure and deterministic", () => {
    const randomSpy = vi.spyOn(Math, "random");

    expect(getShadowProjection(sunAt(0.7))).toEqual(getShadowProjection(sunAt(0.7)));
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });
});

describe("getSilhouetteMatrix", () => {
  const projection = { dirX: 0.6, dirY: 0.8, stretch: 1.5, alpha: 0.3 };
  const foot = { x: 4, y: 7 };

  it("keeps the foot of the sprite on the foot tile", () => {
    const point = apply(getSilhouetteMatrix(projection, foot, 0, TILE_METRICS), 0, 0);

    expect(point.x).toBeCloseTo(foot.x);
    expect(point.y).toBeCloseTo(foot.y);
  });

  it("lays the sprite's width across the shadow, perpendicular to it, at its own size", () => {
    const matrix = getSilhouetteMatrix(projection, foot, 0, TILE_METRICS);
    const point = apply(matrix, 10, 0);
    const across = { x: point.x - foot.x, y: point.y - foot.y };

    expect(across.x * projection.dirX + across.y * projection.dirY).toBeCloseTo(0);
    expect(Math.hypot(across.x, across.y)).toBeCloseTo((10 * Math.SQRT2) / TILE_WIDTH);
  });

  it("shows the sprite as is when shadows point straight up the screen", () => {
    const up = { dirX: Math.SQRT1_2, dirY: Math.SQRT1_2, stretch: 1, alpha: 0.3 };
    const point = apply(getSilhouetteMatrix(up, foot, 0, TILE_METRICS), 10, 0);
    const screen = toScreen(point.x - foot.x, point.y - foot.y);

    expect(screen.x).toBeCloseTo(10);
    expect(screen.y).toBeCloseTo(0);
  });

  it("lays pixels above the foot along the shadow, one block of height reaching stretch × block", () => {
    const matrix = getSilhouetteMatrix(projection, foot, 0, TILE_METRICS);
    const top = apply(matrix, 0, -BOX_HEIGHT);
    const reach = projection.stretch * BLOCK_HEIGHT_IN_TILES;

    expect(top.x).toBeCloseTo(foot.x + projection.dirX * reach);
    expect(top.y).toBeCloseTo(foot.y + projection.dirY * reach);
  });

  it("moves the shadow further away on a lower plane, by the caster's lift", () => {
    const onOwnPlane = apply(getSilhouetteMatrix(projection, foot, 0, TILE_METRICS), 0, 0);
    const twoBelow = apply(getSilhouetteMatrix(projection, foot, 2, TILE_METRICS), 0, 0);
    const reach = 2 * projection.stretch * BLOCK_HEIGHT_IN_TILES;

    expect(twoBelow.x - onOwnPlane.x).toBeCloseTo(projection.dirX * reach);
    expect(twoBelow.y - onOwnPlane.y).toBeCloseTo(projection.dirY * reach);
  });
});
