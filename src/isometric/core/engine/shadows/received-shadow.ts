import { Container, type Filter, Rectangle, RenderTexture, type Renderer, Sprite, Texture } from "pixi.js";
import type { DepthView } from "../render";
import { type CasterSprites, createCasterSprites, type PlanePoint, type Silhouette } from "./silhouette";
import type { TextureFrame, TexturePool } from "./texture-pool";

/** Texels of the received-shadow atlas per screen pixel of a receiver (at zoom 1). */
export const RECEIVED_SHADOW_RESOLUTION = 1;

/** Empty texels around each receiver's square of the atlas: wider than the blur spreads. */
export const RECEIVED_SHADOW_PADDING = 16;

/** Texels a cast shadow may run past its receiver's square, so the blur does not fade at its edge. */
export const RECEIVED_SHADOW_BLEED = 4;

/** Widest row of the received-shadow atlas, in texels. */
export const RECEIVED_SHADOW_ATLAS_WIDTH = 2048;

/** Another entity's silhouette that may shade a receiver. */
export type ShadowCaster = {
  readonly silhouette: Silhouette;
  /** Blocks the caster stands above the receiver (negative when below). */
  readonly lift: number;
};

/** An entity's sprite that other entities' shadows may fall on. */
export type ShadowReceiver = {
  /** Its own silhouette: the sprite in the scene (`source`), its depth and where it stands. */
  readonly own: Silhouette;
  readonly casters: readonly ShadowCaster[];
};

/**
 * Where a caster's silhouette lands on a receiver: screen pixels to add to the silhouette,
 * relative to the caster's foot, to place it relative to the receiver's foot (see
 * `getCastShadowOffset()`); `null` when the caster does not shade it. The point may be the same
 * object on every call: read it before the next one.
 */
export type CastShadowOffset = (casterFoot: PlanePoint, receiverFoot: PlanePoint, lift: number) => PlanePoint | null;

/**
 * What a module draws its atlases of received shadows with, one atlas after another: the black
 * caster sprites, with the shadow filters, and over them the eraser of the atlas's mask. Shared by
 * every atlas, so a module keeps the sprites of its largest draw only (#97).
 */
export type ReceivedShadowRig = {
  readonly renderer: Renderer;
  readonly casters: CasterSprites;
  /** Texels the casters' filters pad what they filter by, all together. */
  readonly padding: number;
  /** Shows the mask of the atlas drawn: erases what falls outside its receivers. */
  readonly eraser: Sprite;
  /** What a draw renders into an atlas: the casters, then the eraser. */
  readonly root: Container;
  /** Destroys the root, the caster sprites and the eraser, not their textures. */
  destroy(): void;
};

/** Creates the {@link ReceivedShadowRig} of a module, its casters drawn with `filters`. */
export function createReceivedShadowRig(renderer: Renderer, filters: readonly Filter[]): ReceivedShadowRig {
  const casters = createCasterSprites(filters);
  const eraser = new Sprite();
  eraser.blendMode = "erase";
  const root = new Container();
  root.addChild(casters.container, eraser);
  const padding = filters.reduce((total, filter) => total + filter.padding, 0);
  return { renderer, casters, padding, eraser, root, destroy: () => root.destroy({ children: true }) };
}

/** Shadows that entities cast on each other, drawn into one atlas. */
export type ReceivedShadows = {
  /** One view per receiver, to add right after it: its square of the atlas over its sprite. */
  readonly views: readonly DepthView[];
  readonly atlas: RenderTexture;
  /** Places the casters with `offsetOf` (none when not given) and draws the atlas. */
  draw(offsetOf: CastShadowOffset | null): void;
  destroy(): void;
};

// What a draw crops each caster's texture to, copied into the texture at once.
const crop: { -readonly [Key in keyof TextureFrame]: number } = { x: 0, y: 0, width: 0, height: 0 };

/** The screen rectangle a sprite is drawn in. */
function displayOf(sprite: Sprite) {
  return {
    left: sprite.x - sprite.anchor.x * sprite.width,
    top: sprite.y - sprite.anchor.y * sprite.height,
    width: sprite.width,
    height: sprite.height,
  };
}

