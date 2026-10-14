import { describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => {
  class Sprite {
    public texture: unknown;
    public width = 0;
    public height = 0;
    public tint = 0xffffff;
    public zIndex = 0;
    public anchor = { set: vi.fn() };
    public position = { set: vi.fn() };

    constructor(texture: unknown) {
      this.texture = texture;
    }
  }

  class Graphics {
    public poly = vi.fn(() => this);
    public stroke = vi.fn(() => this);
  }

  class Rectangle {
    public x: number;
    public y: number;
    public width: number;
    public height: number;

    constructor(x: number, y: number, width: number, height: number) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }

  class Texture {
    public source: unknown;
    public frame: Rectangle;

    constructor({ source, frame }: { source: unknown; frame: Rectangle }) {
      this.source = source;
      this.frame = frame;
    }
  }

  return { Graphics, Rectangle, Sprite, Texture };
});

import { Box } from "../entities";
import { getFootprintSliceTiles, renderBlock } from "./render";

const carTexture = {
  id: "car",
  width: 1536,
  height: 1109,
  source: { id: "car-source" },
  frame: { x: 0, y: 0, width: 1536, height: 1109 },
};

type TestSprite = {
  texture: { frame?: { x: number; width: number } };
  width: number;
  height: number;
  tint: number;
  zIndex: number;
  anchor: { set: ReturnType<typeof vi.fn> };
  position: { set: ReturnType<typeof vi.fn> };
};

describe("getFootprintSliceTiles", () => {
  it("maps each half-tile slice to the nearest footprint tile", () => {
    expect(getFootprintSliceTiles(1, "x")).toEqual([0]);
    expect(getFootprintSliceTiles(2, "x")).toEqual([0, 0, 1]);
    expect(getFootprintSliceTiles(3, "x")).toEqual([0, 0, 1, 2]);
  });

  it("starts from the right on the y axis, where the anchor is", () => {
    expect(getFootprintSliceTiles(3, "y")).toEqual([2, 1, 0, 0]);
  });
});

