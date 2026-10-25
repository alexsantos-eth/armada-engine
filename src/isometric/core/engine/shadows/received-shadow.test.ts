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

    constructor(texture?: Texture) {
      this.texture = texture as Texture;
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
    Matrix,
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
  });

  it("destroys its root with the sprites, not their textures", () => {
    const rig = createReceivedShadowRig(createRenderer() as never, []);

    rig.destroy();

    expect(rig.root.destroy).toHaveBeenCalledWith({ children: true });
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

  it("computes once a mask that is opaque everywhere but on the receivers", () => {
    const receivers = twoReceivers();
    const { renderer } = atlasOf(receivers);
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

  it("draws the rig's black casters, then erases its own mask, into the atlas", () => {
    const filters = [
      { blur: true, padding: 3 },
      { alpha: true, padding: 1 },
    ];
    const { rig, renderer, shadows } = atlasOf(twoReceivers(), createRenderer(), createTexturePool(), filters);

    shadows.draw(null);
    const { container, target, clear, clearColor } = renderer.render.mock.calls[1][0];
    const casters = rig.casters.container as unknown as MockContainer & { visible: boolean };

    expect(container).toBe(rig.root);
    expect(target).toBe(shadows.atlas);
    expect({ clear, clearColor }).toEqual({ clear: true, clearColor: [0, 0, 0, 0] });
    // Inset by the filters' padding, which Pixi adds back: the filtered area is the atlas, no wider.
    expect(casters.filterArea).toEqual(new Rectangle(4, 4, shadows.atlas.width - 8, shadows.atlas.height - 8));
    expect(rig.eraser.texture).toBe(renderer.render.mock.calls[0][0].target);
    // At night nothing is laid: no caster has a sprite yet, and the casters are hidden.
    expect(casters.children).toHaveLength(0);
    expect(casters.visible).toBe(false);
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

  it("destroys the atlas and the mask, not the rig nor the textures it lent", () => {
    const { rig, renderer, textures, shadows } = atlasOf(twoReceivers());
    shadows.draw(() => ({ x: 0, y: 0 }));
    const mask = renderer.render.mock.calls[0][0].target as { destroy: ReturnType<typeof vi.fn> };
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
