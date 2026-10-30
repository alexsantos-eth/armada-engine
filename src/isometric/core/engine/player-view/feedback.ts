import { getPlayerColumn, PLAYER_JUMP_SPEED } from "../player";
import type { RandomSource } from "../random";
import type { GridPoint, TileMetrics } from "../../types";

/** Real milliseconds the body squashes after a landing. */
export const LANDING_SQUASH_MS = 180;

/** Real milliseconds the body stretches after a take-off. */
export const TAKEOFF_STRETCH_MS = 120;

/** Real milliseconds a puff of dust lasts, at a take-off or a landing. */
export const DUST_MS = 360;

/** Opacity of a puff of dust as it rises, fading to `0` over {@link DUST_MS}. */
export const DUST_ALPHA = 0.85;

/** Landings softer than this, in blocks per tick (a step down onto sand), raise no dust. */
export const DUST_MIN_IMPACT = 0.1;

/** How much of an effect lasting `duration` is left `ms` after it started: `1` → `0`, `0` after. */
function remaining(ms: number, duration: number): number {
  return Math.max(0, 1 - Math.max(0, ms) / duration);
}

/**
 * Scale of the body `ms` real milliseconds after a take-off (`sinceTakeoff`) or a landing at
 * `impact` blocks per tick (`sinceLanding`), about its feet: stretched up as it takes off, squashed
 * as it lands (harder landings squash more), `{ x: 1, y: 1 }` once both are over.
 */
export function getBodyScale(sinceTakeoff: number, sinceLanding: number, impact: number): GridPoint {
  const squash = remaining(sinceLanding, LANDING_SQUASH_MS) * Math.min(1.5, Math.max(0.25, impact / PLAYER_JUMP_SPEED));
  const stretch = remaining(sinceTakeoff, TAKEOFF_STRETCH_MS);
  return { x: 1 + 0.1 * squash - 0.06 * stretch, y: 1 - 0.14 * squash + 0.1 * stretch };
}

/**
 * A puff of dust `ms` real milliseconds after it rose: how far through its life it is (`0` → `1`)
 * and how opaque it is, or `undefined` once it is gone ({@link DUST_MS}).
 */
export function getDust(ms: number): { readonly progress: number; readonly alpha: number } | undefined {
  const left = remaining(ms, DUST_MS);
  if (left === 0) return undefined;
  return { progress: 1 - left, alpha: DUST_ALPHA * left };
}

/**
 * How the voxels of a kind of puff of dust are scattered: how many, how far from the feet they
 * start and drift outward (in columns), how big (in tiles), how high they start and rise (in
 * blocks), and how far a kick pushes them (`kick`, in columns: back from where the player runs).
 */
export type DustShape = {
  readonly voxels: number;
  readonly radius: readonly [number, number];
  readonly drift: readonly [number, number];
  readonly size: readonly [number, number];
  readonly lift: number;
  readonly rise: number;
  readonly kick: number;
};

/** The puff of a take-off or a landing: a ring of voxels that bursts out from the feet. */
export const BURST_DUST: DustShape = {
  voxels: 12,
  radius: [0.05, 0.2],
  drift: [0.15, 0.3],
  size: [0.04, 0.08],
  lift: 0.08,
  rise: 0.14,
  kick: 0,
};

/** The small puff a running or skidding player kicks up behind its feet. */
export const KICK_DUST: DustShape = {
  voxels: 4,
  radius: [0, 0.08],
  drift: [0.04, 0.1],
  size: [0.035, 0.06],
  lift: 0.05,
  rise: 0.1,
  kick: 0.22,
};

/**
 * A voxel of a puff of dust: where it starts, in columns from the feet (`x`, `y`) and in blocks
 * above them (`lift`), the columns it drifts (`driftX`, `driftY`) and blocks it rises (`rise`) over
 * the puff's life, its size in tiles and its `shade`, a light grey tint.
 */
export type DustVoxel = {
  readonly x: number;
  readonly y: number;
  readonly driftX: number;
  readonly driftY: number;
  readonly lift: number;
  readonly rise: number;
  readonly size: number;
  readonly shade: number;
};

/** Darkest a voxel's shade gets, per channel, below white. */
const DUST_SHADE_RANGE = 0x24;

/**
 * The voxels of a puff of dust of `shape`, scattered by `random`: spread round the feet at even
 * angles, each turned, sized, lifted and shaded on its own, so no two puffs look alike. `kick`, a
 * direction on the ground (unit or zero), shifts the puff that way and pushes it on as it drifts.
 */
