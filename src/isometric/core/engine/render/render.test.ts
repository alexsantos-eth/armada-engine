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

  return { Sprite };
});

import { Box } from "../entities";
import { renderBlock } from "./render";

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
    ) as unknown as {
      width: number;
      height: number;
      tint: number;
      zIndex: number;
      anchor: { set: ReturnType<typeof vi.fn> };
      position: { set: ReturnType<typeof vi.fn> };
    };

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
    ) as unknown as { tint: number };

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
    ) as unknown as {
      height: number;
      position: { set: ReturnType<typeof vi.fn> };
    };

    expect(sprite.height).toBe(46);
    expect(sprite.position.set).toHaveBeenCalledWith(10, -26);
  });
});