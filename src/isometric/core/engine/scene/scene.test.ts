import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadedTextures = new Map<string, { source: string }>();
const renderCalls: Array<{ texture: { source: string }; elevation: number; height?: number }> = [];

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
  renderBlock: vi.fn(
    (
      _container: unknown,
      texture: { source: string },
      box: { box: { elevation: number } },
      _tileWidth: number,
      _tileHeight: number,
      _boxHeight: number,
      _tint: unknown,
      height?: number,
    ) => {
      renderCalls.push({ texture, elevation: box.box.elevation, height });
    },
  ),
}));

import { Assets } from "pixi.js";
import { Entity } from "../entities";
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
            spawnChance: 1,
            surface: "grass",
          },
          boxes[0].elevation,
        ),
      ]
    : [];

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

  it("loads the three block SVGs and renders all material layers", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, createTestEntities);

    expect(Assets.load).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/statue/block.svg");
    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls.some(({ texture }) => texture.source.includes("water"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("ground"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("grass"))).toBe(true);
    expect(renderCalls.some(({ texture, height }) => texture.source.includes("statue") && height === 1)).toBe(true);

    destroyScene();

    expect(Assets.unload).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/water/block.svg");
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