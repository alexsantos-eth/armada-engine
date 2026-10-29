import {
  BufferImageSource,
  Container,
  type Filter,
  Rectangle,
  RenderTexture,
  type Renderer,
  Sprite,
  Texture,
} from "pixi.js";
import type { DepthView } from "../render";
import { type CasterSprites, createCasterSprites, displayOf, type PlanePoint, type Silhouette } from "./silhouette";
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
  /** Its own silhouette: its sprites in the scene (`sources`), its depth and where it stands. */
  readonly own: Silhouette;
  readonly casters: readonly ShadowCaster[];
};

/** Moving casters supplied for a receiver at draw time, before the atlas is graded. */
export type AdditionalShadowCasters = (own: Silhouette) => readonly ShadowCaster[];

/** Terrain visibility at a receiver pixel, using the same world light as its casters. */
export type TerrainReceiverSample = (own: Silhouette, screenX: number, screenY: number) => number;

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
 * every atlas, so a module keeps the sprites of its largest draw only (#97). The rig can render
 * cutouts into its reusable mask or a caller-owned target; static atlases cache that target.
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
  /**
   * Draws the mask of an atlas `width` × `height` texels into the eraser: opaque everywhere but
   * where `cutouts` (the receivers' textures, each in its rectangle of the atlas: `x`, `y`, `width`
   * and `height`, four numbers a cutout) are drawn.
   */
  drawMask(
    width: number,
    height: number,
    cutouts: readonly Texture[],
    rects: Float64Array,
    target?: RenderTexture,
  ): void;
  /** Destroys the root, the caster sprites, the eraser and the mask, not the casters' textures. */
  destroy(): void;
};

/** Creates the {@link ReceivedShadowRig} of a module, its casters drawn with `filters`. */
export function createReceivedShadowRig(renderer: Renderer, filters: readonly Filter[]): ReceivedShadowRig {
  const casters = createCasterSprites(filters);
  // Dynamic: the eraser follows its size when it grows.
  const mask = RenderTexture.create({ width: 1, height: 1, dynamic: true });
  const eraser = new Sprite(mask);
  eraser.blendMode = "erase";
  const root = new Container();
  root.addChild(casters.container, eraser);
  const padding = filters.reduce((total, filter) => total + filter.padding, 0);
  // The receivers' cutouts of the mask drawn, one sprite each, kept for the next masks.
  const cutoutRoot = new Container();
  const cutoutSprites: Sprite[] = [];
  return {
    renderer,
    casters,
    padding,
    eraser,
    root,
    drawMask(width, height, cutouts, rects, target = mask) {
      // Grown, never shrunk: the eraser covers the whole mask, past the atlas where nothing is drawn.
      if (width > target.width || height > target.height) {
        target.resize(Math.max(width, target.width), Math.max(height, target.height));
      }
      cutouts.forEach((texture, index) => {
        let sprite = cutoutSprites[index];
        if (!sprite) {
          sprite = new Sprite();
          sprite.blendMode = "erase";
          cutoutSprites.push(sprite);
          cutoutRoot.addChild(sprite);
        }
        sprite.texture = texture;
        sprite.position.set(rects[4 * index], rects[4 * index + 1]);
        sprite.setSize(rects[4 * index + 2], rects[4 * index + 3]);
        if (!sprite.visible) sprite.visible = true;
      });
      for (let index = cutouts.length; index < cutoutSprites.length; index += 1) {
        if (cutoutSprites[index].visible) cutoutSprites[index].visible = false;
      }
      eraser.texture = target;
      renderer.render({ container: cutoutRoot, target, clear: true, clearColor: [0, 0, 0, 1] });
    },
    destroy() {
      root.destroy({ children: true });
      cutoutRoot.destroy({ children: true });
      mask.destroy(true);
    },
  };
}

/** Shadows that entities cast on each other, drawn into one atlas. */
export type ReceivedShadows = {
  /**
   * One view per receiver sprite, to add right after it: its part of the receiver's square of the
   * atlas over it. The view over the top part of a sprite cut in two shares its origin (the cut).
   */
  readonly views: readonly DepthView[];
  readonly atlas: RenderTexture;
  /** Places the casters with `offsetOf` (none when not given) and draws the atlas. */
  draw(
    offsetOf: CastShadowOffset | null,
    terrainAt?: TerrainReceiverSample,
    additional?: AdditionalShadowCasters,
    terrainKey?: object,
  ): void;
  /**
   * Leans the view over the top part of each sprite cut in two as that part leans (its `skew`,
   * e.g. a canopy in the wind), so its shadows stay on it. Writes only what changed.
   */
  follow(): void;
  destroy(): void;
};

// What a draw crops each caster's texture to, copied into the texture at once.
const crop: { -readonly [Key in keyof TextureFrame]: number } = { x: 0, y: 0, width: 0, height: 0 };

