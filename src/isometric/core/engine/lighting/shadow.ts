import type { ShadowCaster, ShadowShape, SunState } from "../../types";
import { BOX_HEIGHT, TILE_WIDTH } from "../constants";

/**
 * Height of one block in tiles of world length. In the 2:1 projection a tile edge spans
 * `TILE_WIDTH / 2` px across the screen at 45° and a vertical unit is `√(5/2)` times shorter
 * than that per pixel, so a block (`BOX_HEIGHT` px) is about half a tile tall.
 */
export const BLOCK_HEIGHT_IN_TILES = (BOX_HEIGHT / TILE_WIDTH) * Math.sqrt(5 / 2);

/** Longest shadow, in tiles: a low sun would otherwise stretch shadows across the map. */
export const MAX_SHADOW_LENGTH = 3;

/** Opacity of a shadow in full sun. */
export const SHADOW_ALPHA = 0.3;

/** Sun elevation (sine of its altitude) from which shadows reach full opacity. */
export const SHADOW_FADE_ELEVATION = 0.25;

/** Half-size of a one-tile footprint, in tiles: a little inside the tile. */
export const FOOTPRINT_HALF_SIZE = 0.4;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Shadow cast on the ground by a caster under a sun, as an ellipse: it starts under the
 * footprint (a contact shadow, as wide as the footprint seen from the sun) and stretches away
 * from the sun by `height / tan(altitude)`, capped at {@link MAX_SHADOW_LENGTH}. It fades in
 * from the horizon to {@link SHADOW_FADE_ELEVATION}. Returns `null` while the sun is at or
 * below the horizon. Pure: the same sun and caster always give the same shape.
 *
 * The ellipse never extends past the footprint toward `−x` or `−y`, where the tiles in front
 * of the caster are: those are drawn after it and would cut the shadow. With the sun always in
 * front of the scene (`getSunState()`), only a multi-tile footprint seen at an angle could
 * reach them; the ellipse is then moved back just enough.
 */
export function getShadowShape(sun: SunState, caster: ShadowCaster): ShadowShape | null {
  if (sun.elevation <= 0) return null;

  const horizontal = Math.hypot(sun.direction.x, sun.direction.y);
  const ux = horizontal > 0 ? -sun.direction.x / horizontal : 1;
  const uy = horizontal > 0 ? -sun.direction.y / horizontal : 0;
  const length = Math.min(
    (caster.height * BLOCK_HEIGHT_IN_TILES * horizontal) / sun.elevation,
    MAX_SHADOW_LENGTH,
  );

  // Footprint as an ellipse around its centre: half-sizes along x and y, in tiles.
  const extra = (caster.length - 1) / 2;
  const halfX = FOOTPRINT_HALF_SIZE + (caster.lengthAxis === "x" ? extra : 0);
  const halfY = FOOTPRINT_HALF_SIZE + (caster.lengthAxis === "y" ? extra : 0);
  const extentAlong = Math.hypot(ux * halfX, uy * halfY);
  const extentAcross = Math.hypot(uy * halfX, ux * halfY);

  const angle = Math.atan2(uy, ux);
  const radiusAlong = extentAlong + length / 2;
  const radiusAcross = extentAcross;
  const centerX = (caster.lengthAxis === "x" ? extra : 0) + (ux * length) / 2;
  const centerY = (caster.lengthAxis === "y" ? extra : 0) + (uy * length) / 2;
  // Half-extents of the rotated ellipse along x and y.
  const reachX = Math.hypot(radiusAlong * Math.cos(angle), radiusAcross * Math.sin(angle));
  const reachY = Math.hypot(radiusAlong * Math.sin(angle), radiusAcross * Math.cos(angle));

  return {
    centerX: Math.max(centerX, reachX - FOOTPRINT_HALF_SIZE),
    centerY: Math.max(centerY, reachY - FOOTPRINT_HALF_SIZE),
    angle,
    radiusAlong,
    radiusAcross,
    alpha: SHADOW_ALPHA * smoothstep(0, SHADOW_FADE_ELEVATION, sun.elevation),
  };
}
