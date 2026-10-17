import { Matrix, Sprite, type Texture } from "pixi.js";
import type { IsoScreenBox, ShadowShape, TileMetrics } from "../../types";
import { type DepthView, getBlockDepth } from "./render";

/** Affine transform in Pixi's convention: `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`. */
export type ShadowMatrix = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
};

/**
 * Transform that lays a centred shadow texture of `size` on the ground as `shape`: texture
 * pixels → ellipse in tiles (scale, then rotation by `shape.angle`, then the centre offset) →
 * screen through the 2:1 projection, from `origin`, the screen point of the caster's anchor
 * tile centre at its ground level.
 */
export function getShadowMatrix(
  shape: ShadowShape,
  origin: { readonly x: number; readonly y: number },
  metrics: TileMetrics,
  size: { readonly width: number; readonly height: number },
): ShadowMatrix {
  const cos = Math.cos(shape.angle);
  const sin = Math.sin(shape.angle);
  const scaleAlong = (2 * shape.radiusAlong) / size.width;
  const scaleAcross = (2 * shape.radiusAcross) / size.height;
  // Texture pixels → ground tiles.
  const qa = cos * scaleAlong;
  const qb = sin * scaleAlong;
  const qc = -sin * scaleAcross;
  const qd = cos * scaleAcross;
  // Ground tiles → screen: x' = (x − y)·w/2, y' = −(x + y)·h/2.
  const halfWidth = metrics.tileWidth / 2;
  const halfHeight = metrics.tileHeight / 2;

  return {
    a: halfWidth * (qa - qb),
    b: -halfHeight * (qa + qb),
    c: halfWidth * (qc - qd),
    d: -halfHeight * (qc + qd),
    tx: origin.x + halfWidth * (shape.centerX - shape.centerY),
    ty: origin.y - halfHeight * (shape.centerX + shape.centerY),
  };
}

/**
 * Creates the shadow sprite of a caster standing on `box`, hidden until it is placed with
 * {@link placeShadowView}. Its depth is the caster's anchor tile depth: added after the
 * terrain and before the caster's own views, it lies on the ground under the caster and over
 * the tiles behind it, where shadows fall.
 */
export function createShadowView(texture: Texture, box: IsoScreenBox, metrics: TileMetrics): DepthView {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.visible = false;
  return { view: sprite, depth: getBlockDepth(box, metrics) };
}

/** Lays `view` on the ground as `shape`, or hides it when there is no shadow (`null`). */
export function placeShadowView(
  view: Sprite,
  shape: ShadowShape | null,
  origin: { readonly x: number; readonly y: number },
  metrics: TileMetrics,
): void {
  if (!shape) {
    view.visible = false;
    return;
  }
  const { a, b, c, d, tx, ty } = getShadowMatrix(shape, origin, metrics, view.texture);
  view.setFromMatrix(new Matrix(a, b, c, d, tx, ty));
  view.alpha = shape.alpha;
  view.visible = true;
}
