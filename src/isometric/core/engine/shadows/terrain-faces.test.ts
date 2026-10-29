import { describe, expect, it, vi } from "vitest";
vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
import type { Sprite } from "pixi.js";
import { TILE_METRICS } from "../constants";
import { DAY_SHADOW_PROJECTION } from "../lighting";
import { createTerrainFaceShadows } from "./terrain-faces";

it("bakes both exposed wall orientations with height-aware terrain rays", () => {
  const renderer = { render: vi.fn() };
  const sampleTerrain = vi.fn(() => 1);
  const atlas = createTerrainFaceShadows(
    [
      { x: 0, y: 0, axis: "x", top: 1, bottom: 0.5 },
      { x: 0, y: 0, axis: "y", top: 0.5, bottom: 0 },
    ],
    {
      renderer: renderer as never,

      filters: [],

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
  atlas.draw(null, DAY_SHADOW_PROJECTION);
  expect(sampleTerrain).toHaveBeenCalledTimes(256);
  expect(renderer.render).toHaveBeenCalledTimes(4);
  atlas.destroy();
});

describe("empty face atlas", () => {
  it("has no receiver levels and can be released safely", () => {
    const atlas = createTerrainFaceShadows([], {
      renderer: { render: vi.fn() } as never,

      filters: [],

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

    filters: [],

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

      filters: [],

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
    .map(
      ([call]) =>
        (call as { container: { children?: { filterArea?: { height: number } }[] } }).container.children?.[1]
          ?.filterArea,
    )
    .filter(Boolean);
  expect(areas.some((area) => area!.height < 90)).toBe(true);
  atlas.destroy();
});

it("replaces each receiver slot before repainting so repeated draws cannot accumulate darkness", () => {
  const renderer = { render: vi.fn() };
  const atlas = createTerrainFaceShadows([{ x: 0, y: 0, axis: "x", top: 1, bottom: 0.5 }], {
    renderer: renderer as never,

    filters: [],

    metrics: TILE_METRICS,
    projection: { ...TILE_METRICS, originX: 0, originY: 0 },
    sampleTerrain: () => 1,
  });
  atlas.draw(0.5, DAY_SHADOW_PROJECTION);
  atlas.draw(0.5, DAY_SHADOW_PROJECTION);
  const { container } = renderer.render.mock.calls[1][0] as { container: { children: { children: Sprite[] }[] } };
  expect(container.children[0].children[0].blendMode).toBe("erase");
  expect(container.children[0].children[0].visible).toBe(true);
  atlas.destroy();
});

it("reuses clipped caster meshes directly on walls instead of sampling a lower horizontal plane", () => {
  const renderer = { render: vi.fn() };
  const display = { left: -10, top: -40, width: 20, height: 40 };
  const caster = {
    worldFoot: { x: 0, y: 0 },
    screenFoot: { x: 0, y: 0 },
    display,
    texture: {} as never,
    body: {} as never,
    bodyDisplay: display,
    sources: [],
    depth: 0,
  };
  const atlas = createTerrainFaceShadows([{ x: 1, y: 0, axis: "x", top: 3, bottom: 0 }], {
    renderer: renderer as never,

    filters: [],

    metrics: TILE_METRICS,
    projection: { ...TILE_METRICS, originX: 0, originY: 0 },
  });
  const light = { dirX: 1, dirY: 0, stretch: 2, alpha: 0.34 };
  atlas.draw(0, light, [caster]);
  atlas.draw(0, light, [caster], [0]);
  atlas.draw(null, light, [caster], [0]);
  const { container } = renderer.render.mock.calls[0][0] as {
    container: { children: { children: { visible: boolean; tint: number }[] }[] };
  };
  const mesh = container.children[1].children[1];
  expect(mesh.tint).toBe(0);
  expect(mesh.visible).toBe(true);
  atlas.draw(0, { ...light, dirX: -1 }, [caster], [0]);
  expect(mesh.visible).toBe(false);
  atlas.destroy();
});

it("shares one terrain skyline query across every height in a wall column", async () => {
  const { createTerrainShadowSampler } = await import("../lighting");
  const field = createTerrainShadowSampler({
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    topHeightAt: (x) => (x === 1 ? 3 : 0),
  });
  const horizon = vi.spyOn(field, "horizon");
  const atlas = createTerrainFaceShadows([{ x: 1, y: 0, axis: "x", top: 3, bottom: 0 }], {
    renderer: { render: vi.fn() } as never,
    filters: [],
    metrics: TILE_METRICS,
    projection: { ...TILE_METRICS, originX: 0, originY: 0 },
    sampleTerrain: field,
  });
  atlas.draw(null, DAY_SHADOW_PROJECTION);
  expect(horizon).toHaveBeenCalledTimes(8);
  atlas.destroy();
});

it("samples only visible walls and refreshes a newly revealed wall under the same light", () => {
  const sampleTerrain = vi.fn(() => 1);
  const atlas = createTerrainFaceShadows(
    [0, 1].map((x) => ({ x, y: 0, axis: "x" as const, top: 1, bottom: 0 })),
    {
      renderer: { render: vi.fn() } as never,
      filters: [],
      metrics: TILE_METRICS,
      projection: { ...TILE_METRICS, originX: 0, originY: 0 },
      sampleTerrain,
    },
  );
  atlas.views[1].view.culled = true;
  atlas.draw(null, DAY_SHADOW_PROJECTION);
  expect(sampleTerrain).toHaveBeenCalledTimes(64);
  atlas.draw(null, DAY_SHADOW_PROJECTION);
  expect(sampleTerrain).toHaveBeenCalledTimes(64);
  atlas.views[0].view.culled = true;
  atlas.views[1].view.culled = false;
  atlas.draw(null, DAY_SHADOW_PROJECTION);
  expect(sampleTerrain).toHaveBeenCalledTimes(128);
  atlas.destroy();
});

it("caches the walls within a caster's maximum reach across phase frames", async () => {
  const lighting = await import("../lighting");
  const original = lighting.createWallShadowProjector(TILE_METRICS);
  const project = Object.assign(vi.fn(original), { positions: original.positions, uvs: original.uvs });
  const factory = vi.spyOn(lighting, "createWallShadowProjector").mockReturnValueOnce(project);
  const display = { left: -10, top: -40, width: 20, height: 40 };
  const caster = {
    worldFoot: { x: 0, y: 0 },
    screenFoot: { x: 0, y: 0 },
    display,
    texture: {} as never,
    body: {} as never,
    bodyDisplay: display,
    sources: [],
    depth: 0,
  };
  const atlas = createTerrainFaceShadows(
    [1, 100].map((x) => ({ x, y: 0, axis: "x" as const, top: 1, bottom: x === 100 ? 0.5 : 0 })),
    {
      renderer: { render: vi.fn() } as never,
      filters: [],
      metrics: TILE_METRICS,
      projection: { ...TILE_METRICS, originX: 0, originY: 0 },
    },
  );
  atlas.draw(null, DAY_SHADOW_PROJECTION, [caster], [0]);
  atlas.draw(null, { ...DAY_SHADOW_PROJECTION, dirX: 1, dirY: 0 }, [caster], [0]);
  expect(project).toHaveBeenCalledTimes(2);
  expect(project.mock.calls.every(([face]) => face.x === 1)).toBe(true);
  atlas.views[0].view.culled = true;
  atlas.draw(null, DAY_SHADOW_PROJECTION, [caster], [0]);
  expect(project).toHaveBeenCalledTimes(2);
  atlas.views[0].view.culled = false;
  atlas.draw(0, DAY_SHADOW_PROJECTION, [caster], [100]);
  expect(project).toHaveBeenCalledTimes(3);
  atlas.destroy();
  factory.mockRestore();
});
