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

vi.mock("../render", async (importOriginal) => ({
  pickColorVariation: (await importOriginal<typeof import("../render")>()).pickColorVariation,
  createSvgColorVariant: vi.fn(async (source: string, _replacements?: unknown, variation = 0) =>
    _replacements ? `${source}#${variation}` : source),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the terrain block SVGs and renders all material layers", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, { createEntities: createTestEntities });

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

    const destroyScene = await createIsometricScene(app as never, { createEntities: createTestEntities });

    expect(renderCalls).toHaveLength(0);
    destroyScene();
  });

  it("creates one colorized SVG variant per entity type and variation", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, {
      createEntities: createColorizedEntities,
    });

    // Two different types → one variant each, with a seeded variation index.
    expect(createSvgColorVariant).toHaveBeenCalledTimes(2);
    vi.mocked(createSvgColorVariant).mock.calls.forEach(([source, replacements, variation]) => {
      expect(source).toBe("/assets/house/block.svg");
      expect(replacements).toEqual({ "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] });
      expect([0, 1, 2]).toContain(variation);
    });

    destroyScene();
  });

  it("shares variant textures between instances of the same type", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };
    const definition = {
      id: "house",
      textureSource: "/assets/house/block.svg",
      height: 1,
      spawnChance: 1,
      surface: "grass" as const,
      colorReplacements: { "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] },
    };

    const destroyScene = await createIsometricScene(app as never, {
      createEntities: (boxes) =>
        boxes.slice(0, 40).map((box) => new Entity(box.x, box.y, definition, box.elevation)),
    });

    const sources = vi.mocked(createSvgColorVariant).mock.calls.map(([, , variation]) => variation);
    expect(sources.length).toBeLessThanOrEqual(3);
    expect(new Set(sources).size).toBe(sources.length);
    expect(
      renderCalls.filter(({ texture }) => texture.source.startsWith("/assets/house/")).length,
    ).toBeGreaterThan(sources.length);

    destroyScene();
  });

  it("rebuilds the same world from the same seed without Math.random", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };
    const randomSpy = vi.spyOn(Math, "random");
    const rolls: number[][] = [];
    const recordRolls = (_boxes: unknown, random: () => number) => {
      rolls.push([random(), random(), random()]);
      return [];
    };

    (await createIsometricScene(app as never, { seed: 7, createEntities: recordRolls }))();
    const firstRender = renderCalls.splice(0).map(({ elevation }) => elevation);
    (await createIsometricScene(app as never, { seed: 7, createEntities: recordRolls }))();
    const secondRender = renderCalls.splice(0).map(({ elevation }) => elevation);
    (await createIsometricScene(app as never, { seed: 8, createEntities: recordRolls }))();
    const otherRender = renderCalls.splice(0).map(({ elevation }) => elevation);

    expect(secondRender).toEqual(firstRender);
    expect(rolls[1]).toEqual(rolls[0]);
    expect(otherRender).not.toEqual(firstRender);
    expect(rolls[2]).not.toEqual(rolls[0]);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it("places the configured entities by default", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never);

    expect(Assets.load).toHaveBeenCalledWith("/assets/grass/block.svg");
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

      const destroyScene = await createIsometricScene(app as never, { createEntities: () => [] });

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

      const destroyScene = await createIsometricScene(app as never, { createEntities: () => [] });
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

    const destroyScene = await createIsometricScene(app as never, { createEntities: createTestEntities });

    expect(renderCalls.some(({ texture }) => texture.source.includes("tree"))).toBe(false);
    destroyScene();
  });
});