import { Container, type Filter, Matrix, Rectangle, Sprite, Texture } from "pixi.js";
import type { Affine2D, AffineTarget, EntityLengthAxis, IsoScreenBox, TileMetrics } from "../../types";
import { type DepthView, getFootprintSliceTiles, NEW_SPRITES, type SpriteSource } from "../render";

/** Resolution of the shadow maps: texels per world tile along each axis. */
export const SHADOW_MAP_PIXELS_PER_TILE = 16;

/** Blur strength (texels) applied to the silhouettes in the shadow maps: soft shadow edges. */
export const SHADOW_BLUR = 2;

/** A 2D point: screen pixels or world tiles, as each function documents. */
export type PlanePoint = { readonly x: number; readonly y: number };

/** `outer ∘ inner`: the transform that applies `inner` first, then `outer`. */
export function composeAffine(outer: Affine2D, inner: Affine2D): Affine2D {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx,
    ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty,
  };
}

// Only read by `setFromMatrix()`, never kept: one matrix for every sprite placed.
const placement = new Matrix();
const toMatrix = ({ a, b, c, d, tx, ty }: Affine2D) => placement.set(a, b, c, d, tx, ty);

/**
 * Transform that lays a tile's square of the shadow map (`texelsWide` × `texelsDeep` texels,
 * `+x` right and `+y` down in the map) onto the tile's top diamond on screen, centred on
 * `tileTop`, the screen point of the centre of the tile's top face.
 */
export function getGroundShadowMatrix(
  tileTop: PlanePoint,
  metrics: TileMetrics,
  texelsWide: number,
  texelsDeep = texelsWide,
): Affine2D {
  return {
    a: metrics.tileWidth / (2 * texelsWide),
    b: -metrics.tileHeight / (2 * texelsWide),
    c: -metrics.tileWidth / (2 * texelsDeep),
    d: -metrics.tileHeight / (2 * texelsDeep),
    tx: tileTop.x,
    ty: tileTop.y + metrics.tileHeight / 2,
  };
}

/**
 * Creates the view that draws a tile's part of a shadow map on its top face. Added right after
 * the tile with the tile's depth, it lies on the tile and under anything standing on it or in
 * front of it. Always visible at full opacity: what it shows (ambient occlusion, sun shadows
 * and their opacity) is drawn into the map, so the scene never touches it again.
 *
 * @param texture The tile's square of its chunk's shadow map: its frame, whatever its size, is
 * laid over the whole top (a square inset half a texel on a side still covers it).
 * @param sprites Where the sprite comes from, e.g. a `SpritePool`.
 */
export function createGroundShadowView(
  texture: Texture,
  tileTop: PlanePoint,
  metrics: TileMetrics,
  depth: number,
  sprites: SpriteSource = NEW_SPRITES,
): DepthView {
  const sprite = sprites.take(texture);
  sprite.setFromMatrix(toMatrix(getGroundShadowMatrix(tileTop, metrics, texture.frame.width, texture.frame.height)));
  return { view: sprite, depth };
}

/**
 * A caster's silhouette for the shadow textures: one of its sprites, cropped at its foot. Plain
 * data over shared textures, so it can be kept and paired freely; what draws it is one of the
 * black sprites a draw borrows (`createCasterSprites()`).
 */
export type Silhouette = {
  /** The sprite's texture cropped at its foot: what the shadow textures draw, in black. */
  readonly texture: Texture;
  /** The entity's sprite it copies, drawn in the scene: what other casters' shadows fall on. */
  readonly source: Sprite;
  /** Draw depth of `source`. */
  readonly depth: number;
  /** World tile the sprite stands on. */
  readonly worldFoot: PlanePoint;
  /** Screen point of that tile's centre at the caster's ground level. */
  readonly screenFoot: PlanePoint;
  /** Screen rectangle of the silhouette (the sprite cropped at its foot). */
  readonly display: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
};

const croppedTextures = new WeakMap<Texture, Map<number, Texture>>();

/** `texture` keeping its top `fraction` of rows, cached per texture and crop. */
function cropTexture(texture: Texture, fraction: number): Texture {
  if (fraction >= 1) return texture;
  const byCrop = croppedTextures.get(texture) ?? new Map<number, Texture>();
  croppedTextures.set(texture, byCrop);
  const height = Math.max(1, Math.round(texture.frame.height * fraction));
  const cached = byCrop.get(height);
  if (cached) return cached;
  const { x, y, width } = texture.frame;
  const cropped = new Texture({ source: texture.source, frame: new Rectangle(x, y, width, height) });
  byCrop.set(height, cropped);
  return cropped;
}

/**
 * Silhouettes of an entity's sprites (as returned by `createBlockViews()`), one per sprite: a
 * multi-tile entity's strips each stand on their own footprint tile. Each is cropped at its
 * foot, so only what stands above the ground casts a shadow. Debug outlines are skipped.
 */
