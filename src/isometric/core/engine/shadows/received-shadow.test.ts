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

  class Container {
    public children: unknown[] = [];
    public filters: unknown[] | undefined;
    public filterArea: unknown;
    public visible = true;
    public destroy = vi.fn();

    addChild(...children: unknown[]): void {
      this.children.push(...children);
    }
  }

  class Sprite {
    public texture: Texture;
    public x = 0;
    public y = 0;
    public width = 0;
    public height = 0;
    public tint = 0xffffff;
    public blendMode = "normal";
    public visibleWrites: boolean[] = [];
    public anchor = { x: 0, y: 0 };
    public position = { set: vi.fn((x: number, y: number) => Object.assign(this, { x, y })) };
    public scale = { x: 1, y: 1, set: vi.fn((x: number, y = x) => Object.assign(this.scale, { x, y })) };

    constructor(texture: Texture) {
      this.texture = texture;
    }

    set visible(value: boolean) {
      this.visibleWrites.push(value);
    }

    get visible(): boolean {
      return this.visibleWrites.at(-1) ?? true;
    }
  }

  return {
    Container,
    Rectangle,
    RenderTexture: {
      create: vi.fn((options: { width: number; height: number }) => ({
        ...options,
        source: { renderTarget: true },
        destroy: vi.fn(),
      })),
    },
    Sprite,
    Texture,
  };
});

import { Rectangle, RenderTexture, Sprite, Texture } from "pixi.js";
import type { Silhouette } from "./silhouette";
import {
  createReceivedShadows,
  RECEIVED_SHADOW_ATLAS_WIDTH,
  RECEIVED_SHADOW_BLEED,
  RECEIVED_SHADOW_PADDING,
  RECEIVED_SHADOW_RESOLUTION,
  type ShadowReceiver,
} from "./received-shadow";
import { createTexturePool } from "./texture-pool";

const RES = RECEIVED_SHADOW_RESOLUTION;
const PAD = RECEIVED_SHADOW_PADDING;

type MockSprite = Sprite & { visibleWrites: boolean[]; blendMode: string };
type MockContainer = {
  children: unknown[];
  filters?: unknown[];
  filterArea?: unknown;
  destroy: ReturnType<typeof vi.fn>;
};
type RenderCall = { container: MockContainer; target: unknown; clear: boolean; clearColor: number[] };

/** An entity sprite drawn at `left, top` with `width × height` px, standing on `screenFoot`. */
const silhouetteOf = (
  left: number,
  top: number,
  width: number,
  height: number,
  worldFoot = { x: 0, y: 0 },
  depth = 0,
): Silhouette => {
  const source = new Sprite(
    new Texture({ source: { id: "entity" } as never, frame: new Rectangle(0, 0, 4 * width, 4 * height) }),
  );
  Object.assign(source, { x: left, y: top, width, height });
  const footY = top + height - 10;
  return {
    source,
    depth,
    // Cropped at its foot, from a texture with a frame offset in its source.
    sprite: new Sprite(
      new Texture({ source: { id: "silhouette" } as never, frame: new Rectangle(8, 4, 2 * width, 2 * (height - 10)) }),
    ),
    worldFoot,
    screenFoot: { x: left + width / 2, y: footY },
    display: { left, top, width, height: height - 10 },
  };
};

const createRenderer = () => ({ render: vi.fn<(options: RenderCall) => void>() });

const twoReceivers = (): ShadowReceiver[] => {
  const caster = silhouetteOf(0, 0, 20, 50, { x: 0, y: 0 });
  return [
    { own: silhouetteOf(100, 0, 20, 40, { x: 2, y: 2 }, 7), casters: [{ silhouette: caster, lift: 0 }] },
    { own: silhouetteOf(200, 0, 30, 30, { x: 3, y: 3 }, 9), casters: [{ silhouette: caster, lift: 1 }] },
  ];
};

