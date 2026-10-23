import type { WorldRect } from "./grid";

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
 * A writable {@link Affine2D}, for the functions that write their result into one instead of
 * making a new object (Pixi's `Matrix` is one).
 */
export type AffineTarget = { -readonly [Key in keyof Affine2D]: Affine2D[Key] };

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

/**
 * The terrain as ambient occlusion sees it, described with lookups so the computation depends
 * on neither `World` nor Pixi. Columns outside the world return `undefined`.
 */
export type OcclusionTerrain = {
  /** Columns covered by the occlusion maps (inclusive). */
  readonly bounds: WorldRect;
  /** Height of a column's top surface in blocks (a sand top is half a block below its block). */
  topHeightAt(x: number, y: number): number | undefined;
  /** Top elevation of a column: the shadow map level its top belongs to. */
  levelAt(x: number, y: number): number | undefined;
};
