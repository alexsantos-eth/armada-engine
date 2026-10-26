import {
  BufferImageSource,
  Container,
  Matrix,
  Rectangle,
  RenderTexture,
  type Renderer,
  Sprite,
  Texture,
  TilingSprite,
} from "pixi.js";
import { BAND_REPEAT_TILES, getBandDrift, getBandLight } from "../waves";
import type { TerrainBands, TileMetrics } from "../../types";

/** Texels of one repeat of the strip of light the bands are drawn from: a power of two, so it can repeat. */
export const BAND_STRIP_TEXELS = 256;

/**
 * Pixels between two copies of the block in the atlas: its mipmaps (drawn when the camera is far)
 * blend neighbouring texels, which would bleed one copy into the next without it.
 */
export const BAND_ATLAS_PADDING = 8;

/** A block texture with bands of light drifting across its top: one per column parity (`x` modulo 2), shallow and deep. */
export type BandAtlas = {
  /**
   * The texture of a block in column `x`, deep or not: the bands run across `x` and are the same
   * all along `y`, so `x` modulo 2 picks the copy and they cross to the neighbours without a seam.
   */
  textureAt(x: number, deep: boolean): Texture;
  /** Redraws every texture with the bands drifted as at `timeMs` (real time): one render to texture. */
  draw(timeMs: number): void;
  destroy(): void;
};

/** The strip of light of `bands` across one repeat ({@link BAND_REPEAT_TILES} tiles), white with the light in alpha. */
function createBandStrip(bands: TerrainBands): Texture {
  const texels = new Uint8Array(BAND_STRIP_TEXELS * 4);
  for (let texel = 0; texel < BAND_STRIP_TEXELS; texel += 1) {
    const light = getBandLight(bands, ((texel + 0.5) / BAND_STRIP_TEXELS) * BAND_REPEAT_TILES);
    texels.set([255, 255, 255, Math.round(255 * light)], texel * 4);
  }
  return new Texture({
    source: new BufferImageSource({ resource: texels, width: BAND_STRIP_TEXELS, height: 1, addressMode: "repeat" }),
  });
}

/**
 * Animates `block` (the texture of a one-tile block: its top a rhombus `metrics.tileHeight` tall,
 * as wide as the texture) with `bands`: one `RenderTexture` holds four copies of the block, an
 * even and an odd column for shallow blocks and the same for deep ones, each with a
 * `TilingSprite` of the strip of light laid on its top in tile space (the rhombus is the unit
 * square), so a band leaving a copy enters its neighbour's. The four textures share one source:
 * the blocks drawn with them stay in their batch, and redrawing the atlas touches none of them.
 */
export function createBandAtlas(
  renderer: Pick<Renderer, "render">,
  block: Texture,
  bands: TerrainBands,
  metrics: TileMetrics,
): BandAtlas {
  const width = block.width;
  const height = block.height;
  const cellWidth = width + BAND_ATLAS_PADDING;
  const cellHeight = height + BAND_ATLAS_PADDING;
  // With mipmaps, like the block's own SVG: without them the bands flicker in fine stripes when the camera is far.
  const atlas = RenderTexture.create({
    width: 2 * cellWidth,
    height: 2 * cellHeight,
    resolution: block.source.resolution,
    autoGenerateMipmaps: true,
  });
  const strip = createBandStrip(bands);
  const root = new Container();
  // The top of the block in its texture: from its bottom corner, `+x` runs to the right corner and `+y` to the left one.
  const top = (metrics.tileHeight * width) / metrics.tileWidth;
  const tileSpace = new Matrix(width / 2, -top / 2, -width / 2, -top / 2, width / 2, top);
  const layers: Array<{ readonly light: TilingSprite; readonly column: number; readonly deep: boolean }> = [];
  const textures: Texture[] = [];
  for (const deep of [false, true]) {
    for (const column of [0, 1]) {
      const x = column * cellWidth;
      const y = deep ? cellHeight : 0;
      const copy = new Container();
      copy.position.set(x, y);
      const onTop = new Container();
      onTop.setFromMatrix(tileSpace);
      const light = new TilingSprite({ texture: strip, width: 1, height: 1 });
      light.tileScale.set(BAND_REPEAT_TILES / BAND_STRIP_TEXELS, 1);
      light.alpha = deep ? bands.alpha * bands.deep : bands.alpha;
      onTop.addChild(light);
      copy.addChild(new Sprite(block), onTop);
      root.addChild(copy);
      layers.push({ light, column, deep });
      textures.push(new Texture({ source: atlas.source, frame: new Rectangle(x, y, width, height) }));
    }
  }

  return {
    textureAt: (x, deep) => textures[(deep ? 2 : 0) + (x & 1)],
    draw: (timeMs) => {
      for (const { light, column, deep } of layers) light.tilePosition.x = getBandDrift(bands, timeMs, deep) - column;
      renderer.render({ container: root, target: atlas, clear: true });
      atlas.source.updateMipmaps();
    },
    destroy: () => {
      root.destroy({ children: true });
      textures.forEach((texture) => texture.destroy());
      strip.destroy(true);
      atlas.destroy(true);
    },
  };
}