export function createSilhouettes(
  views: readonly DepthView[],
  box: IsoScreenBox,
  metrics: TileMetrics,
  length = 1,
  lengthAxis: EntityLengthAxis = "x",
): Silhouette[] {
  const sprites = views.filter((item): item is DepthView & { view: Sprite } => item.view instanceof Sprite);
  const tiles = sprites.length > 1 ? getFootprintSliceTiles(length, lengthAxis) : [0];
  const sideways = lengthAxis === "y" ? -1 : 1;

  return sprites.map(({ view: source, depth }, index) => {
    const tile = tiles[index];
    const screenFoot = {
      x: box.screenX + sideways * tile * (metrics.tileWidth / 2),
      y: box.screenY - tile * (metrics.tileHeight / 2),
    };
    const left = source.x - source.anchor.x * source.width;
    const top = source.y - source.anchor.y * source.height;
    const fraction = Math.min(Math.max((screenFoot.y - top) / source.height, 0), 1);

    return {
      texture: cropTexture(source.texture, fraction),
      source,
      depth,
      worldFoot: {
        x: box.x + (lengthAxis === "x" ? tile : 0),
        y: box.y + (lengthAxis === "y" ? tile : 0),
      },
      screenFoot,
      display: { left, top, width: source.width, height: source.height * fraction },
    };
  });
}

/**
 * Black sprites that draw silhouettes into shadow textures, shared by every texture a module draws
 * (#97): a draw lays its casters on the first sprites (`sprite()`), shows only those (`show()`) and
 * renders, so the module keeps as many sprites as its largest draw needs instead of one per caster
 * of every texture. A Pixi sprite is some forty objects for the garbage collector to walk, and a
 * sprite per caster of every map of the shown chunks was over a third of the sprites of the game.
 */
export type CasterSprites = {
  /** Holds the sprites, with the shadow filters: the container a draw renders holds it. */
  readonly container: Container;
  /** The draw's sprite number `index` (counted from 0, one after another), showing `texture`. */
  sprite(index: number, texture: Texture): Sprite;
  /**
   * Shows the first `count` sprites only, and the container only when it holds some: an empty
   * container would still run its filters. Visibility is written only where it changes.
   */
  show(count: number): void;
  /** Destroys the container and its sprites, not their textures. */
  destroy(): void;
};

/** Creates {@link CasterSprites} drawn with `filters`; it makes its sprites as draws need them. */
export function createCasterSprites(filters: readonly Filter[]): CasterSprites {
  const container = new Container();
  container.filters = [...filters];
  const sprites: Sprite[] = [];
  // Sprites `[0, shown)` are visible, the others hidden.
  let shown = 0;
  return {
    container,
    sprite(index, texture) {
      const kept = sprites[index];
      if (kept) {
        kept.texture = texture;
        return kept;
      }
      const sprite = new Sprite(texture);
      sprite.tint = 0x000000;
      sprite.visible = false;
      sprites.push(sprite);
      container.addChild(sprite);
      return sprite;
    },
    show(count) {
      for (let index = count; index < shown; index += 1) sprites[index].visible = false;
      for (let index = shown; index < count; index += 1) sprites[index].visible = true;
      shown = count;
      if (container.visible !== count > 0) container.visible = count > 0;
    },
    destroy: () => container.destroy({ children: true }),
  };
}

/**
 * Transform that draws a silhouette into a shadow map: texture pixels → screen pixels relative
 * to its foot → world tiles on the map's ground plane (`world`, from `getSilhouetteMatrix()`)
 * → shadow-map texels, from `mapOrigin` (the world point at texel `(0, 0)`). Written into `out`
 * (a new object by default) and composed in place: a shadow redraw places hundreds of
 * silhouettes, and the intermediate transforms of each one fed the garbage collector.
 */
export function getSilhouetteMapMatrix(
  silhouette: Silhouette,
  world: Affine2D,
  mapOrigin: PlanePoint,
  pixelsPerTile: number,
  out: AffineTarget = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 },
): Affine2D {
  const { frame } = silhouette.texture;
  const { display, screenFoot } = silhouette;
  // To the foot: texture pixels scaled to the display, from the foot.
  const scaleX = display.width / frame.width;
  const scaleY = display.height / frame.height;
  const footX = display.left - screenFoot.x;
  const footY = display.top - screenFoot.y;
  // To the map: world tiles from its origin, in texels.
  out.a = pixelsPerTile * world.a * scaleX;
  out.b = pixelsPerTile * world.b * scaleX;
  out.c = pixelsPerTile * world.c * scaleY;
  out.d = pixelsPerTile * world.d * scaleY;
  out.tx = pixelsPerTile * (world.a * footX + world.c * footY + world.tx - mapOrigin.x);
  out.ty = pixelsPerTile * (world.b * footX + world.d * footY + world.ty - mapOrigin.y);
  return out;
}

/**
 * Places `sprite`, a sprite of `silhouette` (`CasterSprites.sprite()`), in a shadow map (see
 * {@link getSilhouetteMapMatrix}). Its visibility is left alone: `CasterSprites.show()` decides it.
 */
export function placeSilhouette(
  sprite: Sprite,
  silhouette: Silhouette,
  world: Affine2D,
  mapOrigin: PlanePoint,
  pixelsPerTile: number,
): void {
  getSilhouetteMapMatrix(silhouette, world, mapOrigin, pixelsPerTile, placement);
  sprite.setFromMatrix(placement);
}
