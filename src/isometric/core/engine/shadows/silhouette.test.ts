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

    constructor({ source, frame }: { source: unknown; frame: Rectangle }) {
      this.source = source;
      this.frame = frame;
    }
  }

  class Matrix {
    public a: number;
    public b: number;
    public c: number;
    public d: number;
    public tx: number;
    public ty: number;

    constructor(a: number, b: number, c: number, d: number, tx: number, ty: number) {
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.tx = tx;
      this.ty = ty;
    }
  }

  class Sprite {
    public texture: Texture;
    public x = 0;
    public y = 0;
    public width = 0;
    public height = 0;
    public tint = 0xffffff;
    public visible = true;
    public alpha = 1;
    public anchor = {
      x: 0,
      y: 0,
      set: (x: number, y = x) => {
        this.anchor.x = x;
        this.anchor.y = y;
      },
    };
    public setFromMatrix = vi.fn();

    constructor(texture: Texture) {
      this.texture = texture;
    }
  }

  class Graphics {}

  return { Graphics, Matrix, Rectangle, Sprite, Texture };
});

import { Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { Affine2D } from "../../types";
import { Box } from "../terrain";
import {
  composeAffine,
  createGroundShadowView,
  createSilhouettes,
  createSilhouetteSprite,
  getGroundShadowMatrix,
  getSilhouetteMapMatrix,
  placeSilhouette,
  SHADOW_MAP_PIXELS_PER_TILE,
} from "./silhouette";

const METRICS = { tileWidth: 40, tileHeight: 20, boxHeight: 40 / 3 };
const apply = (m: Affine2D, x: number, y: number) => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });
const texture = (width: number, height: number) =>
  new Texture({ source: { id: "src" } as never, frame: new Rectangle(0, 0, width, height) });

/** A sprite placed like `createBlockViews()` places one. */
const placedSprite = (tex: Texture, x: number, y: number, width: number, height: number, anchorX = 0.5) => {
  const sprite = new Sprite(tex);
  sprite.anchor.set(anchorX, 0);
  sprite.x = x;
  sprite.y = y;
  sprite.width = width;
  sprite.height = height;
  return sprite;
};

const entityBox = (x: number, y: number, screenX: number, screenY: number) => ({
  x,
  y,
  screenX,
  screenY,
  baseScreenY: 0,
  box: new Box(x, y, { elevation: 1 }),
});

describe("composeAffine", () => {
  it("applies the inner transform first", () => {
    const scale: Affine2D = { a: 2, b: 0, c: 0, d: 3, tx: 0, ty: 0 };
    const move: Affine2D = { a: 1, b: 0, c: 0, d: 1, tx: 5, ty: -1 };

    expect(apply(composeAffine(move, scale), 1, 1)).toEqual({ x: 7, y: 2 });
    expect(apply(composeAffine(scale, move), 1, 1)).toEqual({ x: 12, y: 0 });
  });
});

describe("getGroundShadowMatrix", () => {
  const ppt = 16;
  const top = { x: 300, y: 200 };

  it("maps the tile's square of the shadow map onto its top diamond", () => {
    const matrix = getGroundShadowMatrix(top, METRICS, ppt);
    const centre = apply(matrix, ppt / 2, ppt / 2);
    const back = apply(matrix, 0, 0); // −x −y corner: bottom of the diamond, toward the camera
    const right = apply(matrix, ppt, 0); // +x −y corner: right of the diamond
    const far = apply(matrix, ppt, ppt); // +x +y corner: top of the diamond

    expect(centre.x).toBeCloseTo(top.x);
    expect(centre.y).toBeCloseTo(top.y);
    expect(back).toEqual({ x: top.x, y: top.y + METRICS.tileHeight / 2 });
    expect(right.x).toBeCloseTo(top.x + METRICS.tileWidth / 2);
    expect(right.y).toBeCloseTo(top.y);
    expect(far.x).toBeCloseTo(top.x);
    expect(far.y).toBeCloseTo(top.y - METRICS.tileHeight / 2);
  });
});

describe("createGroundShadowView", () => {
  it("creates an always-visible sprite of the tile's shadow, laid on its top with the given depth", () => {
    const frame = texture(SHADOW_MAP_PIXELS_PER_TILE, SHADOW_MAP_PIXELS_PER_TILE);
    const { view, depth } = createGroundShadowView(frame, { x: 10, y: 20 }, METRICS, 42.5);
    const sprite = view as unknown as Sprite & { setFromMatrix: ReturnType<typeof vi.fn> };

    expect(depth).toBe(42.5);
    // Never hidden: what it shows (occlusion, shadows, opacity) is decided by the map.
    expect(sprite.visible).toBe(true);
    expect(sprite.setFromMatrix).toHaveBeenCalledWith(
      expect.objectContaining(getGroundShadowMatrix({ x: 10, y: 20 }, METRICS, SHADOW_MAP_PIXELS_PER_TILE)),
    );
  });
});

