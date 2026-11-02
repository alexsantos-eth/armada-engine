import type { PlayerClimbSheet, PlayerIdleSheet, PlayerJumpPhase, PlayerJumpSheet, PlayerWalkSheet } from "../../types";

/** Column of the jump sheet, or none while grounded. */
export function getJumpPose(phase: PlayerJumpPhase, jump: Pick<PlayerJumpSheet, "poses">): number | undefined {
  return phase === "ground" ? undefined : jump.poses[phase];
}

/** Equal-length sections of a climb, clamped to the first and last poses. */
export function getClimbPose(progress: number, climb: Pick<PlayerClimbSheet, "frames">): number {
  return Math.min(climb.frames - 1, Math.max(0, Math.floor(progress * climb.frames)));
}

/** Idle column after real elapsed milliseconds, looping once per period. */
export function getIdlePose(ms: number, idle: Pick<PlayerIdleSheet, "frames" | "period">): number {
  const cycle = (Math.max(0, ms) % idle.period) / idle.period;
  return Math.min(idle.frames - 1, Math.floor(cycle * idle.frames));
}

/** Walk column by distance, including backwards pedalling; column zero is standing. */
export function getWalkPose(distance: number, sheet: Pick<PlayerWalkSheet, "frames" | "stride">): number {
  const cycle = (((distance / sheet.stride) % 1) + 1) % 1;
  return 1 + Math.min(sheet.frames - 1, Math.floor(cycle * sheet.frames));
}
