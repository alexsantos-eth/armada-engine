import { type Container, Sprite, type Texture } from "pixi.js";

/** Where views get their sprites: new ones ({@link NEW_SPRITES}) or a {@link SpritePool}'s. */
export type SpriteSource = {
  /** A sprite showing `texture`, in no container, at full opacity and not culled. */
  take(texture: Texture): Sprite;
};

/** A new sprite for every view. */
export const NEW_SPRITES: SpriteSource = { take: (texture) => new Sprite(texture) };

/**
 * Sprites a pool keeps at most: about the terrain of three chunks. Past it, what it is given is
 * destroyed, so zooming out and back in does not leave thousands of spare sprites behind.
 */
export const SPRITE_POOL_SIZE = 4096;

/**
 * Sprites to use again (#94): the views of a hidden chunk, given back, are taken by the next
 * chunk shown instead of destroying thousands of sprites and making as many, which keeps the
 * garbage collector out of the frames that stream chunks. Whoever takes a sprite sets everything
 * it draws with (size, anchor, tint, position or transform): only the texture, `visible`, `alpha`
 * and `culled` are reset.
 */
export type SpritePool = SpriteSource & {
  /**
   * Keeps the sprites among `views` (up to {@link SPRITE_POOL_SIZE}) and destroys the rest, not
   * their textures. They must be out of any container.
   */
  give(views: readonly Container[]): void;
  /** Destroys the sprites kept, not their textures. */
  destroy(): void;
};

/** Creates an empty {@link SpritePool}. */
export function createSpritePool(): SpritePool {
  const spares: Sprite[] = [];
  return {
    take: (texture) => {
      const sprite = spares.pop();
      if (!sprite) return new Sprite(texture);
      sprite.texture = texture;
      sprite.visible = true;
      sprite.alpha = 1;
      sprite.culled = false;
      return sprite;
    },
    give: (views) =>
      views.forEach((view) => {
        if (view instanceof Sprite && spares.length < SPRITE_POOL_SIZE) spares.push(view);
        else view.destroy();
      }),
    destroy: () => spares.splice(0).forEach((sprite) => sprite.destroy()),
  };
}