describe("createSilhouettes", () => {
  it("makes the silhouette of a one-tile sprite, cropped at its foot", () => {
    // The sprite spans y 100..140; its foot (the tile centre) is at y 130.
    const sprite = placedSprite(texture(64, 80), 200, 100, 40, 40);
    const [silhouette] = createSilhouettes([{ view: sprite, depth: 5 }], entityBox(3, 4, 200, 130), METRICS);

    expect(silhouette.source).toBe(sprite);
    expect(silhouette.depth).toBe(5);
    expect(silhouette.worldFoot).toEqual({ x: 3, y: 4 });
    expect(silhouette.screenFoot).toEqual({ x: 200, y: 130 });
    expect(silhouette.display).toEqual({ left: 180, top: 100, width: 40, height: 30 });
    expect(silhouette.texture.frame).toMatchObject({ x: 0, y: 0, width: 64, height: 60 });
  });

  it("reuses the cropped texture for sprites of the same texture and crop", () => {
    const tex = texture(64, 80);
    const box = entityBox(3, 4, 200, 130);
    const [first] = createSilhouettes([{ view: placedSprite(tex, 200, 100, 40, 40), depth: 0 }], box, METRICS);
    const [second] = createSilhouettes([{ view: placedSprite(tex, 200, 100, 40, 40), depth: 0 }], box, METRICS);

    expect(second.texture).toBe(first.texture);
  });

  it("keeps the whole texture when the foot is at or below the sprite's bottom", () => {
    const tex = texture(64, 80);
    const [silhouette] = createSilhouettes(
      [{ view: placedSprite(tex, 200, 100, 40, 40), depth: 0 }],
      entityBox(0, 0, 200, 150),
      METRICS,
    );

    expect(silhouette.texture).toBe(tex);
    expect(silhouette.display.height).toBe(40);
  });

  it("gives each strip of a multi-tile sprite the foot of its own tile, and skips debug outlines", () => {
    const tex = texture(32, 80);
    const strips = [0, 1, 2].map((strip) => placedSprite(tex, 100 + strip * 20, 60, 20, 60, 0));
    const views = [
      ...strips.map((view) => ({ view: view as never, depth: 0 })),
      { view: new Graphics() as never, depth: 0 },
    ];

    const alongX = createSilhouettes(views, entityBox(5, 6, 120, 100), METRICS, 2, "x");
    const alongY = createSilhouettes(views, entityBox(5, 6, 120, 100), METRICS, 2, "y");

    expect(alongX.map(({ worldFoot }) => worldFoot)).toEqual([
      { x: 5, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ]);
    expect(alongX[2].screenFoot).toEqual({ x: 140, y: 90 });
    expect(alongY.map(({ worldFoot }) => worldFoot)).toEqual([
      { x: 5, y: 7 },
      { x: 5, y: 6 },
      { x: 5, y: 6 },
    ]);
    expect(alongY[0].screenFoot).toEqual({ x: 100, y: 90 });
  });
});

describe("createSilhouetteSprite", () => {
  it("draws the silhouette's texture in black", () => {
    const [silhouette] = createSilhouettes(
      [{ view: placedSprite(texture(64, 80), 200, 100, 40, 40), depth: 0 }],
      entityBox(3, 4, 200, 130),
      METRICS,
    );
    const sprite = createSilhouetteSprite(silhouette);

    expect(sprite.texture).toBe(silhouette.texture);
    expect(sprite.tint).toBe(0x000000);
    expect(createSilhouetteSprite(silhouette)).not.toBe(sprite);
  });
});

describe("getSilhouetteMapMatrix / placeSilhouette", () => {
  const identityWorld: Affine2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const silhouette = () =>
    createSilhouettes(
      [{ view: placedSprite(texture(64, 80), 200, 100, 40, 40), depth: 0 }],
      entityBox(3, 4, 200, 130),
      METRICS,
    )[0];

  it("maps texture pixels to shadow-map pixels through the foot-relative world transform", () => {
    const shape = silhouette();
    const world: Affine2D = { a: 0.5, b: 0, c: 0, d: 0.25, tx: 3, ty: 4 };
    const matrix = getSilhouetteMapMatrix(shape, world, { x: 1, y: 2 }, 10);
    // Texture pixel (0, 0) is the sprite's top-left: 20 px left of and 30 px above the foot.
    const topLeft = apply(matrix, 0, 0);

    expect(topLeft.x).toBeCloseTo((3 + 0.5 * -20 - 1) * 10);
    expect(topLeft.y).toBeCloseTo((4 + 0.25 * -30 - 2) * 10);
    // The cropped bottom centre (texture 32, 60) is the foot itself.
    const foot = apply(matrix, 32, 60);
    expect(foot.x).toBeCloseTo((3 - 1) * 10);
    expect(foot.y).toBeCloseTo((4 - 2) * 10);
  });

  it("places the silhouette sprite without touching its visibility", () => {
    const shape = silhouette();
    const placed = createSilhouetteSprite(shape);
    placed.visible = false;
    const sprite = placed as unknown as { setFromMatrix: ReturnType<typeof vi.fn> };

    placeSilhouette(placed, shape, identityWorld, { x: 0, y: 0 }, 16);

    // Changing `visible` would rebuild the layer's render instructions on every redraw.
    expect(placed.visible).toBe(false);
    expect(sprite.setFromMatrix).toHaveBeenCalledWith(
      expect.objectContaining(getSilhouetteMapMatrix(shape, identityWorld, { x: 0, y: 0 }, 16)),
    );
  });
});
