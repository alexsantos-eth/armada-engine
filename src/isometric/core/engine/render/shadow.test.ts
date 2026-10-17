import { describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => {
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
    public texture: { width: number; height: number };
    public visible = true;
    public alpha = 1;
    public anchor = { set: vi.fn() };
    public setFromMatrix = vi.fn();

    constructor(texture: { width: number; height: number }) {
      this.texture = texture;
    }
  }

  return { Matrix, Sprite };
});

import type { ShadowShape } from "../../types";
import { Box } from "../terrain";
import { getBlockDepth } from "./render";
import { createShadowView, getShadowMatrix, placeShadowView } from "./shadow";

const METRICS = { tileWidth: 40, tileHeight: 20, boxHeight: 40 / 3 };
const TEXTURE = { width: 128, height: 64 };
const ORIGIN = { x: 300, y: 200 };

/** World tile offset → screen, the same 2:1 projection as `projectBoxesToIsometric()`. */
const toScreen = (wx: number, wy: number) => ({
  x: ORIGIN.x + (wx - wy) * (METRICS.tileWidth / 2),
  y: ORIGIN.y - (wx + wy) * (METRICS.tileHeight / 2),
});

const apply = (m: ReturnType<typeof getShadowMatrix>, x: number, y: number) => ({
  x: m.a * x + m.c * y + m.tx,
  y: m.b * x + m.d * y + m.ty,
});

const SHAPE: ShadowShape = {
  centerX: 0.6,
  centerY: 0.2,
  angle: Math.PI / 3,
  radiusAlong: 1.2,
  radiusAcross: 0.4,
  alpha: 0.25,
};

describe("getShadowMatrix", () => {
  it("maps the texture centre to the projected shadow centre", () => {
    const point = apply(getShadowMatrix(SHAPE, ORIGIN, METRICS, TEXTURE), 0, 0);
    const expected = toScreen(SHAPE.centerX, SHAPE.centerY);

    expect(point.x).toBeCloseTo(expected.x);
    expect(point.y).toBeCloseTo(expected.y);
  });

  it("maps the texture edges to the ends of the ellipse axes on the ground", () => {
    const matrix = getShadowMatrix(SHAPE, ORIGIN, METRICS, TEXTURE);
    const along = apply(matrix, TEXTURE.width / 2, 0);
    const across = apply(matrix, 0, TEXTURE.height / 2);
    const cos = Math.cos(SHAPE.angle);
    const sin = Math.sin(SHAPE.angle);
    const alongEnd = toScreen(SHAPE.centerX + cos * SHAPE.radiusAlong, SHAPE.centerY + sin * SHAPE.radiusAlong);
    const acrossEnd = toScreen(SHAPE.centerX - sin * SHAPE.radiusAcross, SHAPE.centerY + cos * SHAPE.radiusAcross);

    expect(along.x).toBeCloseTo(alongEnd.x);
    expect(along.y).toBeCloseTo(alongEnd.y);
    expect(across.x).toBeCloseTo(acrossEnd.x);
    expect(across.y).toBeCloseTo(acrossEnd.y);
  });
});

describe("createShadowView", () => {
  it("creates a hidden, centred shadow sprite drawn with the depth of the caster's tile", () => {
    const box = { x: 2, y: 3, screenX: 300, screenY: 200, baseScreenY: 150, box: new Box(2, 3, { elevation: 1 }) };
    const { view, depth } = createShadowView(TEXTURE as never, box, METRICS);
    const sprite = view as unknown as { visible: boolean; anchor: { set: ReturnType<typeof vi.fn> } };

    expect(sprite.visible).toBe(false);
    expect(sprite.anchor.set).toHaveBeenCalledWith(0.5);
    expect(depth).toBe(getBlockDepth(box, METRICS));
  });
});

describe("placeShadowView", () => {
  const newSprite = () =>
    createShadowView(TEXTURE as never, {
      x: 0, y: 0, screenX: 0, screenY: 0, baseScreenY: 0, box: new Box(0, 0),
    }, METRICS).view as unknown as {
      visible: boolean;
      alpha: number;
      setFromMatrix: ReturnType<typeof vi.fn>;
    };

  it("shows the sprite with the shape's transform and opacity", () => {
    const sprite = newSprite();

    placeShadowView(sprite as never, SHAPE, ORIGIN, METRICS);

    expect(sprite.visible).toBe(true);
    expect(sprite.alpha).toBe(SHAPE.alpha);
    expect(sprite.setFromMatrix).toHaveBeenCalledWith(
      expect.objectContaining(getShadowMatrix(SHAPE, ORIGIN, METRICS, TEXTURE)),
    );
  });

  it("hides the sprite when there is no shadow", () => {
    const sprite = newSprite();
    placeShadowView(sprite as never, SHAPE, ORIGIN, METRICS);

    placeShadowView(sprite as never, null, ORIGIN, METRICS);

    expect(sprite.visible).toBe(false);
    expect(sprite.setFromMatrix).toHaveBeenCalledTimes(1);
  });
});
