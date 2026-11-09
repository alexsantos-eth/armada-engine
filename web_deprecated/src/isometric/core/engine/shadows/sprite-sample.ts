import { RenderTexture, type Renderer, Sprite, type Texture } from "pixi.js";
import type { ScreenRect } from "./silhouette";

/** Bounded alpha readbacks for dynamic receivers; source assets remain owned by Pixi Assets. */
export type SpriteShadowSampler = {
  sample(shape: { readonly texture: Texture; readonly display: ScreenRect }, x: number, y: number): number;
  destroy(): void;
};

/** Keeps a 64² alpha silhouette per texture, then answers moving-receiver rays without GPU readbacks. */
export function createSpriteShadowSampler(renderer: Renderer): SpriteShadowSampler {
  const size = 64;
  const cached = new WeakMap<Texture, Uint8Array>();
  let scratch: RenderTexture | undefined;
  let sprite: Sprite | undefined;
  return {
    sample({ texture, display }, x, y) {
      const u = (x - display.left) / display.width;
      const v = (y - display.top) / display.height;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
      let alpha = cached.get(texture);
      if (!alpha) {
        scratch ??= RenderTexture.create({ width: size, height: size });
        sprite ??= new Sprite();
        sprite.texture = texture;
        sprite.setSize(size, size);
        renderer.render({ container: sprite, target: scratch, clear: true, clearColor: [0, 0, 0, 0] });
        const { pixels } = renderer.extract.pixels(scratch);
        alpha = new Uint8Array(size * size);
        for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * 4 + 3];
        cached.set(texture, alpha);
      }
      const px = Math.max(0, Math.min(size - 1, u * size - 0.5));
      const py = Math.max(0, Math.min(size - 1, v * size - 0.5));
      const x0 = Math.floor(px),
        y0 = Math.floor(py);
      const x1 = Math.min(size - 1, x0 + 1),
        y1 = Math.min(size - 1, y0 + 1);
      const fx = px - x0,
        fy = py - y0;
      const top = alpha[y0 * size + x0] * (1 - fx) + alpha[y0 * size + x1] * fx;
      const bottom = alpha[y1 * size + x0] * (1 - fx) + alpha[y1 * size + x1] * fx;
      return (top * (1 - fy) + bottom * fy) / 255;
    },
    destroy() {
      sprite?.destroy({ texture: false });
      scratch?.destroy(true);
    },
  };
}
