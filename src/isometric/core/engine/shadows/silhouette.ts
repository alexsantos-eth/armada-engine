import { Matrix, Rectangle, Sprite, Texture } from "pixi.js";
import type { Affine2D, EntityLengthAxis, IsoScreenBox, TileMetrics } from "../../types";
import { type DepthView, getFootprintSliceTiles } from "../render";

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

const toMatrix = ({ a, b, c, d, tx, ty }: Affine2D) => new Matrix(a, b, c, d, tx, ty);

/**
 * Transform that lays a tile's square of the shadow map (`pixelsPerTile` texels a side, `+x`
 * right and `+y` down in the map) onto the tile's top diamond on screen, centred on `tileTop`,
 * the screen point of the centre of the tile's top face.
 */
export function getGroundShadowMatrix(tileTop: PlanePoint, metrics: TileMetrics, pixelsPerTile: number): Affine2D {
  const halfWidth = metrics.tileWidth / (2 * pixelsPerTile);
  const halfHeight = metrics.tileHeight / (2 * pixelsPerTile);
  return {
    a: halfWidth,
    b: -halfHeight,
    c: -halfWidth,
    d: -halfHeight,
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
 * @param texture The tile's square of the shadow map of its elevation.
 */
export function createGroundShadowView(
  texture: Texture,
  tileTop: PlanePoint,
  metrics: TileMetrics,
  depth: number,
  pixelsPerTile = SHADOW_MAP_PIXELS_PER_TILE,
): DepthView {
  const sprite = new Sprite(texture);
  sprite.setFromMatrix(toMatrix(getGroundShadowMatrix(tileTop, metrics, pixelsPerTile)));
  return { view: sprite, depth };
}

/** A caster's silhouette for the shadow maps: a black copy of one of its sprites. */
export type Silhouette = {
  /** Black sprite drawn into the shadow maps (never into the scene). */
  readonly sprite: Sprite;
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
    const sprite = new Sprite(cropTexture(source.texture, fraction));
    sprite.tint = 0x000000;

    return {
      sprite,
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
 * Transform that draws a silhouette into a shadow map: texture pixels → screen pixels relative
 * to its foot → world tiles on the map's ground plane (`world`, from `getSilhouetteMatrix()`)
 * → shadow-map texels, from `mapOrigin` (the world point at texel `(0, 0)`).
 */
export function getSilhouetteMapMatrix(
  silhouette: Silhouette,
  world: Affine2D,
  mapOrigin: PlanePoint,
  pixelsPerTile: number,
): Affine2D {
  const { frame } = silhouette.sprite.texture;
  const { display, screenFoot } = silhouette;
  const toFoot: Affine2D = {
    a: display.width / frame.width,
    b: 0,
    c: 0,
    d: display.height / frame.height,
    tx: display.left - screenFoot.x,
    ty: display.top - screenFoot.y,
  };
  const toMap: Affine2D = {
    a: pixelsPerTile,
    b: 0,
    c: 0,
    d: pixelsPerTile,
    tx: -mapOrigin.x * pixelsPerTile,
    ty: -mapOrigin.y * pixelsPerTile,
  };
  return composeAffine(toMap, composeAffine(world, toFoot));
}

/**
 * Places a silhouette in a shadow map (see {@link getSilhouetteMapMatrix}). Its visibility is
 * left alone: changing `visible` marks the render group's structure as changed and rebuilds all
 * its draw instructions.
 */
export function placeSilhouette(
  silhouette: Silhouette,
  world: Affine2D,
  mapOrigin: PlanePoint,
  pixelsPerTile: number,
): void {
  silhouette.sprite.setFromMatrix(toMatrix(getSilhouetteMapMatrix(silhouette, world, mapOrigin, pixelsPerTile)));
}