describe("createReceivedShadows", () => {
  it("packs one padded square per receiver at RECEIVED_SHADOW_RESOLUTION, in one atlas", () => {
    const renderer = createRenderer();
    const shadows = createReceivedShadows(twoReceivers(), renderer as never, [], createTexturePool());
    const frames = shadows.views.map(({ view }) => (view as Sprite).texture.frame);

    expect(frames).toEqual([
      new Rectangle(PAD, PAD, 20 * RES, 40 * RES),
      new Rectangle(2 * PAD + 20 * RES, PAD, 30 * RES, 30 * RES),
    ]);
    expect(shadows.atlas).toMatchObject({ width: 3 * PAD + 50 * RES, height: 2 * PAD + 40 * RES });
    expect(shadows.views.every(({ view }) => (view as Sprite).texture.source === shadows.atlas.source)).toBe(true);
  });

  it("starts a new row of squares when one would pass RECEIVED_SHADOW_ATLAS_WIDTH", () => {
    const wide = RECEIVED_SHADOW_ATLAS_WIDTH / (2 * RES);
    const receivers = [0, 1].map(() => ({ own: silhouetteOf(0, 0, wide, 20), casters: [] }));
    const shadows = createReceivedShadows(receivers, createRenderer() as never, [], createTexturePool());
    const frames = shadows.views.map(({ view }) => (view as Sprite).texture.frame);

    expect(frames[1]).toMatchObject({ x: PAD, y: 2 * PAD + 20 * RES });
    expect(shadows.atlas).toMatchObject({ width: 2 * PAD + wide * RES, height: 3 * PAD + 40 * RES });
  });

  it("shows each receiver's square over its sprite, with its depth", () => {
    const shadows = createReceivedShadows(twoReceivers(), createRenderer() as never, [], createTexturePool());
    const [first] = shadows.views;
    const view = first.view as Sprite;

    expect(first.depth).toBe(7);
    expect(view.position.set).toHaveBeenCalledWith(100, 0);
    expect(view.scale.set).toHaveBeenCalledWith(1 / RES);
  });

  it("computes once a mask that is opaque everywhere but on the receivers", () => {
    const renderer = createRenderer();
    const receivers = twoReceivers();
    createReceivedShadows(receivers, renderer as never, [], createTexturePool());
    const [{ container, target, clearColor }] = renderer.render.mock.calls[0];
    const cutouts = container.children as MockSprite[];

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(clearColor).toEqual([0, 0, 0, 1]);
    expect(target).toBe(vi.mocked(RenderTexture.create).mock.results.at(-1)?.value);
    expect(cutouts.map(({ texture }) => texture)).toEqual(receivers.map(({ own }) => own.source.texture));
    expect(cutouts.every(({ blendMode }) => blendMode === "erase")).toBe(true);
    expect(cutouts[1]).toMatchObject({ x: 2 * PAD + 20 * RES, y: PAD, width: 30 * RES, height: 30 * RES });
    expect(container.destroy).toHaveBeenCalledWith({ children: true });
  });

  it("draws the black casters with the given filters, then erases the mask, into the atlas", () => {
    const renderer = createRenderer();
    const filters = [{ blur: true }, { alpha: true }];
    const shadows = createReceivedShadows(twoReceivers(), renderer as never, filters as never, createTexturePool());

    shadows.draw(null);
    const { container, target, clear, clearColor } = renderer.render.mock.calls[1][0];
    const [casters, erase] = container.children as [MockContainer, MockSprite];

    expect(target).toBe(shadows.atlas);
    expect({ clear, clearColor }).toEqual({ clear: true, clearColor: [0, 0, 0, 0] });
    expect(casters).toBe(shadows.casters);
    expect(casters.filters).toEqual(filters);
    expect(casters.filterArea).toEqual(new Rectangle(0, 0, shadows.atlas.width, shadows.atlas.height));
    expect(erase.blendMode).toBe("erase");
    expect(erase.texture).toBe(renderer.render.mock.calls[0][0].target);
    expect(casters.children).toHaveLength(2);
    (casters.children as MockSprite[]).forEach((sprite) => {
      expect(sprite.tint).toBe(0x000000);
      expect(sprite.texture.dynamic).toBe(true);
      expect(sprite.texture.source).toEqual({ id: "silhouette" });
      expect(sprite.visibleWrites).toEqual([false]);
    });
  });

  it("lays a caster on its receiver's square, moved by the offset and cropped around the square", () => {
    const renderer = createRenderer();
    const receivers = twoReceivers();
    const shadows = createReceivedShadows(receivers, renderer as never, [], createTexturePool());
    const offsetOf = vi.fn(() => ({ x: -90, y: 25 }));

    shadows.draw(offsetOf);
    const [sprite] = shadows.casters.children as MockSprite[];
    const { frame } = sprite.texture;

    expect(offsetOf).toHaveBeenCalledWith({ x: 0, y: 0 }, { x: 2, y: 2 }, 0);
    expect(offsetOf).toHaveBeenCalledWith({ x: 0, y: 0 }, { x: 3, y: 3 }, 1);
    // Caster display (0, 0, 20 × 40) with foot (10, 40); receiver foot (110, 30): the silhouette
    // lands at (110 − 10 − 90, 30 − 40 + 25) = (10, 15) px, 90 px left of the receiver at x 100.
    // In the atlas it starts at PAD − 180 texels, so only the bleed beside the square is kept.
    const x = PAD + (10 - 100) * RES;
    const y = PAD + 15 * RES;
    expect(sprite.visibleWrites).toEqual([false]);
    expect(sprite.texture.update).not.toHaveBeenCalled();

    offsetOf.mockReturnValue({ x: 5, y: 25 });
    shadows.draw(offsetOf);
    // Now at (105, 15) px: x = PAD + 10 texels, cropped at the right and bottom of the square plus the bleed.
    const left = PAD + 5 * RES;
    const bottom = PAD + 40 * RES + RECEIVED_SHADOW_BLEED;
    expect(x).toBeLessThan(PAD - RECEIVED_SHADOW_BLEED - 20 * RES);
    expect(sprite.visibleWrites).toEqual([false, true]);
    expect(sprite.position.set).toHaveBeenLastCalledWith(left, y);
    expect(sprite.scale).toMatchObject({ x: (20 * RES) / 40, y: (40 * RES) / 80 });
    expect(frame.x).toBeCloseTo(8);
    expect(frame.y).toBeCloseTo(4);
    expect(frame.width).toBeCloseTo(((PAD + 20 * RES + RECEIVED_SHADOW_BLEED - left) / (20 * RES)) * 40);
    expect(frame.height).toBeCloseTo(((bottom - y) / (40 * RES)) * 80);
    expect(sprite.texture.update).toHaveBeenCalled();
  });

  it("crops the side and top of a caster that runs past the square", () => {
    const shadows = createReceivedShadows(twoReceivers(), createRenderer() as never, [], createTexturePool());
    const [sprite] = shadows.casters.children as MockSprite[];

    // At (90, −20) px: 10 px left of the square, 20 px above it.
    shadows.draw(() => ({ x: -10, y: -10 }));

    expect(sprite.position.set).toHaveBeenLastCalledWith(PAD - RECEIVED_SHADOW_BLEED, PAD - RECEIVED_SHADOW_BLEED);
    expect(sprite.texture.frame.x).toBeCloseTo(8 + ((10 * RES - RECEIVED_SHADOW_BLEED) / (20 * RES)) * 40);
    expect(sprite.texture.frame.y).toBeCloseTo(4 + ((20 * RES - RECEIVED_SHADOW_BLEED) / (40 * RES)) * 80);
  });

  it("hides a caster that does not shade its receiver, writing visibility only on change", () => {
    const shadows = createReceivedShadows(twoReceivers(), createRenderer() as never, [], createTexturePool());
    const [sprite] = shadows.casters.children as MockSprite[];

    shadows.draw(() => ({ x: 0, y: 0 }));
    shadows.draw(() => ({ x: 0, y: 0 }));
    shadows.draw(() => null);
    shadows.draw(() => null);

    expect(sprite.visibleWrites).toEqual([false, true, false]);
  });

  it("destroys the atlas, the mask and the casters, and gives the caster textures back to the pool", () => {
    const renderer = createRenderer();
    const textures = createTexturePool();
    const shadows = createReceivedShadows(twoReceivers(), renderer as never, [], textures);
    shadows.draw(null);
    const root = renderer.render.mock.calls[1][0].container;
    const mask = renderer.render.mock.calls[0][0].target as { destroy: ReturnType<typeof vi.fn> };
    const casterTextures = (shadows.casters.children as MockSprite[]).map(({ texture }) => texture);

    shadows.destroy();

    expect(root.destroy).toHaveBeenCalledWith({ children: true });
    casterTextures.forEach((texture) => expect(texture.destroy).not.toHaveBeenCalled());
    expect(textures.size).toBe(casterTextures.length);
    shadows.views.forEach(({ view }) => expect((view as Sprite).texture.destroy).toHaveBeenCalled());
    expect(mask.destroy).toHaveBeenCalledWith(true);
    expect(shadows.atlas.destroy).toHaveBeenCalledWith(true);
    // The atlas goes before the views' textures: its source drops their listeners at once.
    const atlasOrder = (shadows.atlas.destroy as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    shadows.views.forEach(({ view }) =>
      expect(
        ((view as Sprite).texture.destroy as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
      ).toBeGreaterThan(atlasOrder),
    );
  });

  it("reuses the caster textures a destroyed set gave back", () => {
    const textures = createTexturePool();
    const receivers = twoReceivers();
    const first = createReceivedShadows(receivers, createRenderer() as never, [], textures);
    const given = (first.casters.children as MockSprite[]).map(({ texture }) => texture);
    first.destroy();

    const second = createReceivedShadows(receivers, createRenderer() as never, [], textures);

    const reused = (second.casters.children as MockSprite[]).map(({ texture }) => texture);
    expect(reused).toHaveLength(given.length);
    reused.forEach((texture) => expect(given).toContain(texture));
    expect(textures.size).toBe(0);
  });
});
