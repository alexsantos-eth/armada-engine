import { getClimbPose, getIdlePose, getWalkPose } from "./poses";

type FrameSheet = { readonly frames: number };

/** Data needed to choose a player's sheet and column without creating a texture. */
export type PlayerFrameInput = {
  readonly walk: FrameSheet & { readonly stride: number };
  readonly climb?: FrameSheet;
  readonly idle?: FrameSheet & { readonly period: number };
  readonly jumpPose?: number;
  readonly climbing?: number;
  readonly walking: boolean;
  readonly flying: boolean;
  readonly walked?: number;
  readonly stoodMs?: number;
  readonly airPose?: number;
};

/** A sheet identifier and its zero-based column. */
export type PlayerFrame = { readonly sheet: "walk" | "climb" | "jump" | "idle"; readonly pose: number };

/**
 * Selects the sheet and column for the current presentation state. A climb takes precedence over
 * an airborne pose; a declared jump sheet takes precedence over the generic airborne walk pose.
 */
export function selectPlayerFrame(input: PlayerFrameInput): PlayerFrame {
  if (input.climbing !== undefined)
    return input.climb
      ? { sheet: "climb", pose: getClimbPose(input.climbing, input.climb) }
      : { sheet: "walk", pose: 0 };
  if (input.jumpPose !== undefined) return { sheet: "jump", pose: input.jumpPose };
  if (input.idle && !input.walking && !input.flying)
    return { sheet: "idle", pose: getIdlePose(input.stoodMs ?? 0, input.idle) };
  return {
    sheet: "walk",
    pose: input.flying ? (input.airPose ?? 0) : input.walking ? getWalkPose(input.walked ?? 0, input.walk) : 0,
  };
}
