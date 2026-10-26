import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every mocked Pixi object the atlas made, by kind, in order. */
const made = vi.hoisted(() => ({
  containers: [] as Array<Record<string, unknown>>,
  tiles: [] as Array<Record<string, unknown>>,
  textures: [] as Array<Record<string, unknown>>,
  atlases: [] as Array<Record<string, unknown>>,
}));

vi.mock("pixi.js", () => {
  const point = () => {
    const value = { x: 0, y: 0, set: vi.fn((x: number, y: number) => Object.assign(value, { x, y })) };
    return value;
  };
  class Container {
    public children: unknown[] = [];
    public position = point();
    public matrix: unknown;
    public destroy = vi.fn();
    constructor() {
      made.containers.push(this as unknown as Record<string, unknown>);
    }
    addChild(...children: unknown[]): void {
      this.children.push(...children);
    }
    setFromMatrix(matrix: unknown): void {
      this.matrix = matrix;
    }
  }
  return {
    Container,
    Matrix: vi.fn(function (a: number, b: number, c: number, d: number, tx: number, ty: number) {
      return { a, b, c, d, tx, ty };
    }),
    Rectangle: vi.fn(function (x: number, y: number, width: number, height: number) {
      return { x, y, width, height };
    }),
    BufferImageSource: vi.fn(function (options: {
      resource: Uint8Array;
      width: number;
      height: number;
      addressMode: string;
    }) {
      return { options };
    }),
    Texture: class {
      public source: unknown;
      public frame: unknown;
      public destroy = vi.fn();
      constructor({ source, frame }: { source: unknown; frame?: unknown }) {
        this.source = source;
        this.frame = frame;
        made.textures.push(this as unknown as Record<string, unknown>);
      }
    },
    Sprite: vi.fn(function (texture: unknown) {
      return { texture };
    }),
    TilingSprite: class {
      public texture: unknown;
      public width: number;
      public height: number;
      public alpha = 1;
      public tileScale = point();
      public tilePosition = point();
      constructor({ texture, width, height }: { texture: unknown; width: number; height: number }) {
        this.texture = texture;
        this.width = width;
        this.height = height;
        made.tiles.push(this as unknown as Record<string, unknown>);
      }
    },
    RenderTexture: {
      create: vi.fn((options: Record<string, unknown>) => {
        const atlas = { ...options, source: { updateMipmaps: vi.fn() }, destroy: vi.fn() };
        made.atlases.push(atlas);
        return atlas;
      }),
    },
  };
});

import { TILE_METRICS } from "../constants";
import { BAND_REPEAT_TILES, getBandDrift, getBandLight } from "../waves";
import type { TerrainBands } from "../../types";
import { BAND_ATLAS_PADDING, BAND_STRIP_TEXELS, createBandAtlas } from "./band-atlas";

const BANDS: TerrainBands = { count: 3, width: 0.5, alpha: 0.2, period: 9000, deepBelow: -1, deep: 0.5 };
// A block texture 160 × 133 (the tile at zoom 4), at resolution 1.5.
const BLOCK = { width: 160, height: 133, source: { resolution: 1.5 } };
const CELL = { width: 160 + BAND_ATLAS_PADDING, height: 133 + BAND_ATLAS_PADDING };

type Frame = { x: number; y: number; width: number; height: number };
type Matrix = { a: number; b: number; c: number; d: number; tx: number; ty: number };
const create = () => {
  const renderer = { render: vi.fn() };
  const atlas = createBandAtlas(renderer, BLOCK as never, BANDS, TILE_METRICS);
  const target = made.atlases[0] as {
    source: { updateMipmaps: ReturnType<typeof vi.fn> };
    destroy: ReturnType<typeof vi.fn>;
  };
  return { renderer, atlas, target };
};

