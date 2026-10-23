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

import { Graphics, Sprite } from "pixi.js";
import { Box } from "../terrain";
import { createBlockViews, getBlockDepth, getFootprintSliceTiles, type RenderBlockOptions } from "./render";

const depths = new WeakMap<object, number>();
const depthOf = (view: unknown) => depths.get(view as object);

/** Adds a block's views to `container` as the scene does and returns its sprites. */
function renderViews(container: { addChild: (child: never) => unknown }, options: RenderBlockOptions) {
  const views = createBlockViews(options);
  views.forEach(({ view, depth }) => {
    depths.set(view, depth);
    container.addChild(view as never);
  });
  return views.filter(({ view }) => !(view instanceof Graphics)).map(({ view }) => view);
}

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

describe("createBlockViews", () => {
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

    const sprite = renderViews(container, {
      texture: { id: "grass" } as never,
      box,
      metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
      tint: 0x88aaff,
    })[0] as unknown as TestSprite;

    expect(children).toEqual([sprite]);
    expect(sprite.width).toBe(40);
    expect(sprite.height).toBe(33);
    expect(sprite.tint).toBe(0x88aaff);
    expect(sprite.anchor.set).toHaveBeenCalledWith(0.5, 0);
    expect(sprite.position.set).toHaveBeenCalledWith(120, 130);
    expect(depthOf(sprite)).toBeCloseTo(170.0032);
    // Depth never goes through zIndex, which would make Pixi sort the whole container.
    expect(sprite.zIndex).toBe(0);
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

    const sprite = renderViews(container, {
      texture: { id: "ground" } as never,
      box,
      metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
    })[0] as unknown as { tint: number };

    expect(sprite.tint).toBe(0xffffff);
  });

  it("supports a two-block-high sprite", () => {
    const sprite = renderViews(
      { addChild: vi.fn() },
      {
        texture: { id: "tree" } as never,
        box: {
          x: 0,
          y: 0,
          box: new Box(0, 0),
          screenX: 10,
          baseScreenY: 20,
          screenY: 20,
        },
        metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
        height: 2,
      },
    )[0] as unknown as {
      height: number;
      position: { set: ReturnType<typeof vi.fn> };
    };

    expect(sprite.height).toBe(46);
    expect(sprite.position.set).toHaveBeenCalledWith(10, -26);
  });

  it("aligns a one-block entity with the block's top diamond", () => {
    const sprite = renderViews(
      { addChild: vi.fn() },
      {
        texture: { id: "entity" } as never,
        box: {
          x: 0,
          y: 0,
          box: new Box(0, 0),
          screenX: 10,
          baseScreenY: 20,
          screenY: 20,
        },
        metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
        height: 1,
        surfaceAligned: true,
      },
    )[0] as unknown as { position: { set: ReturnType<typeof vi.fn> } };

    expect(sprite.position.set).toHaveBeenCalledWith(10, -3);
  });

  it("slices a multi-block entity into half-tile strips across its footprint", () => {
    const children: unknown[] = [];
    const sprites = renderViews(
      { addChild: (child: unknown) => children.push(child) },
      {
        texture: carTexture as never,
        box: {
          x: 0,
          y: 0,
          box: new Box(0, 0),
          screenX: 10,
          baseScreenY: 20,
          screenY: 20,
        },
        metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
        tint: 0x88aaff,
        height: 1,
        surfaceAligned: true,
        length: 2,
      },
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
    expect(depthOf(sprites[0])).toBeCloseTo(20);
    expect(depthOf(sprites[1])).toBeCloseTo(20);
    expect(depthOf(sprites[2])).toBeCloseTo(10.0001);
  });

  it("reuses the strip textures of a texture", () => {
    const render = () =>
      renderViews(
        { addChild: vi.fn() },
        {
          texture: carTexture as never,
          box: { x: 0, y: 0, box: new Box(0, 0), screenX: 10, baseScreenY: 20, screenY: 20 },
          metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
          height: 1,
          surfaceAligned: true,
          length: 2,
        },
      ) as unknown as TestSprite[];

    expect(render()[2].texture).toBe(render()[2].texture);
  });

  it("takes every sprite, strips too, from the given source", () => {
    const made: Sprite[] = [];
    const sprites = {
      take: vi.fn((texture: never) => {
        const sprite = new Sprite(texture);
        made.push(sprite);
        return sprite;
      }),
    };
    const box = { x: 0, y: 0, box: new Box(0, 0), screenX: 10, baseScreenY: 20, screenY: 20 };
    const metrics = { tileWidth: 40, tileHeight: 20, boxHeight: 13 };

    const block = createBlockViews({ texture: carTexture as never, box, metrics, sprites });
    const car = createBlockViews({ texture: carTexture as never, box, metrics, length: 2, sprites });

    expect(sprites.take).toHaveBeenCalledTimes(4);
    expect(sprites.take).toHaveBeenNthCalledWith(1, carTexture);
    expect([...block, ...car].map(({ view }) => view)).toEqual(made);
    // A kept sprite may carry the tint of a block it drew before: always set.
    expect((block[0].view as unknown as TestSprite).tint).toBe(0xffffff);
  });

  it("positions a multi-block entity along the y axis", () => {
    const sprite = renderViews(
      { addChild: vi.fn() },
      {
        texture: carTexture as never,
        box: {
          x: 0,
          y: 0,
          box: new Box(0, 0),
          screenX: 10,
          baseScreenY: 20,
          screenY: 20,
        },
        metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
        height: 1,
        surfaceAligned: true,
        length: 2,
        debug: false,
        lengthAxis: "y",
      },
    ) as unknown as TestSprite[];

    // Centre at x = 0, so the strips start at -30; the anchor tile is on the right.
    expect(sprite.map(({ position }) => position.set.mock.calls[0] as number[])).toEqual([
      [-30, -13],
      [-10, -13],
      [10, -13],
    ]);
    expect(sprite.map(depthOf)).toEqual([10, 20, 20]);
  });

  it("draws a debug footprint when enabled", () => {
    const children: unknown[] = [];
    const container = { addChild: (child: unknown) => children.push(child) };

    renderViews(container, {
      texture: carTexture as never,
      box: {
        x: 0,
        y: 0,
        box: new Box(0, 0),
        screenX: 10,
        baseScreenY: 20,
        screenY: 20,
      },
      metrics: { tileWidth: 40, tileHeight: 20, boxHeight: 13 },
      height: 1,
      surfaceAligned: true,
      length: 2,
      debug: true,
    });

    expect(children).toHaveLength(4);
    expect(depthOf(children[3])).toBeCloseTo((depthOf(children[0]) as number) + 0.0001);
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

describe("getBlockDepth", () => {
  const metrics = { tileWidth: 40, tileHeight: 20, boxHeight: 40 / 3 };
  const at = (x: number, y: number, elevation: number, baseScreenY: number) => ({
    x,
    y,
    screenX: 0,
    screenY: 0,
    baseScreenY,
    box: new Box(x, y, { elevation }),
  });

  it("orders by ground position, then elevation, then x", () => {
    expect(getBlockDepth(at(2, 3, 1, 100), metrics)).toBeCloseTo(100 + 0.001 + 0.0002);
    expect(getBlockDepth(at(2, 3, 1, 110), metrics)).toBeGreaterThan(getBlockDepth(at(2, 3, 1, 100), metrics));
  });

  it("gives the depth of another tile of a footprint along its axis", () => {
    const box = at(2, 3, 0, 100);

    expect(getBlockDepth(box, metrics, 2, "x")).toBeCloseTo(100 - 20 + 0.0004);
    expect(getBlockDepth(box, metrics, 2, "y")).toBeCloseTo(100 - 20 + 0.0002);
  });

  it("matches the depth createBlockViews gives a sprite", () => {
    const box = at(4, 1, 2, 90);
    const [{ depth }] = createBlockViews({ texture: carTexture as never, box, metrics });

    expect(depth).toBe(getBlockDepth(box, metrics));
  });
});
