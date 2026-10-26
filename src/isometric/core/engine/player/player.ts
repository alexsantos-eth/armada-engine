import type {
  GridPoint,
  ITerrainColumn,
  PlayerPosition,
  PlayerState,
  ScreenDirections,
  WorldCoord,
  WorldPartKey,
  WorldPartReader,
  WorldRect,
  WorldSystem,
} from "../../types";
import type { ReadonlyCellMap } from "../grid";
import { TICKS_PER_SECOND } from "../time";

/** Walking speed of the player, in columns per second of simulation (`TICKS_PER_SECOND` ticks). */
export const PLAYER_SPEED = 3;

/** Columns a walking player moves in one tick. */
export const PLAYER_STEP = PLAYER_SPEED / TICKS_PER_SECOND;

/**
 * Half the side of the square the player's feet take on the ground, in columns. Every column
 * that square touches must be land it can step on, and the square must not overlap where an
 * occupant blocks (`collisionAt()`), so the sprite never stands half inside a tree's trunk.
 */
export const PLAYER_RADIUS = 0.2;

/** Most blocks the player climbs up or down from one column to the next. */
export const PLAYER_MAX_CLIMB = 1;

/** Key of the player part (`createPlayerPart()`): read it with `world.parts.get(PLAYER_PART)`. */
export const PLAYER_PART: WorldPartKey<PlayerState> = { id: "player" };

/**
 * Something standing on a column, as the player bumps into it (an `Entity` is one): a walkable
 * one never blocks; any other blocks a square centred on each column it stands on.
 */
export type PlayerObstacle = {
  readonly walkable: boolean;
  /**
   * Side of the square it blocks centred on column `(x, y)`, as a fraction of the block (`0` for
   * nothing, `1` for the whole block). Without it, the whole block.
   */
  collisionAt?(x: number, y: number): number;
};

/**
 * What the player walks on: the terrain columns, and what occupies each one. The `World`
 * satisfies it (`world.columnIndex`, `world.occupancy`), so the player never imports the world.
 */
export type PlayerGround = {
  /** Terrain column at each world cell (its top elevation and, as `type`, its surface). */
  readonly columnIndex: ReadonlyCellMap<ITerrainColumn>;
  /** Things standing on each cell; the player's feet cannot overlap the square one blocks. */
  readonly occupancy: { at(x: number, y: number): readonly PlayerObstacle[] };
};

/** Side of the square `obstacle` blocks centred on column `(x, y)`: `0` when it is walkable. */
function blockedSide(obstacle: PlayerObstacle, x: number, y: number): number {
  if (obstacle.walkable) return 0;
  return obstacle.collisionAt ? obstacle.collisionAt(x, y) : 1;
}

/** Whether the player's terrain lets it onto column `(x, y)` from `fromElevation` (occupants aside). */
function isSteppable(ground: PlayerGround, x: number, y: number, fromElevation: number): boolean {
  const column = ground.columnIndex.get(x, y);
  if (column === undefined || column.type === "water") return false;
  return Math.abs(column.elevation - fromElevation) <= PLAYER_MAX_CLIMB;
}

