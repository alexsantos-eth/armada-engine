import { describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => {
  class Sprite {
    public texture: unknown;
    public visible = true;
    public alpha = 1;
    public culled = false;
    public destroy = vi.fn();

    constructor(texture: unknown) {
      this.texture = texture;
    }
  }

  return { Sprite };
});

import { Sprite, type Texture } from "pixi.js";
import { createSpritePool, NEW_SPRITES, SPRITE_POOL_SIZE } from "./sprite-pool";

const texture = (name: string) => ({ name }) as unknown as Texture;
type Spied = { destroy: ReturnType<typeof vi.fn> };

describe("NEW_SPRITES", () => {
  it("makes a new sprite every time", () => {
    const grass = texture("grass");
    const first = NEW_SPRITES.take(grass);

    expect(first.texture).toBe(grass);
    expect(NEW_SPRITES.take(grass)).not.toBe(first);
  });
});

describe("createSpritePool", () => {
  it("makes sprites while it has none to give", () => {
    const pool = createSpritePool();
    const grass = texture("grass");

    const sprite = pool.take(grass);

    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.texture).toBe(grass);
  });

  it("gives back a kept sprite with the new texture, shown, opaque and not culled", () => {
    const pool = createSpritePool();
    const kept = pool.take(texture("grass"));
    Object.assign(kept, { visible: false, alpha: 0.3, culled: true });
    pool.give([kept]);

    const sand = texture("sand");
    const again = pool.take(sand);

    expect(again).toBe(kept);
    expect(again).toMatchObject({ texture: sand, visible: true, alpha: 1, culled: false });
    expect((kept as unknown as Spied).destroy).not.toHaveBeenCalled();
    expect(pool.take(sand)).not.toBe(kept);
  });

  it("destroys what is not a sprite, and sprites past its size", () => {
    const pool = createSpritePool();
    const outline = { destroy: vi.fn() };
    const sprites = Array.from({ length: SPRITE_POOL_SIZE + 1 }, () => pool.take(texture("grass")));

    pool.give([outline as never, ...sprites]);

    expect(outline.destroy).toHaveBeenCalled();
    expect(sprites.filter((sprite) => (sprite as unknown as Spied).destroy.mock.calls.length > 0)).toEqual([
      sprites[SPRITE_POOL_SIZE],
    ]);
  });

  it("destroys the sprites it keeps when destroyed, and keeps none after", () => {
    const pool = createSpritePool();
    const kept = pool.take(texture("grass"));
    pool.give([kept]);

    pool.destroy();

    expect((kept as unknown as Spied).destroy).toHaveBeenCalledTimes(1);
    expect(pool.take(texture("grass"))).not.toBe(kept);
  });
});
