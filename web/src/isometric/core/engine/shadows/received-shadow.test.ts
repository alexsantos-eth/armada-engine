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
    public pivot = { x: 0, y: 0, set: vi.fn((x: number, y = x) => Object.assign(this.pivot, { x, y })) };
    public skewWrites: number[] = [];
    public skew = {
      writes: this.skewWrites,
      value: 0,
      get x() {
        return this.value;
      },
      set x(value: number) {
        this.value = value;
        this.writes.push(value);
      },
    };

    constructor(texture?: Texture) {
      this.texture = texture as Texture;
    }

    setSize(width: number, height: number): void {
      Object.assign(this, { width, height });
    }

    set visible(value: boolean) {
      this.visibleWrites.push(value);
    }

    get visible(): boolean {
      return this.visibleWrites.at(-1) ?? true;
    }
  }

  class Matrix {
    set(): this {
      return this;
    }
  }

  return {
    Container,
    BufferImageSource: class {
      public update = vi.fn();
      public resource: Uint8ClampedArray;
      constructor(options: { resource: Uint8ClampedArray }) {
        this.resource = options.resource;
      }
    },
    Matrix,
    Rectangle,
    RenderTexture: {
      create: vi.fn((options: { width: number; height: number }) => {
        const texture = {
          ...options,
          source: { renderTarget: true },
          destroy: vi.fn(),
          resize: vi.fn((width: number, height: number) => Object.assign(texture, { width, height })),
        };
        return texture;
      }),
    },
    Sprite,
    Texture,
  };
});

import { Rectangle, RenderTexture, Sprite, Texture } from "pixi.js";
import type { Silhouette } from "./silhouette";
import {
  createReceivedShadowRig,
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
type MockRenderTexture = {
  width: number;
  height: number;
  dynamic?: boolean;
  destroy: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
};

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
    sources: [source],
    body: source.texture,
    bodyDisplay: { left, top, width, height },
    depth,
    // Cropped at its foot, from a texture with a frame offset in its source.
    texture: new Texture({
      source: { id: "silhouette" } as never,
      frame: new Rectangle(8, 4, 2 * width, 2 * (height - 10)),
    }),
    worldFoot,
    screenFoot: { x: left + width / 2, y: footY },
    display: { left, top, width, height: height - 10 },
  };
};

const createRenderer = () => ({ render: vi.fn<(options: RenderCall) => void>() });

/** The sprites a rig lends its draws, in the order it made them. */
const spritesOf = (rig: ReturnType<typeof createReceivedShadowRig>) =>
  (rig.casters.container as unknown as MockContainer).children as MockSprite[];

/** Received shadows of `receivers`, drawn with a rig of their own. */
const atlasOf = (
  receivers: readonly ShadowReceiver[],
  renderer = createRenderer(),
  textures = createTexturePool(),
  filters: unknown[] = [],
) => {
  const rig = createReceivedShadowRig(renderer as never, filters as never);
  return { rig, renderer, textures, shadows: createReceivedShadows(receivers, rig, textures) };
};

const twoReceivers = (): ShadowReceiver[] => {
  const caster = silhouetteOf(0, 0, 20, 50, { x: 0, y: 0 });
  return [
    { own: silhouetteOf(100, 0, 20, 40, { x: 2, y: 2 }, 7), casters: [{ silhouette: caster, lift: 0 }] },
    { own: silhouetteOf(200, 0, 30, 30, { x: 3, y: 3 }, 9), casters: [{ silhouette: caster, lift: 1 }] },
  ];
};