/** Column the ground point `point` belongs to: the one whose centre is nearest. */
export function getPlayerColumn(point: GridPoint): WorldCoord {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * Whether the player can stand on the centre of column `(x, y)` coming from `fromElevation`: the
 * column exists, is not water, is at most {@link PLAYER_MAX_CLIMB} blocks higher or lower, and
 * nothing standing on it blocks any of it (`collisionAt()` above `0`).
 */
export function canStandOn(ground: PlayerGround, x: number, y: number, fromElevation: number): boolean {
  if (!isSteppable(ground, x, y, fromElevation)) return false;
  return ground.occupancy.at(x, y).every((occupant) => blockedSide(occupant, x, y) <= 0);
}

/**
 * Whether the player's feet fit at `point`, coming from `fromElevation`: every column their
 * square touches can be stepped on, and the square overlaps none of the squares its occupants
 * block (touching their edge is allowed).
 */
function fitsAt(ground: PlayerGround, point: GridPoint, fromElevation: number): boolean {
  const min = getPlayerColumn({ x: point.x - PLAYER_RADIUS, y: point.y - PLAYER_RADIUS });
  const max = getPlayerColumn({ x: point.x + PLAYER_RADIUS, y: point.y + PLAYER_RADIUS });
  for (let x = min.x; x <= max.x; x += 1) {
    for (let y = min.y; y <= max.y; y += 1) {
      if (!isSteppable(ground, x, y, fromElevation)) return false;
      const occupants = ground.occupancy.at(x, y);
      for (let index = 0; index < occupants.length; index += 1) {
        const side = blockedSide(occupants[index], x, y);
        if (side <= 0) continue;
        const reach = PLAYER_RADIUS + side / 2;
        if (Math.abs(point.x - x) < reach && Math.abs(point.y - y) < reach) return false;
      }
    }
  }
  return true;
}

/**
 * Whether the player's feet fit standing at the ground point `point`, from the elevation of the
 * column under it: every column its square touches is walkable (see {@link canStandOn}).
 */
export function fitsPlayerAt(ground: PlayerGround, point: GridPoint): boolean {
  return fitsAt(ground, point, elevationAt(ground, point));
}

/** Elevation of the column under `point`, or `0` off the terrain. */
function elevationAt(ground: PlayerGround, point: GridPoint): number {
  const { x, y } = getPlayerColumn(point);
  return ground.columnIndex.get(x, y)?.elevation ?? 0;
}

/** Columns around the centre, on every side, a new player's spawn is searched in (a chunk's width). */
export const PLAYER_SPAWN_RADIUS = 32;

/**
 * Where a new player appears: the centre of the walkable column nearest `centre` (ties broken by
 * `x`, then `y`), so the same world always spawns the player in the same place. The search goes in
 * square rings around `centre`, out to {@link PLAYER_SPAWN_RADIUS} columns, and stops as soon as no
 * further ring can hold a nearer column; only the loaded columns count. With no walkable column
 * there, the player goes on the nearest column even if it is water, and with no column at all, on
 * `centre` itself at elevation `0`.
 */
export function findPlayerSpawn(ground: PlayerGround, centre: GridPoint): PlayerPosition {
  const distance = (column: WorldCoord) => (column.x - centre.x) ** 2 + (column.y - centre.y) ** 2;
  const before = (a: ITerrainColumn, b: ITerrainColumn | undefined) =>
    b === undefined || (distance(a) - distance(b) || a.x - b.x || a.y - b.y) < 0;
  const origin = { x: Math.floor(centre.x), y: Math.floor(centre.y) };
  let walkable: ITerrainColumn | undefined;
  let any: ITerrainColumn | undefined;

  for (let radius = 0; radius <= PLAYER_SPAWN_RADIUS; radius += 1) {
    // Every column of a ring is at least `radius - 1` away from `centre`.
    if (walkable && (radius - 1) ** 2 > distance(walkable)) break;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const column = ground.columnIndex.get(origin.x + dx, origin.y + dy);
        if (column === undefined) continue;
        if (before(column, any)) any = column;
        if (before(column, walkable) && canStandOn(ground, column.x, column.y, column.elevation)) walkable = column;
      }
    }
  }
  const spawn = walkable ?? any;
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
 * Columns the player's feet take standing at `point`: every column the square of side
 * `2 × PLAYER_RADIUS` around it touches (one to four), as an inclusive rectangle.
 */
export function getPlayerCells(point: GridPoint): WorldRect {
  const min = getPlayerColumn({ x: point.x - PLAYER_RADIUS, y: point.y - PLAYER_RADIUS });
  const max = getPlayerColumn({ x: point.x + PLAYER_RADIUS, y: point.y + PLAYER_RADIUS });
  return { minX: min.x, minY: min.y, maxX: max.x, maxY: max.y };
}

/** What moves through the world (`world.movers`), as the player system keeps itself in it. */
export type PlayerMovers = {
  /** Puts `item` on `cells`, taking it off the cells it was on (adding it when it was not there). */
  move(item: object, cells: readonly WorldCoord[]): void;
};

/**
 * A world with a player: its ground, its index of what moves and its parts, among them the
 * player ({@link PLAYER_PART}). The `World` is one.
 */
export type PlayerWorld = PlayerGround & { readonly movers: PlayerMovers; readonly parts: WorldPartReader };

/**
 * The player as a game system for `stepWorld()`: each tick, the world's player
 * ({@link PLAYER_PART}) walks one step (`stepPlayer()`) on the world's ground, and then stands in
 * `world.movers` on the columns its feet take (`getPlayerCells()`): moved there on its first step
 * and whenever those columns change, not on every tick, so AI or collisions can find it by cell.
 *
 * @throws On a step, when the world has no player part.
 */
export function createPlayerSystem(): WorldSystem<PlayerWorld> {
  // Where the player was last put in which index: a restored world has a new one of both.
  let placed: { movers: PlayerMovers; player: PlayerState; cells: WorldRect } | undefined;
  return {
    id: "player",
    step: (world) => {
      const player = world.parts.get(PLAYER_PART);
      stepPlayer(player, world);
      const cells = getPlayerCells(player);
      if (
        placed?.movers === world.movers &&
        placed.player === player &&
        placed.cells.minX === cells.minX &&
        placed.cells.minY === cells.minY &&
        placed.cells.maxX === cells.maxX &&
        placed.cells.maxY === cells.maxY
      )
        return;
      const covered: WorldCoord[] = [];
      for (let x = cells.minX; x <= cells.maxX; x += 1)
        for (let y = cells.minY; y <= cells.maxY; y += 1) covered.push({ x, y });
      world.movers.move(player, covered);
      placed = { movers: world.movers, player, cells };
    },
  };
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
