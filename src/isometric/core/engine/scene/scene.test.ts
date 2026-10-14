import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadedTextures = new Map<string, { source: string }>();
const renderCalls: Array<{
  texture: { source: string };
  elevation: number;
  tint: number | undefined;
  height?: number;
  length?: number;
}> = [];

vi.mock("pixi.js", () => {
  class Container {
    public sortableChildren = false;
    public children: unknown[] = [];

    addChild(child: unknown): void {
      this.children.push(child);
    }

    destroy(): void {}
  }

  return {
    Assets: {
      load: vi.fn(async (source: string) => {
        const texture = { source };
        loadedTextures.set(source, texture);
        return texture;
      }),
      unload: vi.fn(async () => undefined),
    },
    Container,
  };
});

vi.mock("../render", () => ({
  createSvgColorVariant: vi.fn(async (source: string) => source),
  renderBlock: vi.fn(
    (
      _container: unknown,
      texture: { source: string },
      box: { box: { elevation: number } },
      _tileWidth: number,
      _tileHeight: number,
      _boxHeight: number,
      tint: number | undefined,
      height?: number,
      _surfaceAligned?: boolean,
      length?: number,
    ) => {
      renderCalls.push({ texture, elevation: box.box.elevation, tint, height, length });
    },
  ),
}));

import { Assets } from "pixi.js";
import { Entity } from "../entities";
import { createSvgColorVariant } from "../render";
import { getOrCreateTerrain } from "../terrain";
import { createIsometricScene } from "./scene";

const createTestEntities = (boxes: { x: number; y: number; elevation: number }[]) =>
  boxes.length > 0
    ? [
        new Entity(
          boxes[0].x,
          boxes[0].y,
          {
            id: "statue",
            textureSource: "/assets/statue/block.svg",
            height: 1,
            length: 2,
            spawnChance: 1,
            surface: "grass",
          },
          boxes[0].elevation,
        ),
      ]
    : [];

const createColorizedEntities = (boxes: { x: number; y: number; elevation: number }[]) =>
  boxes.slice(0, 2).map((box, index) => new Entity(
    box.x,
    box.y,
    {
      id: `house-${index}`,
      textureSource: "/assets/house/block.svg",
      height: 1,
      spawnChance: 1,
      surface: "grass",
      colorReplacements: {
        "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"],
      },
    },
    box.elevation,
  ));

describe("createIsometricScene", () => {
  beforeEach(() => {
    loadedTextures.clear();
    renderCalls.length = 0;
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the terrain block SVGs and renders all material layers", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, createTestEntities);

    expect(Assets.load).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/sand/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/statue/block.svg");
    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls.some(({ texture }) => texture.source.includes("water"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("ground"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("grass"))).toBe(true);
    expect(renderCalls.some(({ texture, elevation, tint }) =>
      texture.source.includes("grass") && elevation > 0 && tint !== undefined,
    )).toBe(true);
    expect(renderCalls.some(({ texture, elevation, tint }) =>
      texture.source.includes("ground") && elevation >= 0 && tint !== 0xe8ffb0,
    )).toBe(true);
    expect(new Set(
      renderCalls
        .filter(({ elevation, tint }) => elevation > 0 && tint !== undefined)
        .map(({ tint }) => tint),
    ).size).toBeGreaterThan(1);
    expect(renderCalls.some(({ texture, height }) => texture.source.includes("statue") && height === 1)).toBe(true);
    expect(renderCalls.some(({ texture, length }) => texture.source.includes("statue") && length === 2)).toBe(true);

    destroyScene();

    expect(Assets.unload).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/sand/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/statue/block.svg");
  });

  it("does not render when a required texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementationOnce(
      async () => undefined as never,
    );
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, createTestEntities);

    expect(renderCalls).toHaveLength(0);
    destroyScene();
  });

  it("creates one colorized SVG variant per entity instance", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, createColorizedEntities);

    expect(createSvgColorVariant).toHaveBeenCalledTimes(2);
    expect(createSvgColorVariant).toHaveBeenNthCalledWith(
      1,
      "/assets/house/block.svg",
      { "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] },
    );
    expect(createSvgColorVariant).toHaveBeenNthCalledWith(
      2,
      "/assets/house/block.svg",
      { "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] },
    );

    destroyScene();
  });

  it("handles a terrain without positive elevations", async () => {
    const terrain = getOrCreateTerrain();
    const originalTerrain = [...terrain];
    terrain.splice(0, terrain.length, { x: 0, y: 0, elevation: 0 });

    try {
      const app = {
        screen: { width: 1300, height: 1000 },
        stage: { addChild: vi.fn() },
      };

      const destroyScene = await createIsometricScene(app as never, () => []);

      expect(renderCalls.some(({ texture, tint }) =>
        texture.source.includes("grass") && tint === undefined,
      )).toBe(true);
      destroyScene();
    } finally {
      terrain.splice(0, terrain.length, ...originalTerrain);
    }
  });

  it("renders sand only on the shore of a landmass", async () => {
    const terrain = getOrCreateTerrain();
    const originalTerrain = [...terrain];
    terrain.splice(
      0,
      terrain.length,
      { x: 0, y: 0, elevation: -1 },
      { x: 1, y: 0, elevation: 0 },
      { x: 2, y: 0, elevation: 0 },
      { x: 3, y: 0, elevation: 0 },
      { x: 5, y: 0, elevation: 2 },
      { x: 7, y: 0, elevation: -1 },
      { x: 8, y: 0, elevation: 0 },
      { x: 9, y: 0, elevation: -1 },
    );

    try {
      const app = {
        screen: { width: 1300, height: 1000 },
        stage: { addChild: vi.fn() },
      };

      const destroyScene = await createIsometricScene(app as never, () => []);
      const topCalls = renderCalls.filter(({ elevation }) => elevation === 0);

      // (1,0) is the shore of the (2,0)–(3,0) landmass → sand; (2,0) and (3,0) → grass;
      // (5,0) is taller → ground at 0; (8,0) is an islet in the water → grass, not sand.
      expect(topCalls.map(({ texture }) => texture.source).sort()).toEqual([
        "/assets/grass/block.svg",
        "/assets/grass/block.svg",
        "/assets/grass/block.svg",
        "/assets/ground/block.svg",
        "/assets/sand/block.svg",
      ]);
      const sand = topCalls.find(({ texture }) => texture.source.includes("sand"));
      const grass = topCalls.find(({ texture }) => texture.source.includes("grass"));
      expect(sand?.tint).toBeDefined();
      expect(sand?.tint).not.toBe(grass?.tint);
      destroyScene();
    } finally {
      terrain.splice(0, terrain.length, ...originalTerrain);
    }
  });

  it("skips an entity when its configured texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementation(async (source) => {
      const assetSource = source as unknown as string;
      if (assetSource.includes("/statue/")) return undefined as never;
      return { source: assetSource } as never;
    });
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, createTestEntities);

    expect(renderCalls.some(({ texture }) => texture.source.includes("tree"))).toBe(false);
    destroyScene();
  });
});