/** Shelf packing: each receiver's square, `RECEIVED_SHADOW_PADDING` texels apart. */
function packSlots(receivers: readonly ShadowReceiver[]) {
  const padding = RECEIVED_SHADOW_PADDING;
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = padding;
  const slots = receivers.map(({ own }) => {
    const display = own.bodyDisplay;
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
 * and then keeps it only where the receiver is opaque: the rig's mask, drawn first with every
 * receiver's cutout (`1 − alpha` of each), erases the rest. Static receiver cutouts are cached:
 * after the first draw only the composed shadow atlas is rendered again.
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
  isVisible: (view: Sprite) => boolean = (view) => !view.culled,
): ReceivedShadows {
  const resolution = RECEIVED_SHADOW_RESOLUTION;
  const { renderer, casters, padding, root } = rig;
  const { slots, width, height } = packSlots(receivers);
  const atlas = RenderTexture.create({ width, height });
  let receiverMask: RenderTexture | undefined;

  // Static cutouts are rendered once into this atlas's cached transparency mask.
  const cutouts = receivers.map(({ own }) => own.body);
  const cutoutRects = new Float64Array(4 * receivers.length);
  receivers.forEach(({ own: { bodyDisplay: display } }, index) => {
    cutoutRects[4 * index] = slots[index].x;
    cutoutRects[4 * index + 1] = slots[index].y;
    cutoutRects[4 * index + 2] = display.width * resolution;
    cutoutRects[4 * index + 3] = display.height * resolution;
  });

  // The whole atlas: known up front, so Pixi does not measure the silhouettes on every draw. Pixi
  // pads it by the filters' padding and rounds its filter textures up to powers of two: inset by
  // that padding (narrower than the atlas's own), or a 2048-wide atlas filters at 4096 (#53).

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
    const target = receiver.own.bodyDisplay;
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

  // The views over the top parts of cut sprites, each after the part it follows.
  const followers: Sprite[] = [];
  const receiverViews: Sprite[][] = [];
  const views = receivers.flatMap(({ own }, index) => {
    const slot = slots[index];
    const body = own.bodyDisplay;
    const parts = own.sources.map((part, partIndex) => {
      // Each part shows its rows of the square; the bottom one (or the whole sprite) down to its bottom.
      const display = own.sources.length === 1 ? body : displayOf(part);
      const top = slot.y + (display.top - body.top) * resolution;
      const bottom = partIndex === 0 ? slot.y + slot.height : top + display.height * resolution;
      const sprite = new Sprite(
        new Texture({ source: atlas.source, frame: new Rectangle(slot.x, top, slot.width, bottom - top) }),
      );
      sprite.scale.set(1 / resolution);
      if (partIndex === 0) {
        sprite.position.set(display.left, display.top);
      } else {
        // Its origin on its part's (the cut), so the same skew leans both the same way.
        sprite.pivot.set((part.x - display.left) * resolution, (part.y - display.top) * resolution);
        sprite.position.set(part.x, part.y);
        followers.push(part, sprite);
      }
      // Same depth, added after the receiver: drawn right over it.
      return { view: sprite, depth: own.depth };
    });
    receiverViews.push(parts.map(({ view }) => view));
    return parts;
  });

  // Terrain and entity casters are composed under the same alpha filter: an overlap never doubles darkness.
  const terrainReceivers = receivers.map(({ own }) => own);
  // Visibility has only 8×16 samples per receiver; a full-size upload repeated those samples millions of times.
  const terrainScale = 4;
  const terrainWidth = Math.ceil(width / terrainScale);
  const terrainHeight = Math.ceil(height / terrainScale);
  let terrainMask: { texture: Texture; source: BufferImageSource; pixels: Uint8ClampedArray } | undefined;
  let terrainVersion: object | undefined;
  const visibility = new Uint8Array(receivers.length);
  const placeTerrain = (spriteIndex: number) => {
    const sprite = casters.sprite(spriteIndex, terrainMask!.texture);
    sprite.position.set(0, 0);
    sprite.scale.set(terrainScale);
  };
  const paintTerrain = (sample: TerrainReceiverSample, spriteIndex: number) => {
    if (!terrainMask) {
      const pixels = new Uint8ClampedArray(terrainWidth * terrainHeight * 4);
      const source = new BufferImageSource({ resource: pixels, width: terrainWidth, height: terrainHeight });
      terrainMask = { pixels, source, texture: new Texture({ source }) };
    }
    const { pixels, source } = terrainMask;
    pixels.fill(0);
    terrainReceivers.forEach((own, index) => {
      if (!visibility[index]) return;
      const slot = slots[index];
      const display = own.bodyDisplay;
      // Match the bounded grid to stored texels: even a tiny receiver gets at least one sample.
      const columns = Math.min(8, Math.max(1, Math.ceil(slot.width / terrainScale)));
      const rows = Math.min(16, Math.max(1, Math.ceil(slot.height / terrainScale)));
      for (let row = 0; row < rows; row += 1) {
        const y0 = Math.floor((slot.y + (slot.height * row) / rows) / terrainScale);
        const y1 =
          row === rows - 1
            ? Math.ceil((slot.y + slot.height) / terrainScale)
            : Math.floor((slot.y + (slot.height * (row + 1)) / rows) / terrainScale);
        for (let column = 0; column < columns; column += 1) {
          const x0 = Math.floor((slot.x + (slot.width * column) / columns) / terrainScale);
          const x1 =
            column === columns - 1
              ? Math.ceil((slot.x + slot.width) / terrainScale)
              : Math.floor((slot.x + (slot.width * (column + 1)) / columns) / terrainScale);
          const alpha = Math.round(
            255 *
              sample(
                own,
                display.left + ((column + 0.5) * display.width) / columns,
                display.top + ((row + 0.5) * display.height) / rows,
              ),
          );
          for (let y = y0; y < y1; y += 1)
            for (let x = x0; x < x1; x += 1) pixels[(y * terrainWidth + x) * 4 + 3] = alpha;
        }
      }
    });
    source.update();
    placeTerrain(spriteIndex);
  };

  // The textures a draw borrowed, given back once it is rendered.
  const borrowed: Texture[] = [];
  /** Lays the pair on the draw's sprite number `index`; whether it shades its receiver. */
  const place = (
    silhouette: Silhouette,
    receiver: number,
    lift: number,
    originX: number,
    originY: number,
    index: number,
    offsetOf: CastShadowOffset,
  ) => {
    const offset = offsetOf(silhouette.worldFoot, receiverFeet[receiver], lift);
    if (!offset) return false;
    const base = silhouette.texture.frame;
    const width = silhouette.display.width * resolution;
    const height = silhouette.display.height * resolution;
    const x = originX + offset.x * resolution;
    const y = originY + offset.y * resolution;
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
    draw(offsetOf, terrainAt, additional, terrainKey) {
      let visibilityChanged = false;
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      receiverViews.forEach((parts, index) => {
        const visible = Number(parts.some(isVisible));
        if (visibility[index] !== visible) visibilityChanged = true;
        visibility[index] = visible;
        if (!visible) return;
        const slot = slots[index];
        left = Math.min(left, slot.x);
        top = Math.min(top, slot.y);
        right = Math.max(right, slot.x + slot.width);
        bottom = Math.max(bottom, slot.y + slot.height);
      });
      if (left === Infinity) return;
      let shown = 0;
      if (offsetOf) {
        for (let index = 0; index < count; index += 1)
          if (
            visibility[pairReceivers[index]] &&
            place(
              pairSilhouettes[index],
              pairReceivers[index],
              pairLifts[index],
              pairOrigins[index * 2],
              pairOrigins[index * 2 + 1],
              shown,
              offsetOf,
            )
          )
            shown += 1;
        if (additional)
          terrainReceivers.forEach((own, receiver) => {
            if (!visibility[receiver]) return;
            const slot = slots[receiver];
            additional(own).forEach(({ silhouette, lift }) => {
              const originX =
                slot.x +
                (own.screenFoot.x + silhouette.display.left - silhouette.screenFoot.x - own.bodyDisplay.left) *
                  resolution;
              const originY =
                slot.y +
                (own.screenFoot.y + silhouette.display.top - silhouette.screenFoot.y - own.bodyDisplay.top) *
                  resolution;
              if (place(silhouette, receiver, lift, originX, originY, shown, offsetOf)) shown += 1;
            });
          });
      }
      if (terrainAt) {
        if (!terrainMask || visibilityChanged || terrainKey === undefined || terrainKey !== terrainVersion) {
          paintTerrain(terrainAt, shown);
          terrainVersion = terrainKey;
        } else placeTerrain(shown);
        shown += 1;
      }
      casters.show(shown);
      casters.container.filterArea = new Rectangle(
        Math.max(padding, left - RECEIVED_SHADOW_BLEED),
        Math.max(padding, top - RECEIVED_SHADOW_BLEED),
        Math.min(width - padding, right + RECEIVED_SHADOW_BLEED) - Math.max(padding, left - RECEIVED_SHADOW_BLEED),
        Math.min(height - padding, bottom + RECEIVED_SHADOW_BLEED) - Math.max(padding, top - RECEIVED_SHADOW_BLEED),
      );
      if (!receiverMask) {
        receiverMask = RenderTexture.create({ width, height });
        rig.drawMask(width, height, cutouts, cutoutRects, receiverMask);
      } else rig.eraser.texture = receiverMask;
      renderer.render({ container: root, target: atlas, clear: true, clearColor: [0, 0, 0, 0] });
      for (const texture of borrowed) textures.release(texture);
      borrowed.length = 0;
    },
    follow() {
      for (let index = 0; index < followers.length; index += 2) {
        const lean = followers[index].skew.x;
        const view = followers[index + 1];
        if (view.skew.x !== lean) view.skew.x = lean;
      }
    },
    destroy() {
      // The atlas first: destroying its source drops the listeners of the views' textures at once.
      atlas.destroy(true);
      receiverMask?.destroy(true);
      terrainMask?.texture.destroy(true);
      views.forEach(({ view }) => view.texture.destroy());
    },
  };
}
