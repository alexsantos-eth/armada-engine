/** Affine transform in Pixi's convention: `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`. */
export type Affine2D = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
};

/**
 * How the sun lays shadows on the ground at a given moment: the direction they fall along and
 * how far a unit of height reaches. Derived from the sun state; `null` at night.
 */
export type ShadowProjection = {
  /** Unit direction shadows fall along on the ground, world `x`. */
  readonly dirX: number;
  /** Unit direction shadows fall along on the ground, world `y`. */
  readonly dirY: number;
  /** Ground length (tiles) of the shadow of one tile of height: `1 / tan(altitude)`, capped. */
  readonly stretch: number;
  /** Shadow opacity in `[0, 1]`: `0` at the horizon, full once the sun is high enough. */
  readonly alpha: number;
};
