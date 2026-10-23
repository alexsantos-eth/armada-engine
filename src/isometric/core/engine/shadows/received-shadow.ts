import { Container, type Filter, Rectangle, RenderTexture, type Renderer, Sprite, Texture } from "pixi.js";
import type { DepthView } from "../render";
import type { PlanePoint, Silhouette } from "./silhouette";
import type { TexturePool } from "./texture-pool";

/** Texels of the received-shadow atlas per screen pixel of a receiver (at zoom 1). */
export const RECEIVED_SHADOW_RESOLUTION = 2;

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
 * `getCastShadowOffset()`); `null` when the caster does not shade it.
 */
export type CastShadowOffset = (casterFoot: PlanePoint, receiverFoot: PlanePoint, lift: number) => PlanePoint | null;

/** Shadows that entities cast on each other, drawn into one atlas. */
export type ReceivedShadows = {
  /** One view per receiver, to add right after it: its square of the atlas over its sprite. */
  readonly views: readonly DepthView[];
  /** Container of every placed caster silhouette, with the filters: hide it at night. */
  readonly casters: Container;
  readonly atlas: RenderTexture;
  /** Places the casters with `offsetOf` (when given) and draws the atlas. */
  draw(offsetOf: CastShadowOffset | null): void;
  destroy(): void;
};

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
 * Each draw lays every caster's black silhouette on its receivers' squares (with `filters`,
 * shared with the ground shadows: blur and the sun's opacity), cropped to the square and
 * {@link RECEIVED_SHADOW_BLEED} texels around it, and then keeps it only where the receiver
 * is opaque: a mask computed once, `1 − alpha` of every receiver, erases the rest. One render
 * to texture per draw, whatever the number of receivers.
 *
 * The caster textures (one per receiver and caster, over the casters' shared SVG sources) come
 * from `textures` and go back to it on `destroy()`: destroying them would walk the listeners of
 * their source once each.
 */
export function createReceivedShadows(
  receivers: readonly ShadowReceiver[],
  renderer: Renderer,
  filters: readonly Filter[],
  textures: TexturePool,
): ReceivedShadows {
  const resolution = RECEIVED_SHADOW_RESOLUTION;
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

  const casters = new Container();
  casters.filters = [...filters];
  // The whole atlas: known up front, so Pixi does not measure the silhouettes on every draw.
  casters.filterArea = new Rectangle(0, 0, width, height);
  const erase = new Sprite(mask);
  erase.blendMode = "erase";
  const root = new Container();
  root.addChild(casters, erase);

  const placed = receivers.flatMap((receiver, index) => {
    const slot = slots[index];
    const target = displayOf(receiver.own.source);
    // What a draw may cover: the receiver's square and the bleed around it.
    const crop = {
      left: slot.x - RECEIVED_SHADOW_BLEED,
      top: slot.y - RECEIVED_SHADOW_BLEED,
      right: slot.x + slot.width + RECEIVED_SHADOW_BLEED,
      bottom: slot.y + slot.height + RECEIVED_SHADOW_BLEED,
    };
    return receiver.casters.map(({ silhouette, lift }) => {
      const { source, frame } = silhouette.sprite.texture;
      const base = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
      const { display, screenFoot } = silhouette;
      const size = { width: display.width * resolution, height: display.height * resolution };
      // Where the silhouette lands in the atlas before the sun's offset: its foot on the receiver's.
      const origin = {
        x: slot.x + (receiver.own.screenFoot.x + display.left - screenFoot.x - target.left) * resolution,
        y: slot.y + (receiver.own.screenFoot.y + display.top - screenFoot.y - target.top) * resolution,
      };
      // Its own frame, cropped to the receiver's square on every draw; the scale never changes.
      const texture = textures.acquire(source, base);
      const sprite = new Sprite(texture);
      sprite.tint = 0x000000;
      sprite.visible = false;
      sprite.scale.set(size.width / base.width, size.height / base.height);
      casters.addChild(sprite);
      return {
        sprite,
        texture,
        base,
        size,
        origin,
        crop,
        casterFoot: silhouette.worldFoot,
        receiverFoot: receiver.own.worldFoot,
        lift,
      };
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

  const place = (item: (typeof placed)[number], offsetOf: CastShadowOffset) => {
    const { sprite, texture, base, size, origin, crop } = item;
    const offset = offsetOf(item.casterFoot, item.receiverFoot, item.lift);
    let shown = offset !== null;
    if (offset) {
      const x = origin.x + offset.x * resolution;
      const y = origin.y + offset.y * resolution;
      const x0 = Math.max(x, crop.left);
      const y0 = Math.max(y, crop.top);
      const x1 = Math.min(x + size.width, crop.right);
      const y1 = Math.min(y + size.height, crop.bottom);
      shown = x1 > x0 && y1 > y0;
      if (shown) {
        texture.frame.x = base.x + ((x0 - x) / size.width) * base.width;
        texture.frame.y = base.y + ((y0 - y) / size.height) * base.height;
        texture.frame.width = ((x1 - x0) / size.width) * base.width;
        texture.frame.height = ((y1 - y0) / size.height) * base.height;
        texture.update();
        sprite.position.set(x0, y0);
      }
    }
    // Only on change: every change rebuilds the draw instructions of the atlas.
    if (sprite.visible !== shown) sprite.visible = shown;
  };

  return {
    views,
    casters,
    atlas,
    draw(offsetOf) {
      if (offsetOf) placed.forEach((item) => place(item, offsetOf));
      renderer.render({ container: root, target: atlas, clear: true, clearColor: [0, 0, 0, 0] });
    },
    destroy() {
      root.destroy({ children: true });
      placed.forEach(({ texture }) => textures.release(texture));
      // The atlas first: destroying its source drops the listeners of the views' textures at once.
      mask.destroy(true);
      atlas.destroy(true);
      views.forEach(({ view }) => view.texture.destroy());
    },
  };
}