/** Shelf packing: each receiver's square, `RECEIVED_SHADOW_PADDING` texels apart. */
function packSlots(receivers: readonly ShadowReceiver[]) {
  const padding = RECEIVED_SHADOW_PADDING;
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = padding;
  const slots = receivers.map(({ own }) => {
    const display = displayOf(own.source);
    const slotWidth = Math.ceil(display.width * RECEIVED_SHADOW_RESOLUTION);
    const slotHeight = Math.ceil(display.height * RECEIVED_SHADOW_RESOLUTION);
    if (x > padding && x + slotWidth + padding > RECEIVED_SHADOW_ATLAS_WIDTH) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    const slot = new Rectangle(x, y, slotWidth, slotHeight);
    x += slotWidth + padding;
    rowHeight = Math.max(rowHeight, slotHeight);
    width = Math.max(width, x);
    return slot;
  });
  return { slots, width, height: y + rowHeight + padding };
}

/**
 * Shadows that entities cast on each other. Each receiver gets a square of one atlas, in its
 * own screen space at {@link RECEIVED_SHADOW_RESOLUTION} texels per pixel, and a view that
 * shows that square over its sprite, right after it in the draw order: things in front still
 * cover the shadow, and the scene never touches the view again.
 *
 * Each draw lays every caster's black silhouette on its receivers' squares with the sprites and
 * filters of `rig` (shared with the other atlases; the filters, with the ground shadows: blur and
 * the sun's opacity), cropped to the square and {@link RECEIVED_SHADOW_BLEED} texels around it,
 * and then keeps it only where the receiver is opaque: a mask computed once, `1 − alpha` of every
 * receiver, erases the rest. One render to texture per draw, whatever the number of receivers.
 *
 * Under one sun about one pair in ten is ever shaded: a draw only borrows sprites, and cropped
 * textures from `textures` (over the casters' shared SVG sources: destroying them would walk the
 * listeners of their source once each), for the pairs it shows, and gives the textures back once
 * rendered. The pairs are kept as flat arrays: an atlas holds thousands and lives as long as its
 * chunk, so an object per pair fed the garbage collector, and `receivers` is not kept.
 */
