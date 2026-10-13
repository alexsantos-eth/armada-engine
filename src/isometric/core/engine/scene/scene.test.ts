import { beforeEach, describe, expect, it, vi } from "vitest";

const loadedTextures = new Map<string, { source: string }>();
const renderCalls: Array<{ texture: { source: string }; elevation: number }> = [];

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
    ) => {
      renderCalls.push({ texture, elevation: box.box.elevation });
    },
  ),
}));

import { Assets } from "pixi.js";
import { createIsometricScene } from "./scene";

describe("createIsometricScene", () => {
  beforeEach(() => {
    loadedTextures.clear();
    renderCalls.length = 0;
    vi.clearAllMocks();
  });

  it("loads the three block SVGs and renders all material layers", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never);

    expect(Assets.load).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls.some(({ texture }) => texture.source.includes("water"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("ground"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("grass"))).toBe(true);

    destroyScene();

    expect(Assets.unload).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/water/block.svg");
  });

  it("does not render when a required texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementationOnce(
      async () => undefined as never,
    );
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never);

    expect(renderCalls).toHaveLength(0);
    destroyScene();
  });
});