describe("createReceivedShadowRig", () => {
  it("holds the casters with the given filters, then the eraser, in its root", () => {
    const filters = [
      { blur: true, padding: 3 },
      { alpha: true, padding: 1 },
    ];
    const rig = createReceivedShadowRig(createRenderer() as never, filters as never);
    const root = rig.root as unknown as MockContainer;

    expect(root.children).toEqual([rig.casters.container, rig.eraser]);
    expect((rig.casters.container as unknown as MockContainer).filters).toEqual(filters);
    expect((rig.eraser as MockSprite).blendMode).toBe("erase");
    expect(rig.padding).toBe(4);
    // The eraser shows the rig's one mask, which can grow.
    expect(rig.eraser.texture).toBe(vi.mocked(RenderTexture.create).mock.results.at(-1)?.value);
    expect(rig.eraser.texture).toMatchObject({ dynamic: true });
  });

  it("draws a mask opaque everywhere but on the cutouts, grown to the largest atlas", () => {
    const renderer = createRenderer();
    const rig = createReceivedShadowRig(renderer as never, []);
    const mask = rig.eraser.texture as unknown as MockRenderTexture;
    const [first, second] = twoReceivers().map(({ own }) => own.body);

    rig.drawMask(100, 50, [first, second], new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]));
    const [{ container, target, clear, clearColor }] = renderer.render.mock.calls[0];
    const cutouts = container.children as MockSprite[];

    expect(target).toBe(mask);
    expect({ clear, clearColor }).toEqual({ clear: true, clearColor: [0, 0, 0, 1] });
    expect(cutouts.map(({ texture }) => texture)).toEqual([first, second]);
    expect(cutouts.every(({ blendMode }) => blendMode === "erase")).toBe(true);
    expect(cutouts[1]).toMatchObject({ x: 5, y: 6, width: 7, height: 8 });
    expect(mask).toMatchObject({ width: 100, height: 50 });

    // A smaller atlas keeps the mask as it is and hides the cutouts it does not use, writing only changes.
    rig.drawMask(60, 80, [second], new Float64Array([9, 10, 11, 12]));
    rig.drawMask(60, 80, [second, first], new Float64Array([9, 10, 11, 12, 1, 2, 3, 4]));
    rig.drawMask(10, 10, [second], new Float64Array([9, 10, 11, 12]));
    rig.drawMask(10, 10, [second], new Float64Array([9, 10, 11, 12]));

    expect(mask).toMatchObject({ width: 100, height: 80 });
    expect(mask.resize).toHaveBeenCalledTimes(2);
    expect(container.children).toHaveLength(2);
    expect(cutouts[0]).toMatchObject({ texture: second, x: 9, y: 10, width: 11, height: 12 });
    expect(cutouts[1].visibleWrites).toEqual([false, true, false]);
  });

  it("destroys its root with the sprites, its cutouts and its mask, not the casters' textures", () => {
    const renderer = createRenderer();
    const rig = createReceivedShadowRig(renderer as never, []);
    const mask = rig.eraser.texture as unknown as MockRenderTexture;
    rig.drawMask(10, 10, [], new Float64Array());

    rig.destroy();

    expect(rig.root.destroy).toHaveBeenCalledWith({ children: true });
    expect(renderer.render.mock.calls[0][0].container.destroy).toHaveBeenCalledWith({ children: true });
    expect(mask.destroy).toHaveBeenCalledWith(true);
  });
});

