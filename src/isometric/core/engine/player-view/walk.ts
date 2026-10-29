import { PLAYER_FACINGS } from "../player";
import type { SheetCell, SheetLayout } from "../render";
import type { PlayerClimbSheet, PlayerIdleSheet, PlayerJumpPhase, PlayerJumpSheet, PlayerWalkSheet } from "../../types";

/** Facing the player starts with, before it walks: towards the camera. */
export const PLAYER_START_FACING = PLAYER_FACINGS.indexOf("south");

/** How `sheet` is laid out: one row per facing, the standing pose and then its walk poses. */
export function getWalkSheetLayout(sheet: PlayerWalkSheet): SheetLayout {
  return {
    columns: sheet.frames + 1,
    rows: PLAYER_FACINGS.length,
    cellWidth: sheet.cell.width,
    cellHeight: sheet.cell.height,
    gap: sheet.gap,
  };
}

/** How `idle`, the idle sheet of `sheet`, is laid out: like `sheet`, one column per pose of its cycle. */
export function getIdleSheetLayout(sheet: PlayerWalkSheet, idle: PlayerIdleSheet): SheetLayout {
  return { ...getWalkSheetLayout(sheet), columns: idle.frames };
}

/** How `climb`, the climb sheet of `sheet`, is laid out: like `sheet`, one column per pose of a climb. */
export function getClimbSheetLayout(sheet: PlayerWalkSheet, climb: PlayerClimbSheet): SheetLayout {
  return { ...getWalkSheetLayout(sheet), columns: climb.frames };
}

/** How `jump`, the jump sheet of `sheet`, is laid out: like `sheet`, one column per pose of a jump. */
export function getJumpSheetLayout(sheet: PlayerWalkSheet, jump: PlayerJumpSheet): SheetLayout {
  return { ...getWalkSheetLayout(sheet), columns: Math.max(...Object.values(jump.poses)) + 1 };
}

/** Column of a jump sheet showing a player in `phase` of a jump, or `undefined` on the ground. */
export function getJumpPose(phase: PlayerJumpPhase, jump: PlayerJumpSheet): number | undefined {
  return phase === "ground" ? undefined : jump.poses[phase];
}

/**
 * Column of a climb sheet showing a player `progress` (`0`–`1`) through its climb
 * (`getPlayerClimbProgress()`): its poses in order, each for an equal share of the climb.
 */
export function getClimbPose(progress: number, climb: PlayerClimbSheet): number {
  return Math.min(climb.frames - 1, Math.max(0, Math.floor(progress * climb.frames)));
}

/**
 * Column of an idle sheet showing a player that has stood still `ms` real milliseconds: where it is
 * in its cycle, one cycle every `period` (column `0`, standing, first).
 */
export function getIdlePose(ms: number, idle: PlayerIdleSheet): number {
  const cycle = (Math.max(0, ms) % idle.period) / idle.period;
  return Math.min(idle.frames - 1, Math.floor(cycle * idle.frames));
}

/** The window of the character's canvas every cell of `sheet` shows, in fractions of the canvas. */
export function getWalkSheetCell(sheet: PlayerWalkSheet): SheetCell {
  const { canvas, cell } = sheet;
  return {
    x: cell.x / canvas.width,
    y: cell.y / canvas.height,
    width: cell.width / canvas.width,
    height: cell.height / canvas.height,
  };
}

/**
 * Column of `sheet` showing a player that has walked `distance` columns since it set off: the pose
 * of the cycle it is in, one cycle per `stride` columns (column `0`, standing, is never returned).
 * By distance, not time, so the feet keep pace with the ground at any speed.
 */
export function getWalkPose(distance: number, sheet: Pick<PlayerWalkSheet, "frames" | "stride">): number {
  const cycle = (distance / sheet.stride) % 1;
  return 1 + Math.min(sheet.frames - 1, Math.floor(cycle * sheet.frames));
}
