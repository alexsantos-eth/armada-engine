import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { EntityLengthAxis, IsoScreenBox, TileMetrics } from "../../types";

/**
 * Footprint tile that owns each vertical half-tile strip of a multi-block sprite, listed
 * from the left of the screen. A footprint of `length` tiles is `length + 1` strips wide;
 * a strip that straddles two tiles belongs to the one nearer the viewer (lower index, the
 * anchor being tile 0). On the `x` axis the anchor is on the left, on `y` on the right.
 */
export function getFootprintSliceTiles(
  length: number,
  lengthAxis: EntityLengthAxis,
): number[] {
  if (length <= 1) return [0];
  const fromAnchor = Array.from({ length: length + 1 }, (_, strip) => Math.max(0, strip - 1));
  return lengthAxis === "x" ? fromAnchor : fromAnchor.reverse();
}

const stripTexturesCache = new WeakMap<Texture, Texture[]>();

function getStripTextures(texture: Texture, strips: number): Texture[] {
  const cached = stripTexturesCache.get(texture);
  if (cached?.length === strips) return cached;
  const { x, y, width, height } = texture.frame;
  const stripWidth = width / strips;
  const textures = Array.from({ length: strips }, (_, strip) => new Texture({
    source: texture.source,
    frame: new Rectangle(x + strip * stripWidth, y, stripWidth, height),
  }));
  stripTexturesCache.set(texture, textures);
  return textures;
}

/**
 * A display object with its isometric draw depth: larger depths are drawn later (in front).
 * Depth is kept outside Pixi's `zIndex` on purpose: assigning `zIndex` turns on
 * `sortableChildren` in the parent, which re-sorts every child whenever anything changes.
 */
export type DepthView = {
  readonly view: Container;
  readonly depth: number;
};

/**
 * Draw depth of a block, an entity or anything standing on a tile (larger is drawn later):
 * by ground position (`baseScreenY`), then elevation, then `x` to break ties. `tile` picks
 * another tile of a multi-tile footprint along `lengthAxis` (`0` is the anchor tile).
 */
export function getBlockDepth(
  box: IsoScreenBox,
  metrics: TileMetrics,
  tile = 0,
  lengthAxis: EntityLengthAxis = "x",
): number {
  return box.baseScreenY - tile * (metrics.tileHeight / 2) + box.box.elevation * 0.001 +
    (box.x + (lengthAxis === "x" ? tile : 0)) * 0.0001;
}

/** What to draw with {@link createBlockViews}. Only `texture`, `box` and `metrics` are required. */
export type RenderBlockOptions = {
  /** Loaded texture of the block or entity. */
  readonly texture: Texture;
  /** Projected position (from `projectBoxesToIsometric()`). */
  readonly box: IsoScreenBox;
  /** Tile size in pixels (usually `TILE_METRICS`). */
  readonly metrics: TileMetrics;
  /** Tint applied to the sprite. Defaults to none. */
  readonly tint?: number;
  /** Height in blocks. Defaults to `1`. */
  readonly height?: number;
  /** Places the sprite on top of its column (entities) instead of as the column's block. */
  readonly surfaceAligned?: boolean;
  /** Footprint length in tiles. Defaults to `1`. */
  readonly length?: number;
  /** Axis of a multi-tile footprint. Defaults to `"x"`. */
  readonly lengthAxis?: EntityLengthAxis;
  /** Draws a diamond outline per occupied block. Defaults to `false`. */
  readonly debug?: boolean;
};

/**
 * Creates the views of a block or entity, each with its draw depth, without adding them to
 * any container (see {@link addInDepthOrder}). Multi-block entities are cut into vertical
 * half-tile strips, each with the depth of its own footprint tile, so things standing in
 * front of the far end of a long entity (a tree beside the land end of a pier) are drawn
 * over it instead of behind it. Sprites come first; the debug outline, when enabled, last.
 */
export function createBlockViews(options: RenderBlockOptions): DepthView[] {
  const {
    texture,
    box,
    metrics: { tileWidth, tileHeight, boxHeight },
    tint,
    height = 1,
    surfaceAligned = false,
    length = 1,
    lengthAxis = "x",
    debug = false,
  } = options;
  const image = new Sprite(texture);

  image.width = tileWidth * ((1 + length) / 2);
  const textureAspectRatio = texture.width > 0 ? texture.height / texture.width : undefined;
  image.height = length > 1 && textureAspectRatio !== undefined
    ? image.width * textureAspectRatio
    : tileHeight + boxHeight * height;
  if (tint !== undefined) {
    image.tint = tint;
  }
  image.anchor.set(0.5, 0);
  const footprintDepth = tileHeight * ((1 + length) / 4);
  const verticalOffset = surfaceAligned
    ? footprintDepth + boxHeight * height
    : height > 1
      ? tileHeight + boxHeight * height
    : tileHeight / 2;
  const footprintOffset = (length - 1) / 2;
  const lengthDirection = lengthAxis === "y" ? -1 : 1;
  const positionX = box.screenX + lengthDirection * footprintOffset * (tileWidth / 2);
  const positionY = box.screenY - footprintOffset * (tileHeight / 2) - verticalOffset;
  image.position.set(positionX, positionY);
  const tileDepth = (tile: number) => getBlockDepth(box, options.metrics, tile, lengthAxis);
  const anchorDepth = tileDepth(0);

  let views: DepthView[] = [{ view: image, depth: anchorDepth }];
  if (length > 1) {
    const sliceTiles = getFootprintSliceTiles(length, lengthAxis);
    const stripTextures = getStripTextures(texture, sliceTiles.length);
    const stripWidth = image.width / sliceTiles.length;
    const left = positionX - image.width / 2;
    views = sliceTiles.map((tile, strip) => {
      const slice = new Sprite(stripTextures[strip]);
      slice.width = stripWidth;
      slice.height = image.height;
      slice.tint = image.tint;
      slice.anchor.set(0, 0);
      slice.position.set(left + strip * stripWidth, positionY);
      return { view: slice, depth: tileDepth(tile) };
    });
  }

  if (debug) {
    const halfWidth = tileWidth / 2;
    const halfHeight = tileHeight / 2;
    const outline = new Graphics();
    const createDiamond = (blockIndex: number, verticalOffset: number) => {
      const centerX = box.screenX + lengthDirection * blockIndex * (tileWidth / 2);
      const centerY = box.screenY - blockIndex * (tileHeight / 2) - verticalOffset;
      return [
        { x: centerX, y: centerY - halfHeight },
        { x: centerX + halfWidth, y: centerY },
        { x: centerX, y: centerY + halfHeight },
        { x: centerX - halfWidth, y: centerY },
      ];
    };
    for (let blockIndex = 0; blockIndex < length; blockIndex += 1) {
      outline.poly(createDiamond(blockIndex, 0));
      outline.poly(createDiamond(blockIndex, boxHeight * height));
    }
    outline.stroke({ color: 0xff00ff, width: 1 });
    views.push({ view: outline, depth: anchorDepth + 0.0001 });
  }

  return views;
}

/**
 * Adds `views` to `container` from back to front (ascending depth; equal depths keep their
 * order). One sort when building, instead of Pixi re-sorting every child: the container does
 * not need `sortableChildren`.
 */
export function addInDepthOrder(container: Container, views: readonly DepthView[]): void {
  [...views]
    .sort((a, b) => a.depth - b.depth)
    .forEach(({ view }) => container.addChild(view));
}