describe("createBandAtlas", () => {
  beforeEach(() => {
    made.containers.length = 0;
    made.tiles.length = 0;
    made.textures.length = 0;
    made.atlases.length = 0;
  });

  it("holds four copies of the block, apart, with mipmaps, at the block's resolution", () => {
    create();

    expect(made.atlases[0]).toMatchObject({
      width: 2 * CELL.width,
      height: 2 * CELL.height,
      resolution: 1.5,
      autoGenerateMipmaps: true,
    });
  });

  it("gives a block the copy of its column's parity, shallow or deep, negative columns too", () => {
    const { atlas, target } = create();
    const frameOf = (x: number, deep: boolean) => {
      const texture = atlas.textureAt(x, deep) as unknown as { source: unknown; frame: Frame };
      expect(texture.source).toBe((target as unknown as { source: unknown }).source);
      return [texture.frame.x / CELL.width, texture.frame.y / CELL.height, texture.frame.width, texture.frame.height];
    };

    expect(frameOf(0, false)).toEqual([0, 0, 160, 133]);
    expect(frameOf(1, false)).toEqual([1, 0, 160, 133]);
    expect(frameOf(3, false)).toEqual([1, 0, 160, 133]);
    expect(frameOf(-1, true)).toEqual([1, 1, 160, 133]);
    expect(frameOf(-2, true)).toEqual([0, 1, 160, 133]);
  });

  it("draws the bands from one strip of light that repeats every two tiles", () => {
    create();
    const strip = made.textures[0] as {
      source: { options: { resource: Uint8Array; width: number; height: number; addressMode: string } };
    };
    const { resource, width, height, addressMode } = strip.source.options;

    expect([width, height, addressMode]).toEqual([BAND_STRIP_TEXELS, 1, "repeat"]);
    for (const texel of [0, 40, 43, 128, 200]) {
      const light = getBandLight(BANDS, ((texel + 0.5) / BAND_STRIP_TEXELS) * BAND_REPEAT_TILES);
      expect([...resource.slice(texel * 4, texel * 4 + 4)]).toEqual([255, 255, 255, Math.round(255 * light)]);
    }
    expect(made.tiles).toHaveLength(4);
    made.tiles.forEach((tile, index) => {
      expect(tile).toMatchObject({ texture: strip, width: 1, height: 1 });
      expect(tile.tileScale).toMatchObject({ x: BAND_REPEAT_TILES / BAND_STRIP_TEXELS, y: 1 });
      // The two shallow copies first, then the two deep ones, fainter.
      expect(tile.alpha).toBeCloseTo(index < 2 ? BANDS.alpha : BANDS.alpha * BANDS.deep, 12);
    });
  });

  it("lays the light on the top of each copy: the tile's unit square on its rhombus", () => {
    create();
    // The copy containers (root first), each holding the block sprite and the top in tile space.
    const copies = made.containers.filter(
      (container) => container.children instanceof Array && (container.children as unknown[]).length === 2,
    );
    expect(copies).toHaveLength(4);
    const onTop = (copies[0].children as Array<{ matrix?: Matrix }>)[1];
    const { a, b, c, d, tx, ty } = onTop.matrix as Matrix;
    const at = (u: number, v: number) => [a * u + c * v + tx, b * u + d * v + ty];
    const top = (TILE_METRICS.tileHeight * 160) / TILE_METRICS.tileWidth;

    expect(at(0, 0)).toEqual([80, top]); // bottom corner
    expect(at(1, 0)).toEqual([160, top / 2]); // right corner: +x
    expect(at(0, 1)).toEqual([0, top / 2]); // left corner: +y
    expect(at(1, 1)).toEqual([80, 0]); // top corner
    expect(
      copies.map(({ position }) => [(position as Frame).x / CELL.width, (position as Frame).y / CELL.height]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it("redraws with the bands drifted to the time, in one render, then its mipmaps", () => {
    const { renderer, atlas, target } = create();

    atlas.draw(2500);

    made.tiles.forEach((tile, index) => {
      const column = index & 1;
      const drift = getBandDrift(BANDS, 2500, index >= 2);
      expect((tile.tilePosition as { x: number }).x).toBeCloseTo(drift - column, 12);
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledWith({ container: made.containers[0], target, clear: true });
    expect(target.source.updateMipmaps).toHaveBeenCalledTimes(1);
  });

  it("destroys what it made, not the block", () => {
    const { atlas, target } = create();

    atlas.destroy();

    expect(made.containers[0].destroy).toHaveBeenCalledWith({ children: true });
    made.textures.forEach((texture, index) =>
      expect(texture.destroy).toHaveBeenCalledWith(...(index === 0 ? [true] : [])),
    );
    expect(target.destroy).toHaveBeenCalledWith(true);
  });
});
