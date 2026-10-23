import { describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => {
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
    public dynamic: boolean;
    public update = vi.fn();
    public destroy = vi.fn();

    constructor({ source, frame, dynamic = false }: { source: unknown; frame: Rectangle; dynamic?: boolean }) {
      this.source = source;
      this.frame = frame;
      this.dynamic = dynamic;
    }
  }

  return { Rectangle, Texture };
});

import type { Texture, TextureSource } from "pixi.js";
import { createTexturePool } from "./texture-pool";

const sourceA = { id: "a" } as unknown as TextureSource;
const sourceB = { id: "b" } as unknown as TextureSource;
const frameOf = ({ frame: { x, y, width, height } }: Texture) => ({ x, y, width, height });

describe("createTexturePool", () => {
  it("creates a dynamic texture over the source with the frame when none was released", () => {
    const pool = createTexturePool();

    const texture = pool.acquire(sourceA, { x: 1, y: 2, width: 3, height: 4 });

    expect(texture.source).toBe(sourceA);
    expect(texture.dynamic).toBe(true);
    expect(frameOf(texture)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(pool.size).toBe(0);
  });

  it("hands a released texture out again over the same source, with the new frame, never destroying it", () => {
    const pool = createTexturePool();
    const texture = pool.acquire(sourceA, { x: 1, y: 2, width: 3, height: 4 });
    pool.release(texture);
    expect(pool.size).toBe(1);

    const again = pool.acquire(sourceA, { x: 5, y: 6, width: 7, height: 8 });

    expect(again).toBe(texture);
    expect(frameOf(again)).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(again.update).toHaveBeenCalledTimes(1);
    expect(again.destroy).not.toHaveBeenCalled();
    expect(pool.size).toBe(0);
  });

  it("keeps the released textures of each source apart", () => {
    const pool = createTexturePool();
    const overA = pool.acquire(sourceA, { x: 0, y: 0, width: 1, height: 1 });
    pool.release(overA);

    const overB = pool.acquire(sourceB, { x: 0, y: 0, width: 1, height: 1 });

    expect(overB).not.toBe(overA);
    expect(overB.source).toBe(sourceB);
    expect(pool.size).toBe(1);
  });
});
