import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
vi.mock("./band-atlas", () => ({
  createBandAtlas: vi.fn((_renderer: unknown, block: { source: string }) => ({
    block,
    textureAt: vi.fn((x: number, deep: boolean) => ({ source: `bands:${x & 1},${deep}` })),
    draw: vi.fn(),
    destroy: vi.fn(),
  })),
}));

import {
  loadedTextures,
  mountScene,
  renderCalls,
  resetHarness,
  TEST_TERRAIN,
  worldFrom,
} from "../flow-check/scene-harness";
import { TILE_METRICS } from "../constants";
import { createTerrainView } from "../terrain-view";
import type { TerrainAppearance, TerrainBands } from "../../types";
import { createBandAtlas } from "./band-atlas";
import { BAND_REFRESH_MS, createSurfaceBands } from "./surface-bands";

const BANDS: TerrainBands = { count: 3, width: 0.5, alpha: 0.2, period: 9000, deepBelow: -1, deep: 0.5 };
const WITH_BANDS: TerrainAppearance = { ...TEST_TERRAIN, water: { ...TEST_TERRAIN.water, bands: BANDS } };

type TestAtlas = {
  block: unknown;
  textureAt: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};
const atlas = (call = 0) => vi.mocked(createBandAtlas).mock.results[call].value as TestAtlas;

// Two water columns, at the first level and deeper, and land.
const world = () =>
  worldFrom([
    { x: 0, y: 0, elevation: -1 },
    { x: 1, y: 0, elevation: -3 },
    { x: 0, y: 1, elevation: 1 },
  ]);

describe("createSurfaceBands", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("makes an atlas of each material with bands and draws it at once", async () => {
    const { renderer, scene } = await mountScene(world(), [createSurfaceBands()], { terrain: WITH_BANDS });

    expect(createBandAtlas).toHaveBeenCalledTimes(1);
    expect(createBandAtlas).toHaveBeenCalledWith(
      renderer,
      loadedTextures.get("/assets/water/block.svg"),
      BANDS,
      TILE_METRICS,
    );
    expect(atlas().draw).toHaveBeenCalledWith(0);
    scene.destroy();
    expect(atlas().destroy).toHaveBeenCalledTimes(1);
  });

  it("gives terrain-view the atlas textures of the water, deep under deepBelow, and its own to the rest", async () => {
    const { scene } = await mountScene(world(), [createSurfaceBands(), createTerrainView()], { terrain: WITH_BANDS });

    const water = renderCalls.filter(({ texture }) => texture.source.startsWith("bands:"));
    expect(water.map(({ texture, elevation }) => [texture.source, elevation])).toEqual(
      expect.arrayContaining([
        ["bands:0,false", -1],
        ["bands:1,true", -3],
      ]),
    );
    expect(renderCalls.some(({ texture }) => texture.source === "/assets/grass/block.svg")).toBe(true);
    scene.destroy();
  });

  it("redraws every BAND_REFRESH_MS with the real time elapsed", async () => {
    const record = vi.fn();
    let clock = 0;
    const { ticker, scene } = await mountScene(world(), [createSurfaceBands()], {
      terrain: WITH_BANDS,
      profiler: { now: () => (clock += 1), record },
    });
    const { draw } = atlas();
    draw.mockClear();

    ticker.frame(BAND_REFRESH_MS / 2);
    expect(draw).not.toHaveBeenCalled();
    ticker.frame(BAND_REFRESH_MS / 2);
    expect(draw).toHaveBeenCalledWith(BAND_REFRESH_MS);
    ticker.frame(BAND_REFRESH_MS + 5);
    expect(draw).toHaveBeenLastCalledWith(2 * BAND_REFRESH_MS + 5);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(record.mock.calls.map(([label]) => label as string)).toContain("surface-bands:draw");
    scene.destroy();
  });

  it("provides nothing when no material has bands, or its SVG does not load", async () => {
    const plain = await mountScene(world(), [createSurfaceBands(), createTerrainView()]);
    expect(createBandAtlas).not.toHaveBeenCalled();
    expect(plain.scene.services.terrainSurfaces).toBeUndefined();
    expect(renderCalls.every(({ texture }) => !texture.source.startsWith("bands:"))).toBe(true);
    plain.scene.destroy();

    const { Assets } = await import("pixi.js");
    vi.mocked(Assets.load).mockImplementationOnce(() => Promise.resolve(undefined as never));
    const unloaded = await mountScene(world(), [createSurfaceBands()], { terrain: WITH_BANDS });
    expect(createBandAtlas).not.toHaveBeenCalled();
    expect(unloaded.scene.services.terrainSurfaces).toBeUndefined();
    unloaded.scene.destroy();
  });

  it("refuses bands that cannot be drawn, naming the material and every problem", async () => {
    const terrain = { ...TEST_TERRAIN, water: { ...TEST_TERRAIN.water, bands: { ...BANDS, count: 0, alpha: 0 } } };

    await expect(mountScene(world(), [createSurfaceBands()], { terrain })).rejects.toThrow(
      'Terrain "water": bands.count must be a positive integer (got 0); bands.alpha must be in (0, 1] (got 0)',
    );
  });
});