export function getDustVoxels(shape: DustShape, random: RandomSource, kick: GridPoint = { x: 0, y: 0 }): DustVoxel[] {
  const between = ([low, high]: readonly [number, number]) => low + (high - low) * random();
  const turn = random();
  return Array.from({ length: shape.voxels }, (_, index) => {
    const angle = ((index + turn + 0.6 * random()) / shape.voxels) * 2 * Math.PI;
    const across = { x: Math.cos(angle), y: Math.sin(angle) };
    const radius = between(shape.radius);
    const drift = between(shape.drift);
    const grey = 0xff - Math.floor(DUST_SHADE_RANGE * random());
    return {
      x: across.x * radius + kick.x * shape.kick * 0.3,
      y: across.y * radius + kick.y * shape.kick * 0.3,
      driftX: across.x * drift + kick.x * shape.kick,
      driftY: across.y * drift + kick.y * shape.kick,
      lift: shape.lift * random(),
      rise: shape.rise * (0.5 + random()),
      size: between(shape.size),
      shade: grey * 0x010101,
    };
  });
}

/** Where a voxel of dust is and how big, as {@link getDustVoxelAt} writes it. */
export type DustVoxelState = { x: number; y: number; height: number; size: number };

/**
 * Writes into `out` where `voxel` is `progress` of the way through its puff's life (`0` → `1`):
 * in columns from the feet and blocks above them, drifting and rising fast at first and slowing
 * down, and shrinking as it fades. Returns `out`.
 */
export function getDustVoxelAt(voxel: DustVoxel, progress: number, out: DustVoxelState): DustVoxelState {
  const eased = 1 - (1 - progress) * (1 - progress);
  out.x = voxel.x + voxel.driftX * eased;
  out.y = voxel.y + voxel.driftY * eased;
  out.height = voxel.lift + voxel.rise * eased;
  out.size = voxel.size * (1 - 0.4 * progress);
  return out;
}

/**
 * The column a voxel of dust at `point` (on the ground, in columns) is drawn with, for feet at
 * `feet` and `level` blocks up, `topAt` giving a column's top (`undefined` where there is none):
 * the column it is over (the feet's own where there is none), at that column's top or, if the top
 * is higher than the feet (a wall), at the block the feet are level with, so the blocks above hide
 * the dust that drifts into the wall. `behind` says whether it is further from the camera than the
 * feet, in the feet's column, or than the column's centre in any other: drawn before what stands
 * there, else after.
 */
export function getDustColumn(
  point: GridPoint,
  feet: GridPoint,
  level: number,
  topAt: (x: number, y: number) => number | undefined,
): { readonly x: number; readonly y: number; readonly elevation: number; readonly behind: boolean } {
  const own = getPlayerColumn(feet);
  const over = getPlayerColumn(point);
  const reach = Math.round(level);
  const top = topAt(over.x, over.y);
  const column = top === undefined ? own : over;
  const centre = column.x === own.x && column.y === own.y ? feet : column;
  return {
    ...column,
    elevation: Math.min(top ?? topAt(own.x, own.y) ?? reach, reach),
    behind: point.x + point.y > centre.x + centre.y,
  };
}

/** The three faces of a voxel seen from the camera, as flat `[x, y, x, y…]` screen points. */
export type VoxelFaces = { readonly top: number[]; readonly left: number[]; readonly right: number[] };

/**
 * A small voxel standing on the ground, `size` tiles wide, its bottom centred `x` tiles across and
 * `y` tiles down from a point: its top and its two sides facing the camera, in screen pixels from
 * that point, with the proportions of a terrain block (`metrics`), so a puff of dust looks like the
 * world's voxels.
 */
export function getVoxelFaces(x: number, y: number, size: number, metrics: TileMetrics): VoxelFaces {
  const cx = x * metrics.tileWidth;
  const cy = y * metrics.tileWidth;
  const w = (size * metrics.tileWidth) / 2;
  const t = (size * metrics.tileHeight) / 2;
  const v = size * metrics.boxHeight;
  return {
    top: [cx, cy - v - t, cx + w, cy - v, cx, cy - v + t, cx - w, cy - v],
    left: [cx - w, cy - v, cx, cy - v + t, cx, cy + t, cx - w, cy],
    right: [cx, cy - v + t, cx + w, cy - v, cx + w, cy, cx, cy + t],
  };
}
