import { PLAYER_FACINGS } from "../player";
export { getClimbPose, getIdlePose, getJumpPose, getWalkPose } from "../scene-order";
import type { SheetCell, SheetLayout } from "../render";
import type { PlayerClimbSheet, PlayerIdleSheet, PlayerJumpSheet, PlayerWalkSheet } from "../../types";

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

/** How the jetpack sheet of `sheet` is laid out: like `sheet`, one column, the jetpack on its own. */
export function getJetpackSheetLayout(sheet: PlayerWalkSheet): SheetLayout {
  return { ...getWalkSheetLayout(sheet), columns: 1 };
}

/** How `jump`, the jump sheet of `sheet`, is laid out: like `sheet`, one column per pose of a jump. */
export function getJumpSheetLayout(sheet: PlayerWalkSheet, jump: PlayerJumpSheet): SheetLayout {
  return { ...getWalkSheetLayout(sheet), columns: Math.max(...Object.values(jump.poses)) + 1 };
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
