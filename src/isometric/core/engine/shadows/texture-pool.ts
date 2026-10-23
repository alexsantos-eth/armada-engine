import { Rectangle, Texture, type TextureSource } from "pixi.js";

/** A frame of a texture source, in source pixels. */
export type TextureFrame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/**
 * Textures over shared sources, kept for reuse instead of destroyed. Every Pixi `Texture`
 * listens to its source, and destroying one walks the source's whole list of listeners: with
 * thousands of textures over one entity SVG, destroying them one by one froze the game for
 * seconds (quadratic in the textures of a source). Released textures keep listening and are
 * handed out again, so a source has as many as were ever in use at once.
 */
export type TexturePool = {
  /** A dynamic texture over `source` showing `frame`: a released one when there is one. */
  acquire(source: TextureSource, frame: TextureFrame): Texture;
  /** Gives `texture` back for a later `acquire()` over its source. Never destroyed by the pool. */
  release(texture: Texture): void;
  /** Released textures, over every source. */
  readonly size: number;
};

/** Creates an empty {@link TexturePool}. */
export function createTexturePool(): TexturePool {
  const free = new Map<TextureSource, Texture[]>();
  let size = 0;
  return {
    acquire(source, { x, y, width, height }) {
      const texture = free.get(source)?.pop();
      if (!texture) return new Texture({ source, frame: new Rectangle(x, y, width, height), dynamic: true });
      size -= 1;
      texture.frame.x = x;
      texture.frame.y = y;
      texture.frame.width = width;
      texture.frame.height = height;
      texture.update();
      return texture;
    },
    release(texture) {
      const textures = free.get(texture.source) ?? [];
      free.set(texture.source, textures);
      textures.push(texture);
      size += 1;
    },
    get size() {
      return size;
    },
  };
}
