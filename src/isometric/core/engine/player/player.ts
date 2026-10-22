import type { GridPoint, ITerrainColumn, PlayerPosition, PlayerState, ScreenDirections, WorldCoord } from "../../types";
import type { ReadonlyCellMap } from "../grid";
import { TICKS_PER_SECOND } from "../time";

/** Walking speed of the player, in columns per second of simulation (`TICKS_PER_SECOND` ticks). */
export const PLAYER_SPEED = 0.3;

/** Columns a walking player moves in one tick. */
export const PLAYER_STEP = PLAYER_SPEED / TICKS_PER_SECOND;

/**
 * Half the side of the square the player's feet take on the ground, in columns. Every column
 * that square touches must be walkable, so the sprite never stands half inside a tree.
 */
export const PLAYER_RADIUS = 0.2;

/** Most blocks the player climbs up or down from one column to the next. */
export const PLAYER_MAX_CLIMB = 1;

/**
 * What the player walks on: the terrain columns, and what occupies each one. The `World`
 * satisfies it (`world.columnIndex`, `world.occupancy`), so the player never imports the world.
 */
export type PlayerGround = {
  /** Terrain column at each world cell (its top elevation and, as `type`, its surface). */
  readonly columnIndex: ReadonlyCellMap<ITerrainColumn>;
  /** Things standing on each cell; the player cannot enter a cell with a non-walkable one. */
  readonly occupancy: { at(x: number, y: number): readonly { readonly walkable: boolean }[] };
};

/** Column the ground point `point` belongs to: the one whose centre is nearest. */
export function getPlayerColumn(point: GridPoint): WorldCoord {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * Whether the player can stand on column `(x, y)` coming from `fromElevation`: the column
 * exists, is not water, is at most {@link PLAYER_MAX_CLIMB} blocks higher or lower, and
 * nothing non-walkable stands on it.
 */
export function canStandOn(ground: PlayerGround, x: number, y: number, fromElevation: number): boolean {
  const column = ground.columnIndex.get(x, y);
  if (column === undefined || column.type === "water") return false;
  if (Math.abs(column.elevation - fromElevation) > PLAYER_MAX_CLIMB) return false;
  return ground.occupancy.at(x, y).every((occupant) => occupant.walkable);
}

/** Whether the player's feet fit at `point`, coming from `fromElevation`. */
function fitsAt(ground: PlayerGround, point: GridPoint, fromElevation: number): boolean {
  const min = getPlayerColumn({ x: point.x - PLAYER_RADIUS, y: point.y - PLAYER_RADIUS });
  const max = getPlayerColumn({ x: point.x + PLAYER_RADIUS, y: point.y + PLAYER_RADIUS });
  for (let x = min.x; x <= max.x; x += 1) {
    for (let y = min.y; y <= max.y; y += 1) {
      if (!canStandOn(ground, x, y, fromElevation)) return false;
    }
  }
  return true;
}

/** Elevation of the column under `point`, or `0` off the terrain. */
function elevationAt(ground: PlayerGround, point: GridPoint): number {
  const { x, y } = getPlayerColumn(point);
  return ground.columnIndex.get(x, y)?.elevation ?? 0;
}

/**
 * Where a new player appears: the centre of the walkable column nearest `centre` (ties broken
 * by `x`, then `y`), so the same world always spawns the player in the same place. A world
 * with no walkable column puts the player on the column nearest `centre`, and a world with no
 * columns at `centre` itself, at elevation `0`.
 */
export function findPlayerSpawn(ground: PlayerGround, centre: GridPoint): PlayerPosition {
  const distance = (column: WorldCoord) => (column.x - centre.x) ** 2 + (column.y - centre.y) ** 2;
  const blocked = (column: ITerrainColumn) => Number(!canStandOn(ground, column.x, column.y, column.elevation));
  const [spawn] = [...ground.columnIndex.values()].sort(
    (a, b) => blocked(a) - blocked(b) || distance(a) - distance(b) || a.x - b.x || a.y - b.y,
  );
  return spawn ? { x: spawn.x, y: spawn.y, elevation: spawn.elevation } : { ...centre, elevation: 0 };
}

/** Creates a standing player at the ground point `at`, on the column under it. */
export function createPlayer(ground: PlayerGround, at: GridPoint): PlayerState {
  const position = { x: at.x, y: at.y, elevation: elevationAt(ground, at) };
  return { ...position, previous: { ...position }, walk: { x: 0, y: 0 } };
}

/**
 * World direction (unit vector, or `(0, 0)`) for the screen directions held: up walks north
 * (`+x +y`), right east (`+x −y`). Opposite directions cancel; diagonals on screen walk along
 * one world axis at the same speed.
 */
export function getWalkDirection(directions: ScreenDirections): GridPoint {
  const across = Number(directions.right) - Number(directions.left);
  const up = Number(directions.up) - Number(directions.down);
  const x = across + up;
  const y = up - across;
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/** Sets the direction the player walks in from the screen directions held (the input). */
export function setPlayerWalk(player: PlayerState, directions: ScreenDirections): void {
  player.walk = getWalkDirection(directions);
}

/** Moves the player one tick along its walk; blocked moves slide along the free axis. */
function stepOnce(player: PlayerState, ground: PlayerGround): void {
  const { walk } = player;
  if (walk.x === 0 && walk.y === 0) return;
  const from = { x: player.x, y: player.y };
  const moves = [
    { x: from.x + walk.x * PLAYER_STEP, y: from.y + walk.y * PLAYER_STEP },
    { x: from.x + walk.x * PLAYER_STEP, y: from.y },
    { x: from.x, y: from.y + walk.y * PLAYER_STEP },
  ];
  const next = moves.find((move) => (move.x !== from.x || move.y !== from.y) && fitsAt(ground, move, player.elevation));
  if (next === undefined) return;
  player.x = next.x;
  player.y = next.y;
  player.elevation = elevationAt(ground, next);
}

/**
 * The player system: runs `ticks` simulation ticks (default `1`) of the player walking at
 * {@link PLAYER_SPEED}. Each tick it moves along `player.walk` if its feet fit there (land,
 * a climb of at most {@link PLAYER_MAX_CLIMB}, nothing in the way); otherwise it slides along
 * whichever axis is free, or stays. Keeps `player.previous` one tick behind for interpolation.
 * Deterministic: the same walk on the same ground gives the same path.
 */
export function stepPlayer(player: PlayerState, ground: PlayerGround, ticks = 1): void {
  const standing = player.walk.x === 0 && player.walk.y === 0;
  // Standing still, every tick is the same: one is enough to settle `previous`.
  const steps = standing ? Math.min(ticks, 1) : ticks;
  for (let tick = 0; tick < steps; tick += 1) {
    player.previous = { x: player.x, y: player.y, elevation: player.elevation };
    stepOnce(player, ground);
  }
}

/**
 * Ground point and elevation where the player is drawn this frame: between `previous` and
 * the current position, `alpha` of a tick (`getInterpolationAlpha()`) after `previous`.
 */
export function getPlayerRenderPosition(player: PlayerState, alpha: number): PlayerPosition {
  const t = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));
  const lerp = (from: number, to: number) => from + (to - from) * t;
  return {
    x: lerp(player.previous.x, player.x),
    y: lerp(player.previous.y, player.y),
    elevation: lerp(player.previous.elevation, player.elevation),
  };
}
