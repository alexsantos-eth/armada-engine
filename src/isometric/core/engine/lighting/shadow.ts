import type { Affine2D, ShadowProjection, SunState, TileMetrics } from "../../types";
import { BOX_HEIGHT, TILE_WIDTH } from "../constants";

/**
 * Ground tiles per screen pixel of height. In the 2:1 projection a tile edge spans
 * `tileWidth / 2` px across the screen at 45° and a vertical unit is `√(5/2)` times shorter
 * than that per pixel, so one pixel of height is `√(5/2) / tileWidth` tiles.
 */
const tilesPerPixelOfHeight = (metrics: TileMetrics) => Math.sqrt(5 / 2) / metrics.tileWidth;

/** Height of one block in tiles of world length (about half a tile). */
export const BLOCK_HEIGHT_IN_TILES = (BOX_HEIGHT / TILE_WIDTH) * Math.sqrt(5 / 2);

/** Cap on how far a unit of height reaches when the sun is low (`1 / tan(altitude)`). */
export const MAX_SHADOW_STRETCH = 4;

/** Opacity of shadows in full sun. */
export const SHADOW_ALPHA = 0.32;

/** Sun elevation (sine of its altitude) from which shadows reach full opacity. */
export const SHADOW_FADE_ELEVATION = 0.25;

/**
 * Ticks between shadow redraws (half a second of game time at real speed): the sun moves a
 * fraction of a degree in that time, so redrawing every tick would cost without showing.
 */
export const SHADOW_REFRESH_TICKS = 10;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * How the sun lays shadows on the ground: direction opposite to the sun, ground length per
 * unit of height (`1 / tan(altitude)`, capped at {@link MAX_SHADOW_STRETCH}) and opacity
 * (fading in from the horizon to {@link SHADOW_FADE_ELEVATION}). `null` while the sun is at or
 * below the horizon. Pure: the same sun always gives the same projection.
 */
export function getShadowProjection(sun: SunState): ShadowProjection | null {
  if (sun.elevation <= 0) return null;

  const horizontal = Math.hypot(sun.direction.x, sun.direction.y);
  return {
    dirX: horizontal > 0 ? -sun.direction.x / horizontal : 1,
    dirY: horizontal > 0 ? -sun.direction.y / horizontal : 0,
    stretch: Math.min(horizontal / sun.elevation, MAX_SHADOW_STRETCH),
    alpha: SHADOW_ALPHA * smoothstep(0, SHADOW_FADE_ELEVATION, sun.elevation),
  };
}

/**
 * Lays a sprite's silhouette on the ground as its shadow. Maps screen pixels relative to the
 * sprite's foot (`x` right, `y` down) to world tiles on a ground plane, treating the sprite as
 * an upright cut-out standing on its foot and turned to face the sun (objects have volume: a
 * tree crown casts its full width whatever the sun's azimuth, where a flat card seen edge-on
 * would cast a line). A pixel across the sprite is laid across the shadow, perpendicular to
 * it, at the sprite's own width (a screen pixel spans `√2 / tileWidth` tiles); a pixel `h` px
 * above the foot is laid `h` px of height × `stretch` away along the shadow direction. With
 * the sun behind the camera (shadows straight up the screen) this is the sprite seen as is.
 *
 * @param foot World position (tiles) of the point the sprite stands on.
 * @param lift Blocks between the caster's ground and the plane the shadow falls on (`0` for
 * its own ground; `2` for ground two blocks lower, where the shadow lands further away).
 */
export function getSilhouetteMatrix(
  projection: ShadowProjection,
  foot: { readonly x: number; readonly y: number },
  lift: number,
  metrics: TileMetrics,
): Affine2D {
  const perPixel = tilesPerPixelOfHeight(metrics);
  const reachPerPixel = projection.stretch * perPixel;
  const liftReach = projection.stretch * lift * metrics.boxHeight * perPixel;

  const acrossPerPixel = Math.SQRT2 / metrics.tileWidth;

  return {
    // Across the shadow: (dirY, −dirX), which is screen right when shadows point straight up.
    a: acrossPerPixel * projection.dirY,
    b: -acrossPerPixel * projection.dirX,
    c: -reachPerPixel * projection.dirX,
    d: -reachPerPixel * projection.dirY,
    tx: foot.x + liftReach * projection.dirX,
    ty: foot.y + liftReach * projection.dirY,
  };
}

/**
 * Where the sun lays a caster's silhouette on another entity, both upright cut-outs turned to
 * face the sun as in {@link getSilhouetteMatrix}. A sun ray through the caster reaches the
 * receiver `along` tiles further down the shadow and `along / stretch` tiles of height lower,
 * keeping its offset across the shadow; so every pixel of the caster's silhouette, relative to
 * the caster's foot, lands on the receiver at the same point relative to the receiver's foot
 * plus the returned offset (screen pixels, `y` down). Rows the offset moves below the
 * receiver's foot fell on the ground before reaching it.
 *
 * `null` when the receiver is not down the shadow from the caster (beside or towards the sun),
 * or when the sun is straight overhead.
 *
 * @param casterFoot World position (tiles) the caster stands on.
 * @param receiverFoot World position (tiles) the receiver stands on.
 * @param lift Blocks the caster stands above the receiver (negative when below).
 */
export function getCastShadowOffset(
  projection: ShadowProjection,
  casterFoot: { readonly x: number; readonly y: number },
  receiverFoot: { readonly x: number; readonly y: number },
  lift: number,
  metrics: TileMetrics,
): { x: number; y: number } | null {
  const toX = receiverFoot.x - casterFoot.x;
  const toY = receiverFoot.y - casterFoot.y;
  const along = projection.dirX * toX + projection.dirY * toY;
  if (along <= 0 || projection.stretch <= 0) return null;

  // Across the shadow: (dirY, −dirX), screen right as in `getSilhouetteMatrix()`.
  const across = -(projection.dirY * toX - projection.dirX * toY);
  return {
    x: across / (Math.SQRT2 / metrics.tileWidth),
    y: along / (projection.stretch * tilesPerPixelOfHeight(metrics)) - lift * metrics.boxHeight,
  };
}

/**
 * Farthest ground distance (tiles) the shadow of something `height` screen pixels tall can
 * reach, `lift` blocks above the ground it falls on, with the sun as low as shadows get
 * ({@link MAX_SHADOW_STRETCH}). Whatever stands farther away is never shaded by it.
 */
export function getShadowReach(height: number, lift: number, metrics: TileMetrics): number {
  return Math.max(0, MAX_SHADOW_STRETCH * tilesPerPixelOfHeight(metrics) * (height + lift * metrics.boxHeight));
}
