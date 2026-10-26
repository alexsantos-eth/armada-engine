import { PLAYER_FACINGS } from "../player";
import type { SheetCell, SheetLayout } from "../render";
import type { PlayerWalkSheet } from "../../types";

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
