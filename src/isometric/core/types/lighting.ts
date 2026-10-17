import type { EntityLengthAxis } from "./entities";

/** What a shadow depends on: the caster's height and footprint (an entity's own fields). */
export type ShadowCaster = {
  /** Height in blocks. */
  readonly height: number;
  /** Footprint length in tiles. */
  readonly length: number;
  /** Axis the footprint extends along from its anchor tile. */
  readonly lengthAxis: EntityLengthAxis;
};

/**
 * A cast shadow as an ellipse lying on the ground, in tiles and world grid axes. Positions
 * are relative to the centre of the caster's anchor tile, at the caster's ground level.
 */
export type ShadowShape = {
  /** Ellipse centre along `x`, in tiles from the anchor tile centre. */
  readonly centerX: number;
  /** Ellipse centre along `y`, in tiles from the anchor tile centre. */
  readonly centerY: number;
  /** Direction of the long axis on the ground, in radians from `+x` toward `+y`. */
  readonly angle: number;
  /** Half-length along `angle`, in tiles. */
  readonly radiusAlong: number;
  /** Half-width across `angle`, in tiles. */
  readonly radiusAcross: number;
  /** Opacity in `[0, 1]`. */
  readonly alpha: number;
};
