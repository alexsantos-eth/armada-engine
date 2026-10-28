import { describe, expect, it, vi } from "vitest";
vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
import type { Sprite } from "pixi.js";
import { TILE_METRICS } from "../constants";
import { DAY_SHADOW_PROJECTION } from "../lighting";
import { createTerrainFaceShadows } from "./terrain-faces";

it("bakes both exposed wall orientations from the entity plane and height-aware terrain rays", () => {
  const renderer = { render: vi.fn() };
  const sampleTerrain = vi.fn(() => 1);
  const atlas = createTerrainFaceShadows(
    [
      { x: 0, y: 0, axis: "x", top: 1, bottom: 0.5 },
      { x: 0, y: 0, axis: "y", top: 0.5, bottom: 0 },
    ],
    {
      renderer: renderer as never,
      scratch: {} as never,
      filters: [],
      area: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      metrics: TILE_METRICS,
      projection: { ...TILE_METRICS, originX: 0, originY: 0, elevationStep: TILE_METRICS.boxHeight },
      sampleTerrain,
    },
  );
  expect(atlas.levels).toEqual([0, 0.5]);
  expect(atlas.views).toHaveLength(2);
  expect(vi.mocked((atlas.views[0].view as Sprite).setFromMatrix)).toHaveBeenCalled();
  atlas.clear();
  atlas.draw(0.5, DAY_SHADOW_PROJECTION);
  atlas.draw(0, { ...DAY_SHADOW_PROJECTION, dirX: 1, dirY: 0 });
  expect(sampleTerrain).toHaveBeenCalledTimes(128);
  expect(renderer.render).toHaveBeenCalledTimes(3);
  atlas.destroy();
});

describe("empty face atlas", () => {
  it("has no receiver levels and can be released safely", () => {
    const atlas = createTerrainFaceShadows([], {
      renderer: { render: vi.fn() } as never,
      scratch: {} as never,
      filters: [],
      area: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      metrics: TILE_METRICS,
      projection: { ...TILE_METRICS, originX: 0, originY: 0 },
      sampleTerrain: () => 0,
    });
    expect(atlas.levels).toEqual([]);
    atlas.clear();
    atlas.begin();
    atlas.commit();
    atlas.cancel();
    atlas.draw(0, DAY_SHADOW_PROJECTION);
    atlas.destroy();
  });
});

it("projects a moving caster onto walls without adding a second terrain shadow", () => {
  const renderer = { render: vi.fn() };
  const atlas = createTerrainFaceShadows([{ x: 0, y: 0, axis: "x", top: 1, bottom: 0.5 }], {
    renderer: renderer as never,
    scratch: {} as never,
    filters: [],
    area: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    metrics: TILE_METRICS,
    projection: { ...TILE_METRICS, originX: 0, originY: 0, elevationStep: TILE_METRICS.boxHeight },
  });
  atlas.draw(0.5, DAY_SHADOW_PROJECTION);
  atlas.draw(5, DAY_SHADOW_PROJECTION);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  atlas.destroy(false);
});

it("stages a wall atlas before publishing it and filters only the active receiver rows", () => {
  const renderer = { render: vi.fn() };
  const atlas = createTerrainFaceShadows(
    Array.from({ length: 70 }, (_, index) => ({
      x: index,
      y: 0,
      axis: "x" as const,
      top: index < 35 ? 1 : 2,
      bottom: index < 35 ? 0.5 : 1.5,
    })),
    {
      renderer: renderer as never,
      scratch: {} as never,
      filters: [],
      area: { minX: -1, minY: -1, maxX: 72, maxY: 1 },
      metrics: TILE_METRICS,
      projection: { ...TILE_METRICS, originX: 0, originY: 0 },
      sampleTerrain: () => 0,
    },
  );
  atlas.commit();
  expect(renderer.render).not.toHaveBeenCalled();
  atlas.begin();
  atlas.clear();
  atlas.draw(0.5, DAY_SHADOW_PROJECTION);
  atlas.draw(1.5, DAY_SHADOW_PROJECTION);
  atlas.begin();
  atlas.commit();
  atlas.cancel();
  atlas.clear();
  const areas = renderer.render.mock.calls
    .map(([call]) => (call as { container: { filterArea?: { height: number } } }).container.filterArea)
    .filter(Boolean);
  expect(areas.some((area) => area!.height < 90)).toBe(true);
  atlas.destroy();
});