describe("renderBlock", () => {
  it("configures and adds a positioned block sprite", () => {
    const children: unknown[] = [];
    const container = { addChild: (child: unknown) => children.push(child) };
    const box = {
      x: 2,
      y: 1,
      box: new Box(2, 1, { elevation: 3 }),
      screenX: 120,
      baseScreenY: 170,
      screenY: 140,
    };

    const sprite = renderBlock(
      container as never,
      { id: "grass" } as never,
      box,
      40,
      20,
      13,
      0x88aaff,
    )[0] as unknown as TestSprite;

    expect(children).toEqual([sprite]);
    expect(sprite.width).toBe(40);
    expect(sprite.height).toBe(33);
    expect(sprite.tint).toBe(0x88aaff);
    expect(sprite.anchor.set).toHaveBeenCalledWith(0.5, 0);
    expect(sprite.position.set).toHaveBeenCalledWith(120, 130);
    expect(sprite.zIndex).toBeCloseTo(170.0032);
  });

  it("keeps the default tint when no tint is provided", () => {
    const container = { addChild: vi.fn() };
    const box = {
      x: 0,
      y: 0,
      box: new Box(0, 0),
      screenX: 10,
      baseScreenY: 20,
      screenY: 20,
    };

    const sprite = renderBlock(
      container as never,
      { id: "ground" } as never,
      box,
      40,
      20,
      13,
    )[0] as unknown as { tint: number };

    expect(sprite.tint).toBe(0xffffff);
  });

  it("supports a two-block-high sprite", () => {
    const sprite = renderBlock(
      { addChild: vi.fn() } as never,
      { id: "tree" } as never,
      {
        x: 0,
        y: 0,
        box: new Box(0, 0),
        screenX: 10,
        baseScreenY: 20,
        screenY: 20,
      },
      40,
      20,
      13,
      undefined,
      2,
    )[0] as unknown as {
      height: number;
      position: { set: ReturnType<typeof vi.fn> };
    };

    expect(sprite.height).toBe(46);
    expect(sprite.position.set).toHaveBeenCalledWith(10, -26);
  });

  it("aligns a one-block entity with the block's top diamond", () => {
    const sprite = renderBlock(
      { addChild: vi.fn() } as never,
      { id: "entity" } as never,
      {
        x: 0,
        y: 0,
        box: new Box(0, 0),
        screenX: 10,
        baseScreenY: 20,
        screenY: 20,
      },
      40,
      20,
      13,
      undefined,
      1,
      true,
    )[0] as unknown as { position: { set: ReturnType<typeof vi.fn> } };

    expect(sprite.position.set).toHaveBeenCalledWith(10, -3);
  });

  it("slices a multi-block entity into half-tile strips across its footprint", () => {
    const children: unknown[] = [];
    const sprites = renderBlock(
      { addChild: (child: unknown) => children.push(child) } as never,
      carTexture as never,
      {
        x: 0,
        y: 0,
        box: new Box(0, 0),
        screenX: 10,
        baseScreenY: 20,
        screenY: 20,
      },
      40,
      20,
      13,
      0x88aaff,
      1,
      true,
      2,
    ) as unknown as TestSprite[];

    // A 2-tile footprint spans 60px: three 20px strips starting at x = 20 - 30.
    expect(children).toEqual(sprites);
    expect(sprites).toHaveLength(3);
    sprites.forEach((sprite, index) => {
      expect(sprite.width).toBe(20);
      expect(sprite.height).toBeCloseTo(43.3203);
      expect(sprite.tint).toBe(0x88aaff);
      expect(sprite.anchor.set).toHaveBeenCalledWith(0, 0);
      expect(sprite.position.set).toHaveBeenCalledWith(-10 + index * 20, -13);
      expect(sprite.texture.frame?.x).toBeCloseTo(index * 512);
      expect(sprite.texture.frame?.width).toBeCloseTo(512);
    });
    // The first two strips belong to the anchor tile, the last one to the farther tile.
    expect(sprites[0].zIndex).toBeCloseTo(20);
    expect(sprites[1].zIndex).toBeCloseTo(20);
    expect(sprites[2].zIndex).toBeCloseTo(10.0001);
  });

  it("reuses the strip textures of a texture", () => {
    const render = () => renderBlock(
      { addChild: vi.fn() } as never,
      carTexture as never,
      { x: 0, y: 0, box: new Box(0, 0), screenX: 10, baseScreenY: 20, screenY: 20 },
      40,
      20,
      13,
      undefined,
      1,
      true,
      2,
    ) as unknown as TestSprite[];

    expect(render()[2].texture).toBe(render()[2].texture);
  });

  it("positions a multi-block entity along the y axis", () => {
    const sprite = renderBlock(
      { addChild: vi.fn() } as never,
      carTexture as never,
      {
        x: 0,
        y: 0,
        box: new Box(0, 0),
        screenX: 10,
        baseScreenY: 20,
        screenY: 20,
      },
      40,
      20,
      13,
      undefined,
      1,
      true,
      2,
      false,
      "y",
    ) as unknown as TestSprite[];

    // Centre at x = 0, so the strips start at -30; the anchor tile is on the right.
    expect(sprite.map(({ position }) => position.set.mock.calls[0])).toEqual([
      [-30, -13],
      [-10, -13],
      [10, -13],
    ]);
    expect(sprite.map(({ zIndex }) => zIndex)).toEqual([10, 20, 20]);
  });

  it("draws a debug footprint when enabled", () => {
    const children: unknown[] = [];
    const container = { addChild: (child: unknown) => children.push(child) };

    renderBlock(
      container as never,
      carTexture as never,
      {
        x: 0,
        y: 0,
        box: new Box(0, 0),
        screenX: 10,
        baseScreenY: 20,
        screenY: 20,
      },
      40,
      20,
      13,
      undefined,
      1,
      true,
      2,
      true,
    );

    expect(children).toHaveLength(4);
    const debugGraphics = children[3] as {
      poly: ReturnType<typeof vi.fn>;
      stroke: ReturnType<typeof vi.fn>;
    };
    expect(debugGraphics.poly).toHaveBeenNthCalledWith(1, [
      { x: 10, y: 10 },
      { x: 30, y: 20 },
      { x: 10, y: 30 },
      { x: -10, y: 20 },
    ]);
    expect(debugGraphics.poly).toHaveBeenNthCalledWith(2, [
      { x: 10, y: -3 },
      { x: 30, y: 7 },
      { x: 10, y: 17 },
      { x: -10, y: 7 },
    ]);
    expect(debugGraphics.poly).toHaveBeenNthCalledWith(3, [
      { x: 30, y: 0 },
      { x: 50, y: 10 },
      { x: 30, y: 20 },
      { x: 10, y: 10 },
    ]);
    expect(debugGraphics.poly).toHaveBeenNthCalledWith(4, [
      { x: 30, y: -13 },
      { x: 50, y: -3 },
      { x: 30, y: 7 },
      { x: 10, y: -3 },
    ]);
    expect(debugGraphics.stroke).toHaveBeenCalledWith({ color: 0xff00ff, width: 1 });
  });
});