export function createReceivedShadows(
  receivers: readonly ShadowReceiver[],
  rig: ReceivedShadowRig,
  textures: TexturePool,
): ReceivedShadows {
  const resolution = RECEIVED_SHADOW_RESOLUTION;
  const { renderer, casters, padding, eraser, root } = rig;
  const { slots, width, height } = packSlots(receivers);
  const atlas = RenderTexture.create({ width, height });

  // The mask: opaque everywhere but where a receiver is drawn, computed once.
  const mask = RenderTexture.create({ width, height });
  const maskRoot = new Container();
  receivers.forEach(({ own: { source } }, index) => {
    const display = displayOf(source);
    const cutout = new Sprite(source.texture);
    cutout.blendMode = "erase";
    cutout.position.set(slots[index].x, slots[index].y);
    cutout.width = display.width * resolution;
    cutout.height = display.height * resolution;
    maskRoot.addChild(cutout);
  });
  renderer.render({ container: maskRoot, target: mask, clear: true, clearColor: [0, 0, 0, 1] });
  maskRoot.destroy({ children: true });

  // The whole atlas: known up front, so Pixi does not measure the silhouettes on every draw. Pixi
  // pads it by the filters' padding and rounds its filter textures up to powers of two: inset by
  // that padding (narrower than the atlas's own), or a 2048-wide atlas filters at 4096 (#53).
  const filterArea = new Rectangle(padding, padding, width - 2 * padding, height - 2 * padding);

  // The pairs (a caster on a receiver), in receiver and caster order.
  const count = receivers.reduce((total, { casters: own }) => total + own.length, 0);
  const pairSilhouettes = new Array<Silhouette>(count);
  const pairLifts = new Float64Array(count);
  const pairReceivers = new Uint32Array(count);
  // Atlas texel of the silhouette's top-left corner before the sun's offset: its foot on the receiver's.
  const pairOrigins = new Float64Array(2 * count);
  // Where each receiver stands, for the sun's offsets.
  const receiverFeet = receivers.map(({ own }) => own.worldFoot);
  let pair = 0;
  receivers.forEach((receiver, index) => {
    const slot = slots[index];
    const target = displayOf(receiver.own.source);
    receiver.casters.forEach(({ silhouette, lift }) => {
      const { display, screenFoot } = silhouette;
      pairSilhouettes[pair] = silhouette;
      pairLifts[pair] = lift;
      pairReceivers[pair] = index;
      pairOrigins[2 * pair] =
        slot.x + (receiver.own.screenFoot.x + display.left - screenFoot.x - target.left) * resolution;
      pairOrigins[2 * pair + 1] =
        slot.y + (receiver.own.screenFoot.y + display.top - screenFoot.y - target.top) * resolution;
      pair += 1;
    });
  });

  const views = receivers.map(({ own }, index) => {
    const slot = slots[index];
    const display = displayOf(own.source);
    const sprite = new Sprite(
      new Texture({ source: atlas.source, frame: new Rectangle(slot.x, slot.y, slot.width, slot.height) }),
    );
    sprite.position.set(display.left, display.top);
    sprite.scale.set(1 / resolution);
    // Same depth, added after the receiver: drawn right over it.
    return { view: sprite, depth: own.depth };
  });

  // The textures a draw borrowed, given back once it is rendered.
  const borrowed: Texture[] = [];
  /** Lays the pair on the draw's sprite number `index`; whether it shades its receiver. */
  const place = (pair: number, index: number, offsetOf: CastShadowOffset) => {
    const silhouette = pairSilhouettes[pair];
    const receiver = pairReceivers[pair];
    const offset = offsetOf(silhouette.worldFoot, receiverFeet[receiver], pairLifts[pair]);
    if (!offset) return false;
    const base = silhouette.texture.frame;
    const width = silhouette.display.width * resolution;
    const height = silhouette.display.height * resolution;
    const x = pairOrigins[2 * pair] + offset.x * resolution;
    const y = pairOrigins[2 * pair + 1] + offset.y * resolution;
    // What a draw may cover: the receiver's square and the bleed around it.
    const slot = slots[receiver];
    const x0 = Math.max(x, slot.x - RECEIVED_SHADOW_BLEED);
    const y0 = Math.max(y, slot.y - RECEIVED_SHADOW_BLEED);
    const x1 = Math.min(x + width, slot.x + slot.width + RECEIVED_SHADOW_BLEED);
    const y1 = Math.min(y + height, slot.y + slot.height + RECEIVED_SHADOW_BLEED);
    if (x1 <= x0 || y1 <= y0) return false;
    crop.x = base.x + ((x0 - x) / width) * base.width;
    crop.y = base.y + ((y0 - y) / height) * base.height;
    crop.width = ((x1 - x0) / width) * base.width;
    crop.height = ((y1 - y0) / height) * base.height;
    const texture = textures.acquire(silhouette.texture.source, crop);
    borrowed.push(texture);
    const sprite = casters.sprite(index, texture);
    // A caster sprite only ever moves and scales: the sprites of these draws are never turned.
    sprite.position.set(x0, y0);
    sprite.scale.set(width / base.width, height / base.height);
    return true;
  };

  return {
    views,
    atlas,
    draw(offsetOf) {
      let shown = 0;
      if (offsetOf) for (let index = 0; index < count; index += 1) if (place(index, shown, offsetOf)) shown += 1;
      casters.show(shown);
      casters.container.filterArea = filterArea;
      eraser.texture = mask;
      renderer.render({ container: root, target: atlas, clear: true, clearColor: [0, 0, 0, 0] });
      for (const texture of borrowed) textures.release(texture);
      borrowed.length = 0;
    },
    destroy() {
      // The atlas first: destroying its source drops the listeners of the views' textures at once.
      mask.destroy(true);
      atlas.destroy(true);
      views.forEach(({ view }) => view.texture.destroy());
    },
  };
}
