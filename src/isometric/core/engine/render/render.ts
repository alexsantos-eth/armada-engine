import { type Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { NEW_SPRITES, type SpriteSource } from "./sprite-pool";
import type { EntityLengthAxis, IsoScreenBox, TileMetrics } from "../../types";

/**
 * Footprint tile that owns each vertical half-tile strip of a multi-block sprite, listed
 * from the left of the screen. A footprint of `length` tiles is `length + 1` strips wide;
 * a strip that straddles two tiles belongs to the one nearer the viewer (lower index, the
 * anchor being tile 0). On the `x` axis the anchor is on the left, on `y` on the right.
 */
export function getFootprintSliceTiles(length: number, lengthAxis: EntityLengthAxis): number[] {
  if (length <= 1) return [0];
  const fromAnchor = Array.from({ length: length + 1 }, (_, strip) => Math.max(0, strip - 1));
  return lengthAxis === "x" ? fromAnchor : fromAnchor.reverse();
}

const stripTexturesCache = new WeakMap<Texture, Texture[]>();

const splitTexturesCache = new WeakMap<Texture, Map<number, readonly [Texture, Texture]>>();

/**
 * `texture` cut in two at texel row `row` of its frame (top part, bottom part), cached per
 * texture and row: shared by every sprite of the texture, never one per instance.
 */
function getSplitTextures(texture: Texture, row: number): readonly [Texture, Texture] {
  const byRow = splitTexturesCache.get(texture) ?? new Map<number, readonly [Texture, Texture]>();
  splitTexturesCache.set(texture, byRow);
  const cached = byRow.get(row);
  if (cached) return cached;
  const { x, y, width, height } = texture.frame;
  const parts = [
    new Texture({ source: texture.source, frame: new Rectangle(x, y, width, row) }),
    new Texture({ source: texture.source, frame: new Rectangle(x, y + row, width, height - row) }),
  ] as const;
  byRow.set(row, parts);
  return parts;
}

function getStripTextures(texture: Texture, strips: number): Texture[] {
  const cached = stripTexturesCache.get(texture);
  if (cached?.length === strips) return cached;
  const { x, y, width, height } = texture.frame;
  const stripWidth = width / strips;
  const textures = Array.from(
    { length: strips },
    (_, strip) =>
      new Texture({
        source: texture.source,
        frame: new Rectangle(x + strip * stripWidth, y, stripWidth, height),
      }),
  );
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
  /**
   * The view is the top part of the sprite before it in the list, cut from the same texture
   * (`RenderBlockOptions.splitAt`): together they draw one sprite, and its origin is the cut.
   */
  readonly stacked?: boolean;
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
  return (
    box.baseScreenY -
    tile * (metrics.tileHeight / 2) +
    box.box.elevation * 0.001 +
    (box.x + (lengthAxis === "x" ? tile : 0)) * 0.0001
  );
}

/** What to draw with {@link createBlockViews}. Only `texture`, `box` and `metrics` are required. */
export type RenderBlockOptions = {
  /** Loaded texture of the block or entity. */
  readonly texture: Texture;
  /** Projected position (from `projectBoxesToIsometric()`). */
  readonly box: IsoScreenBox;
  /** Tile size in pixels (usually `TILE_METRICS`). */
  readonly metrics: TileMetrics;
  /** Tint applied to the sprite. Defaults to none (white). */
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
  /**
   * Cuts a single-tile sprite in two at this fraction of its height from its top (between `0` and
   * `1`, rounded to a texel row): the bottom part anchored on its top edge, then the top part
   * (`stacked`) anchored on its bottom edge, both at the cut, so leaning the top part (`skew`) bends
   * the sprite there and the bottom stays still. Drawn as one sprite while nothing leans. Ignored
   * for multi-tile footprints.
   */
  readonly splitAt?: number;
  /**
   * The texture shows only this window of the sprite's canvas (a cell of a sheet cut with
   * {@link getSheetFrames}), as fractions of the canvas's width and height from its top-left
   * corner: the sprite is sized and anchored so the window is drawn where it lies in the whole
   * canvas. Ignored for multi-tile footprints and with `splitAt`.
   */
  readonly cell?: SheetCell;
  /** Where the sprites come from, e.g. a `SpritePool`. Defaults to new ones ({@link NEW_SPRITES}). */
  readonly sprites?: SpriteSource;
};

/** A window of a sprite's canvas, in fractions of its width and height from its top-left corner. */
export type SheetCell = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** How a sheet texture is laid out: a grid of equal cells, with `gap` texture units between them. */
export type SheetLayout = {
  readonly columns: number;
  readonly rows: number;
  /** Size of a cell, in the texture's units. */
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly gap: number;
};

const sheetFramesCache = new WeakMap<Texture, Texture[][]>();

/**
 * The cells of the sheet `texture`, by row and column, each a texture over the same source: made
 * once per sheet (cached; `layout` must not change for it) and shared, never one per frame drawn.
 */
export function getSheetFrames(texture: Texture, layout: SheetLayout): Texture[][] {
  const cached = sheetFramesCache.get(texture);
  if (cached) return cached;
  const { columns, rows, cellWidth, cellHeight, gap } = layout;
  const { x, y } = texture.frame;
  const frames = Array.from({ length: rows }, (_, row) =>
    Array.from(
      { length: columns },
      (_, column) =>
        new Texture({
          source: texture.source,
          frame: new Rectangle(x + column * (cellWidth + gap), y + row * (cellHeight + gap), cellWidth, cellHeight),
        }),
    ),
  );
  sheetFramesCache.set(texture, frames);
  return frames;
}

/**
 * Shows `texture` on the sprite `view` (a cell of the same sheet as the one it shows, so its size
 * and anchor still fit), writing it only when it changes, and keeps the sprite's scale: Pixi 8.22
 * sets a sprite's scale again from the last `width`/`height` written when its texture changes,
 * which undid any scale set since (the player's, drawn smaller than its tile). Views that are not
 * sprites are left alone.
 */
export function showFrame(view: Container, texture: Texture): void {
  if (!(view instanceof Sprite) || view.texture === texture) return;
  const { x, y } = view.scale;
  view.texture = texture;
  view.scale.set(x, y);
}

/**
 * Creates the views of a block or entity, each with its draw depth, without adding them to
 * any container (the scene adds them in its draw order). Multi-block entities are cut into vertical
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
    splitAt,
    cell,
    sprites = NEW_SPRITES,
  } = options;
  const width = tileWidth * ((1 + length) / 2);
  const textureAspectRatio = texture.width > 0 ? texture.height / texture.width : undefined;
  const spriteHeight =
    length > 1 && textureAspectRatio !== undefined ? width * textureAspectRatio : tileHeight + boxHeight * height;
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
  const tileDepth = (tile: number) => getBlockDepth(box, options.metrics, tile, lengthAxis);
  const anchorDepth = tileDepth(0);
  const draw = (
    source: Texture,
    spriteWidth: number,
    anchorX: number,
    x: number,
    drawnHeight = spriteHeight,
    anchorY = 0,
    y = positionY,
  ) => {
    const sprite = sprites.take(source);
    sprite.width = spriteWidth;
    sprite.height = drawnHeight;
    sprite.tint = tint ?? 0xffffff;
    sprite.anchor.set(anchorX, anchorY);
    sprite.position.set(x, y);
    return sprite;
  };
  // The texel row of the cut, when it leaves texels on both sides.
  const splitRow = splitAt === undefined || length > 1 ? 0 : Math.round(texture.frame.height * splitAt);

  let views: DepthView[];
  if (length > 1) {
    const sliceTiles = getFootprintSliceTiles(length, lengthAxis);
    const stripTextures = getStripTextures(texture, sliceTiles.length);
    const stripWidth = width / sliceTiles.length;
    const left = positionX - width / 2;
    views = sliceTiles.map((tile, strip) => ({
      view: draw(stripTextures[strip], stripWidth, 0, left + strip * stripWidth),
      depth: tileDepth(tile),
    }));
  } else if (splitRow > 0 && splitRow < texture.frame.height) {
    const [top, bottom] = getSplitTextures(texture, splitRow);
    const topHeight = (spriteHeight * splitRow) / texture.frame.height;
    const cutY = positionY + topHeight;
    views = [
      { view: draw(bottom, width, 0.5, positionX, spriteHeight - topHeight, 0, cutY), depth: anchorDepth },
      { view: draw(top, width, 0.5, positionX, topHeight, 1, cutY), depth: anchorDepth, stacked: true },
    ];
  } else if (cell) {
    // The window's share of the canvas, anchored at the canvas's top centre.
    const anchorX = (0.5 - cell.x) / cell.width;
    const anchorY = (0 - cell.y) / cell.height;
    const sprite = draw(texture, width * cell.width, anchorX, positionX, spriteHeight * cell.height, anchorY);
    views = [{ view: sprite, depth: anchorDepth }];
  } else {
    views = [{ view: draw(texture, width, 0.5, positionX), depth: anchorDepth }];
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