describe("createReceivedShadows", () => {
  it("packs one padded square per receiver at RECEIVED_SHADOW_RESOLUTION, in one atlas", () => {
    const { shadows } = atlasOf(twoReceivers());
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
    const { shadows } = atlasOf(receivers);
    const frames = shadows.views.map(({ view }) => (view as Sprite).texture.frame);

    expect(frames[1]).toMatchObject({ x: PAD, y: 2 * PAD + 20 * RES });
    expect(shadows.atlas).toMatchObject({ width: 2 * PAD + wide * RES, height: 3 * PAD + 40 * RES });
  });

  it("shows each receiver's square over its sprite, with its depth", () => {
    const { shadows } = atlasOf(twoReceivers());
    const [first] = shadows.views;
    const view = first.view as Sprite;

    expect(first.depth).toBe(7);
    expect(view.position.set).toHaveBeenCalledWith(100, 0);
    expect(view.scale.set).toHaveBeenCalledWith(1 / RES);
  });

  it("shows the square of a sprite cut in two in two parts, the top one leaning with its part", () => {
    // A 20 × 40 sprite at (100, 0) cut at y 16: the bottom part hangs from the cut, the top stands on it.
    const own = silhouetteOf(100, 0, 20, 40, { x: 2, y: 2 }, 7);
    const bottom = own.sources[0];
    const top = new Sprite(own.body);
    Object.assign(bottom, { y: 16, height: 24 });
    Object.assign(top, { x: 110, y: 16, width: 20, height: 16, anchor: { x: 0.5, y: 1 } });
    const { shadows } = atlasOf([{ own: { ...own, sources: [bottom, top] }, casters: [] }]);
    const [low, high] = shadows.views.map(({ view }) => view as Sprite);

    expect(shadows.views.map(({ depth }) => depth)).toEqual([7, 7]);
    // The bottom part shows the square from the cut down; the top part the rest, about the cut.
    expect(high.texture.frame).toEqual(new Rectangle(PAD, PAD, 20 * RES, 16 * RES));
    expect(low.texture.frame).toEqual(new Rectangle(PAD, PAD + 16 * RES, 20 * RES, 24 * RES));
    expect(low.position.set).toHaveBeenCalledWith(100, 16);
    expect(high.pivot.set).toHaveBeenCalledWith(10 * RES, 16 * RES);
    expect(high.position.set).toHaveBeenCalledWith(110, 16);

    // It leans as its part does, writing only what changed.
    const leans = (high as unknown as { skewWrites: number[] }).skewWrites;
    shadows.follow();
    top.skew.x = 0.05;
    shadows.follow();
    shadows.follow();
    expect(leans).toEqual([0.05]);
    expect(high.skew.x).toBe(0.05);
    expect((low as unknown as { skewWrites: number[] }).skewWrites).toEqual([]);
  });

  it("caches its receiver cutouts before drawing shaded atlases", () => {
    const receivers = twoReceivers();
    const { rig, renderer, shadows } = atlasOf(receivers);
    expect(renderer.render).not.toHaveBeenCalled();

    shadows.draw(() => ({ x: 0, y: 0 }));
    const [{ container, target }] = renderer.render.mock.calls[0];
    const cutouts = container.children as MockSprite[];

    expect(target).toBe(rig.eraser.texture);
    expect(rig.eraser.texture).toMatchObject({ width: shadows.atlas.width, height: shadows.atlas.height });
    expect(cutouts.map(({ texture }) => texture)).toEqual(receivers.map(({ own }) => own.body));
    expect(cutouts[1]).toMatchObject({ x: 2 * PAD + 20 * RES, y: PAD, width: 30 * RES, height: 30 * RES });
    expect(renderer.render.mock.calls[1][0].target).toBe(shadows.atlas);
    shadows.draw(() => ({ x: 0, y: 0 }));
    expect(renderer.render).toHaveBeenCalledTimes(3);
  });

  it("draws the rig's black casters, then erases its own mask, into the atlas", () => {
    const filters = [
      { blur: true, padding: 3 },
      { alpha: true, padding: 1 },
    ];
    const { rig, renderer, shadows } = atlasOf(twoReceivers(), createRenderer(), createTexturePool(), filters);

    shadows.draw(() => ({ x: 0, y: 0 }));
    const { container, target, clear, clearColor } = renderer.render.mock.calls[1][0];
    const casters = rig.casters.container as unknown as MockContainer & { visible: boolean };

    expect(container).toBe(rig.root);
    expect(target).toBe(shadows.atlas);
    expect({ clear, clearColor }).toEqual({ clear: true, clearColor: [0, 0, 0, 0] });
    // Inset by the filters' padding, which Pixi adds back: the filtered area is the atlas, no wider.
    expect(casters.filterArea).toEqual(new Rectangle(12, 12, shadows.atlas.width - 24, shadows.atlas.height - 24));
    expect(rig.eraser.texture).toBe(renderer.render.mock.calls[0][0].target);
    expect(casters.children).toHaveLength(2);
    expect(casters.visible).toBe(true);
  });

  it("lends a black sprite and a pooled texture to each pair a draw shows, and takes the texture back", () => {
    const { rig, textures, shadows } = atlasOf(twoReceivers());
    // Only the first receiver is shaded: the second caster lands far above its square.
    const offsetOf = vi.fn((_caster: unknown, receiver: { x: number }) => (receiver.x === 2 ? { x: 0, y: 0 } : null));

    shadows.draw(offsetOf);
    shadows.draw(offsetOf);

    expect(spritesOf(rig)).toHaveLength(1);
    const [sprite] = spritesOf(rig);
    expect(sprite.tint).toBe(0x000000);
    expect(sprite.texture.dynamic).toBe(true);
    expect(sprite.texture.source).toEqual({ id: "silhouette" });
    expect(textures.size).toBe(1);
  });

  it("lays a caster on its receiver's square, moved by the offset and cropped around the square", () => {
    const receivers = twoReceivers();
    const { rig, shadows } = atlasOf(receivers);
    const offsetOf = vi.fn(() => ({ x: -90, y: 25 }));

    shadows.draw(offsetOf);

    expect(offsetOf).toHaveBeenCalledWith({ x: 0, y: 0 }, { x: 2, y: 2 }, 0);
    expect(offsetOf).toHaveBeenCalledWith({ x: 0, y: 0 }, { x: 3, y: 3 }, 1);
    // Caster display (0, 0, 20 × 40) with foot (10, 40); receiver foot (110, 30): the silhouette
    // lands at (110 − 10 − 90, 30 − 40 + 25) = (10, 15) px, 90 px left of the receiver at x 100.
    // In the atlas it starts at PAD − 180 texels, so it misses the square and its bleed: no sprite.
    const x = PAD + (10 - 100) * RES;
    const y = PAD + 15 * RES;
    expect(spritesOf(rig)).toHaveLength(0);

    offsetOf.mockReturnValue({ x: 5, y: 25 });
    shadows.draw(offsetOf);
    const [sprite] = spritesOf(rig);
    const { frame } = sprite.texture;
    // Now at (105, 15) px: x = PAD + 10 texels, cropped at the right and bottom of the square plus the bleed.
    const left = PAD + 5 * RES;
    const bottom = PAD + 40 * RES + RECEIVED_SHADOW_BLEED;
    expect(x).toBeLessThan(PAD - RECEIVED_SHADOW_BLEED - 20 * RES);
    expect(sprite.position.set).toHaveBeenLastCalledWith(left, y);
    expect(sprite.scale).toMatchObject({ x: (20 * RES) / 40, y: (40 * RES) / 80 });
    expect(frame.x).toBeCloseTo(8);
    expect(frame.y).toBeCloseTo(4);
    expect(frame.width).toBeCloseTo(((PAD + 20 * RES + RECEIVED_SHADOW_BLEED - left) / (20 * RES)) * 40);
    expect(frame.height).toBeCloseTo(((bottom - y) / (40 * RES)) * 80);
  });

  it("crops the side and top of a caster that runs past the square", () => {
    const { rig, shadows } = atlasOf(twoReceivers());

    // At (90, −20) px: 10 px left of the square, 20 px above it.
    shadows.draw(() => ({ x: -10, y: -10 }));
    const [sprite] = spritesOf(rig);

    expect(sprite.position.set).toHaveBeenLastCalledWith(PAD - RECEIVED_SHADOW_BLEED, PAD - RECEIVED_SHADOW_BLEED);
    expect(sprite.texture.frame.x).toBeCloseTo(8 + ((10 * RES - RECEIVED_SHADOW_BLEED) / (20 * RES)) * 40);
    expect(sprite.texture.frame.y).toBeCloseTo(4 + ((20 * RES - RECEIVED_SHADOW_BLEED) / (40 * RES)) * 80);
  });

  it("hides the sprites a draw does not use, writing visibility only on change", () => {
    const { rig, shadows } = atlasOf(twoReceivers());

    shadows.draw(() => ({ x: 0, y: 0 }));
    const [sprite] = spritesOf(rig);
    shadows.draw(() => ({ x: 0, y: 0 }));
    shadows.draw(() => null);
    shadows.draw(() => null);
    shadows.draw(() => ({ x: 0, y: 0 }));

    // Made hidden, then shown by the first draw.
    expect(sprite.visibleWrites).toEqual([false, true, false, true]);
  });

  it("lends the same sprites and textures to every atlas of a rig", () => {
    const renderer = createRenderer();
    const textures = createTexturePool();
    const rig = createReceivedShadowRig(renderer as never, []);
    const receivers = twoReceivers();
    const first = createReceivedShadows(receivers, rig, textures);
    const second = createReceivedShadows(receivers, rig, textures);

    first.draw(() => ({ x: 0, y: 0 }));
    const sprites = [...spritesOf(rig)];
    const lent = sprites.map(({ texture }) => texture);
    second.draw(() => ({ x: 0, y: 0 }));

    expect(sprites).toHaveLength(2);
    expect(spritesOf(rig)).toEqual(sprites);
    spritesOf(rig).forEach(({ texture }) => expect(lent).toContain(texture));
    expect(textures.size).toBe(2);
    expect(renderer.render.mock.calls.at(-1)?.[0].target).toBe(second.atlas);
  });

  it("destroys the atlas, not the rig, its mask nor the textures it lent", () => {
    const { rig, renderer, textures, shadows } = atlasOf(twoReceivers());
    shadows.draw(() => ({ x: 0, y: 0 }));
    const mask = renderer.render.mock.calls[0][0].target as MockRenderTexture;
    const lent = spritesOf(rig).map(({ texture }) => texture);

    shadows.destroy();

    expect(rig.root.destroy).not.toHaveBeenCalled();
    lent.forEach((texture) => expect(texture.destroy).not.toHaveBeenCalled());
    expect(textures.size).toBe(2);
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
});

it("composes a height-aware terrain mask with entity casters and reuses its texture", () => {
  const receiver = twoReceivers()[0];
  const renderer = { render: vi.fn() };
  const rig = createReceivedShadowRig(renderer as never, []);
  const shadows = createReceivedShadows([receiver], rig, createTexturePool());
  const sample = vi.fn((_own, _x, y: number) => (y > 0 ? 1 : 0));
  shadows.draw(null, sample);
  expect(sample).toHaveBeenCalledTimes(50);
  shadows.draw(null, sample);
  expect(sample).toHaveBeenCalledTimes(100);
  shadows.destroy();
  rig.destroy();
});

it("composes moving casters into the same received atlas before shadow opacity is applied", () => {
  const own = silhouetteOf(100, 0, 20, 40, { x: 2, y: 2 }, 7);
  const { shadows, rig } = atlasOf([{ own, casters: [] }]);
  const offset = vi.fn(() => ({ x: 0, y: 0 }));
  const additional = vi.fn(() => [{ silhouette: own, lift: 2 }]);
  shadows.draw(offset, undefined, additional);
  expect(additional).toHaveBeenCalledWith(own);
  expect(offset).toHaveBeenCalledWith(own.worldFoot, own.worldFoot, 2);
  expect(spritesOf(rig)[0].visible).toBe(true);
  shadows.draw(() => null, undefined, additional);
  expect(spritesOf(rig)[0].visible).toBe(false);
  shadows.draw(null, undefined, additional);
  shadows.destroy();
  rig.destroy();
});

it("reuses static terrain coverage while moving casters redraw, and refreshes it for another phase", () => {
  const own = silhouetteOf(100, 0, 20, 40, { x: 2, y: 2 }, 7);
  const { shadows, rig } = atlasOf([{ own, casters: [] }]);
  const terrain = vi.fn(() => 0.5);
  const day = {};
  shadows.draw(null, terrain, undefined, day);
  expect(terrain).toHaveBeenCalledTimes(50);
  shadows.draw(null, terrain, undefined, day);
  expect(terrain).toHaveBeenCalledTimes(50);
  shadows.draw(null, terrain, undefined, {});
  expect(terrain).toHaveBeenCalledTimes(100);
  shadows.destroy();
  rig.destroy();
});

it("keeps an unshaded atlas clear without repainting transparent masks every phase frame", () => {
  const { shadows, renderer, rig } = atlasOf([{ own: silhouetteOf(0, 0, 20, 40), casters: [] }]);
  const light = {};
  shadows.draw(null, () => 0, undefined, light);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  shadows.draw(null, () => 0, undefined, light);
  expect(renderer.render).toHaveBeenCalledTimes(1);
  shadows.draw(null, () => 1, undefined, {});
  expect(renderer.render).toHaveBeenCalledTimes(3);
  shadows.draw(null, () => 0, undefined, {});
  expect(renderer.render).toHaveBeenCalledTimes(4);
  shadows.draw(null, () => 0, undefined, {});
  expect(renderer.render).toHaveBeenCalledTimes(4);
  shadows.atlas.source.resolution = 0.5;
  shadows.draw(null, () => 0, undefined, {});
  expect(renderer.render).toHaveBeenCalledTimes(5);
  shadows.destroy();
  rig.destroy();
});

it("skips hidden receivers and refreshes their terrain visibility when the camera reveals them", () => {
  const { shadows, renderer } = atlasOf(twoReceivers());
  const sample = vi.fn(() => 1);
  const offset = vi.fn(() => null);
  const additional = vi.fn(() => []);
  const light = {};
  shadows.views[1].view.culled = true;
  shadows.draw(offset, sample, additional, light);
  expect(sample).toHaveBeenCalledTimes(50);
  expect(offset).toHaveBeenCalledTimes(1);
  expect(additional).toHaveBeenCalledTimes(1);
  shadows.draw(offset, sample, additional, light);
  expect(sample).toHaveBeenCalledTimes(50);
  shadows.views[0].view.culled = true;
  shadows.views[1].view.culled = false;
  shadows.draw(offset, sample, additional, light);
  expect(sample).toHaveBeenCalledTimes(114);
  const drawn = renderer.render.mock.calls.length;
  shadows.views[1].view.culled = true;
  shadows.draw(offset, sample, additional, light);
  expect(renderer.render).toHaveBeenCalledTimes(drawn);
  shadows.destroy();
});

it("retains terrain coverage for receivers narrower than one terrain-mask texel", () => {
  const own = silhouetteOf(0, 0, 3, 12);
  const { shadows } = atlasOf([{ own, casters: [] }]);
  const sample = vi.fn((_own: Silhouette) => 1);
  shadows.draw(null, sample);
  expect(sample).toHaveBeenCalledTimes(3);
  expect(sample.mock.calls.every(([receiver]) => receiver === own)).toBe(true);
  shadows.destroy();
});
