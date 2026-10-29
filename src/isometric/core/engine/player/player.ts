import type {
  GridPoint,
  ChunkCoord,
  PlayerClimb,
  ITerrainColumn,
  PlayerFacing,
  PlayerPosition,
  PlayerRenderPosition,
  PlayerState,
  ScreenDirections,
  TerrainMaterial,
  WorldCoord,
  WorldPartKey,
  WorldPartReader,
  WorldRect,
  WorldSystem,
} from "../../types";
import { toChunkCoord, type ReadonlyCellMap } from "../grid";
import { TICKS_PER_SECOND } from "../time";
import { transitionPlayerMotion, type PlayerMotionEvent } from "./motion";

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

/** Vertical extent of the player's collision body above its feet, in blocks. */
export const PLAYER_BODY_HEIGHT = 0.6;

/** Distance below the last stable surface at which a fall is rescued. */
export const PLAYER_RESCUE_DROP = 2;

/** Most blocks the player climbs up or down from one column to the next. */
export const PLAYER_MAX_CLIMB = 1;

/** Blocks the player's feet rise at the top of a jump. */
export const PLAYER_JUMP_HEIGHT = 0.75;

/** Ticks a jump lasts on flat ground, from take-off to landing (half a second). */
export const PLAYER_JUMP_TICKS = 10;

/** Ticks for which a jump press can wait for landing (100 ms at 20 ticks/s). */
export const PLAYER_JUMP_BUFFER_TICKS = 2;

/** Ticks for which jumping remains possible after leaving a ledge (100 ms). */
export const PLAYER_COYOTE_TICKS = 2;

/** Blocks per tick the feet rise at take-off, so a jump peaks at {@link PLAYER_JUMP_HEIGHT}. */
export const PLAYER_JUMP_SPEED = (4 * PLAYER_JUMP_HEIGHT) / PLAYER_JUMP_TICKS;

/**
 * Blocks per tick its feet's upward speed drops each tick in the air: what brings a jump down after
 * {@link PLAYER_JUMP_TICKS}, and what makes the player fall when it walks off a lower column.
 */
export const PLAYER_GRAVITY = (8 * PLAYER_JUMP_HEIGHT) / PLAYER_JUMP_TICKS ** 2;

/**
 * Blocks the top of a column of each material sits below its elevation (game content: sand's
 * `topInset` in `TERRAIN_APPEARANCE`), so the player falls onto a sunken top instead of dropping
 * there in one frame.
 */
export type PlayerTopInset = (type: TerrainMaterial) => number;

/** Every top at its column's elevation. */
const NO_INSET: PlayerTopInset = () => 0;

/**
 * Blocks a top may stand above the player's feet and still be stepped onto in one tick, as today:
 * a higher one (a column one block up, or a full top from sand's sunken one) it climbs.
 */
export const PLAYER_STEP_HEIGHT = 0.25;

/** Ticks a climb of one block lasts (0.6 s); a lower one, its share of them. */
export const PLAYER_CLIMB_TICKS = 12;

/** Share of a climb its feet take to rise to the top; in the rest it steps onto it. */
export const PLAYER_CLIMB_RISE_SHARE = 0.7;

/** Columns past where it reaches the higher top the player walks on during a climb, so it stands on it. */
export const PLAYER_CLIMB_REACH = 0.25;

/** Feet closer to the ground than this, in blocks, have landed (rounding of the falling steps). */
const LANDING = 1e-9;

/**
 * Height of the feet above flat ground `tick` ticks into a jump: a parabola, `0` at take-off and on
 * landing ({@link PLAYER_JUMP_TICKS}), {@link PLAYER_JUMP_HEIGHT} halfway. The player follows it
 * under {@link PLAYER_GRAVITY} while the ground under it stays level.
 */
export function getJumpHeight(tick: number): number {
  const t = Math.min(Math.max(tick, 0), PLAYER_JUMP_TICKS);
  return (4 * PLAYER_JUMP_HEIGHT * t * (PLAYER_JUMP_TICKS - t)) / PLAYER_JUMP_TICKS ** 2;
}

/** Eases `t` (`0`–`1`) in and out: slow at both ends. */
function smoothstep(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Share of its rise a climb's feet have risen at `progress` (`0`–`1`) of it: eased in and out over
 * its first {@link PLAYER_CLIMB_RISE_SHARE}, then all of it.
 */
export function getClimbRise(progress: number): number {
  return smoothstep(progress / PLAYER_CLIMB_RISE_SHARE);
}

/**
 * Share of the way from `from` to `to` a climb has gone at `progress` (`0`–`1`) of it: none while
 * its feet rise, then eased in and out until it stands on the top.
 */
export function getClimbAdvance(progress: number): number {
  return smoothstep((progress - PLAYER_CLIMB_RISE_SHARE) / (1 - PLAYER_CLIMB_RISE_SHARE));
}

/** Key of the player part (`createPlayerPart()`): read it with `world.parts.get(PLAYER_PART)`. */
export const PLAYER_PART: WorldPartKey<PlayerState> = { id: "player" };

/**
 * Something standing on a column, as the player bumps into it (an `Entity` is one): a walkable
 * one never blocks; any other blocks a square centred on each column it stands on.
 */
export type PlayerObstacle = {
  readonly walkable: boolean;
  /** Height of its solid body; omitted means it blocks upward without a height limit. */
  readonly height?: number;
  /** World elevation at the bottom of its solid body; defaults to the column's elevation. */
  readonly elevation?: number;
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
  /** Loaded chunks, when terrain is streamed; an unloaded cell is not an intentional gap. */
  readonly chunks?: { has?(coord: ChunkCoord): boolean; loadAround?(point: GridPoint): void };
};

/** Why a requested walking step could not advance. */
export type PlayerBlockReason = "terrain" | "obstacle" | "climbing";

/** One deterministic simulation sample for movement diagnostics and scenario comparisons. */
export type PlayerStepSample = {
  readonly step: number;
  readonly input: { readonly walk: GridPoint; readonly jump: boolean };
  readonly contact: "ground" | "air" | "climbing";
  readonly position: PlayerPosition;
  readonly verticalSpeed: number | undefined;
  readonly blockReason?: PlayerBlockReason;
};

/** Receives samples without changing the simulation; callers can retain or aggregate them. */
export type PlayerStepProbe = (sample: PlayerStepSample) => void;

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
  return blockReasonAt(ground, point, fromElevation, 0, false, NO_INSET) === undefined;
}

/** Land under the centre of the feet; the surrounding square is checked for side clearance. */
function supportAt(ground: PlayerGround, point: GridPoint): ITerrainColumn | undefined {
  const { x, y } = getPlayerColumn(point);
  const column = ground.columnIndex.get(x, y);
  if (!column || column.type === "water") return undefined;
  for (const obstacle of ground.occupancy.at(x, y)) {
    const side = blockedSide(obstacle, x, y);
    if (
      side > 0 &&
      Math.abs(point.x - x) < PLAYER_RADIUS + side / 2 &&
      Math.abs(point.y - y) < PLAYER_RADIUS + side / 2
    )
      return undefined;
  }
  return column;
}

/** Checks side clearance at the world height of the feet, independently of ground support. */
function fitsInAir(ground: PlayerGround, point: GridPoint, feet: number, topInset: PlayerTopInset): boolean {
  return blockReasonAt(ground, point, 0, feet, true, topInset) === undefined;
}

/** Walking may leave a real void edge, but water remains a shore and unloaded cells remain solid. */
function canLeaveEdge(ground: PlayerGround, point: GridPoint, feet: number, topInset: PlayerTopInset): boolean {
  const cells = getPlayerCells(point);
  let missing = false;
  for (let x = cells.minX; x <= cells.maxX; x += 1) {
    for (let y = cells.minY; y <= cells.maxY; y += 1) {
      const column = ground.columnIndex.get(x, y);
      if (column?.type === "water") return false;
      if (!column) missing = true;
    }
  }
  return missing && fitsInAir(ground, point, feet, topInset);
}

/** Diagnoses a rejected step only when tracing is enabled. */
function blockReasonAt(
  ground: PlayerGround,
  point: GridPoint,
  elevation: number,
  feet: number,
  airborne: boolean,
  topInset: PlayerTopInset,
): PlayerBlockReason | undefined {
  const cells = getPlayerCells(point);
  for (let x = cells.minX; x <= cells.maxX; x += 1) {
    for (let y = cells.minY; y <= cells.maxY; y += 1) {
      const column = ground.columnIndex.get(x, y);
      if (!column && ground.chunks?.has && !ground.chunks.has(toChunkCoord({ x, y }))) return "terrain";
      if (airborne) {
        if (column && column.type !== "water" && feet < column.elevation - topInset(column.type) - LANDING)
          return "terrain";
      } else if (!isSteppable(ground, x, y, elevation)) return "terrain";
      for (const obstacle of ground.occupancy.at(x, y)) {
        const side = blockedSide(obstacle, x, y);
        if (
          side <= 0 ||
          Math.abs(point.x - x) >= PLAYER_RADIUS + side / 2 ||
          Math.abs(point.y - y) >= PLAYER_RADIUS + side / 2
        )
          continue;
        if (!airborne) return "obstacle";
        const base = obstacle.elevation ?? column?.elevation ?? 0;
        if (feet < base + (obstacle.height ?? Infinity) - LANDING && feet + PLAYER_BODY_HEIGHT > base + LANDING)
          return "obstacle";
      }
    }
  }
  return undefined;
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

/** Blocks the top of the column under `point` sits below its elevation, `0` off the terrain. */
function insetAt(ground: PlayerGround, point: GridPoint, topInset: PlayerTopInset): number {
  const { x, y } = getPlayerColumn(point);
  const column = ground.columnIndex.get(x, y);
  return column === undefined ? 0 : topInset(column.type);
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
  return {
    ...position,
    motion: { type: "idle" },
    inset: 0,
    height: 0,
    verticalSpeed: undefined,
    lastSafe: { ...position, inset: 0, height: 0 },
    wantsJump: false,
    jumpBufferTicks: 0,
    coyoteTicks: 0,
    jumpHeld: false,
    climb: undefined,
    previous: { ...position, inset: 0, height: 0 },
    walk: { x: 0, y: 0 },
  };
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

/** The eight facings, counter-clockwise on screen from east: the rows of a walk sheet. */
export const PLAYER_FACINGS: readonly PlayerFacing[] = [
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
  "south",
  "south-east",
];

/**
 * Index in {@link PLAYER_FACINGS} of the facing nearest the world direction `walk` (right on screen
 * is `+x −y`, up `+x +y`), or `undefined` for `(0, 0)`: someone standing keeps the way they faced.
 */
export function getPlayerFacing(walk: GridPoint): number | undefined {
  const across = walk.x - walk.y;
  const up = walk.x + walk.y;
  if (across === 0 && up === 0) return undefined;
  const octant = Math.round(Math.atan2(up, across) / (Math.PI / 4));
  return (octant + PLAYER_FACINGS.length) % PLAYER_FACINGS.length;
}

/** Sets the direction the player walks in from the screen directions held (the input). */
export function setPlayerWalk(player: PlayerState, directions: ScreenDirections): void {
  player.walk = getWalkDirection(directions);
}

/** Buffers one fresh jump press for a short, deterministic interval. */
export function jumpPlayer(player: PlayerState): void {
  player.wantsJump = true;
  player.jumpBufferTicks = PLAYER_JUMP_BUFFER_TICKS;
}

/** Tracks the held jump key; releasing it does not cancel a buffered press. */
export function setPlayerJumpHeld(player: PlayerState, held: boolean): void {
  player.jumpHeld = held;
}

/** Clears transient jump input and grace, for focus loss, pause or fall recovery. */
export function cancelPlayerJump(player: PlayerState): void {
  player.wantsJump = false;
  player.jumpBufferTicks = 0;
  player.coyoteTicks = 0;
  player.jumpHeld = false;
}

/** Converts the physical result of this tick to one event for the XState motion machine. */
function getMotionEvent(player: PlayerState): PlayerMotionEvent {
  const moved = player.x !== player.previous.x || player.y !== player.previous.y;
  if (player.climb) return { type: player.motion.type === "climbing" ? "CLIMB_TICK" : "CLIMB" };
  if (player.motion.type === "climbing") return { type: moved ? "CLIMB_DONE_WALKING" : "CLIMB_DONE_IDLE" };
  if (player.verticalSpeed !== undefined) return { type: player.verticalSpeed > 0 ? "JUMP" : "FALL" };
  if (player.motion.type === "jumping" || player.motion.type === "falling")
    return { type: moved ? "LAND_WALKING" : "LAND_IDLE" };
  return { type: moved ? "WALK" : "STOP" };
}

/** Advances locomotion through the XState machine and stores only its serializable state key. */
function updateMotion(player: PlayerState): void {
  const type = transitionPlayerMotion(player.motion.type, getMotionEvent(player));
  player.motion = { type };
}

/**
 * One tick in the air: takes off if asked to on the ground, starts falling if the ground dropped
 * away under its feet, rises and falls under {@link PLAYER_GRAVITY}, and lands on the column under it.
 */
function stepAir(
  player: PlayerState,
  ground: PlayerGround,
  topInset: PlayerTopInset,
): "landed" | "rescued" | undefined {
  const support = supportAt(ground, player);
  const top = support ? support.elevation - topInset(support.type) : undefined;
  const feet = player.elevation - player.inset + player.height;
  if (player.verticalSpeed === undefined) {
    if (player.height > 0 || top === undefined) player.verticalSpeed = 0;
    else return;
  }
  // The exact distance of a tick of constant gravity, so a jump on flat ground is `getJumpHeight()`.
  const nextFeet = feet + player.verticalSpeed - PLAYER_GRAVITY / 2;
  const landed = top !== undefined && player.verticalSpeed <= 0 && feet >= top - LANDING && nextFeet <= top + LANDING;
  player.height = landed ? 0 : nextFeet - (player.elevation - player.inset);
  player.verticalSpeed = landed ? undefined : player.verticalSpeed - PLAYER_GRAVITY;
  if (landed && support) {
    player.elevation = support.elevation;
    player.inset = topInset(support.type);
    player.lastSafe = { x: player.x, y: player.y, elevation: player.elevation, inset: player.inset, height: 0 };
    return "landed";
  } else if (nextFeet < player.lastSafe.elevation - player.lastSafe.inset - PLAYER_RESCUE_DROP) {
    const safe = player.lastSafe;
    player.x = safe.x;
    player.y = safe.y;
    player.elevation = safe.elevation;
    player.inset = safe.inset;
    player.height = 0;
    player.verticalSpeed = undefined;
    return "rescued";
  }
}

/** Moves the player one tick along its walk; blocked moves slide along the free axis. */
function stepOnce(
  player: PlayerState,
  ground: PlayerGround,
  topInset: PlayerTopInset,
  diagnose: boolean,
): PlayerBlockReason | undefined {
  const { walk } = player;
  if (walk.x === 0 && walk.y === 0) return;
  const from = { x: player.x, y: player.y };
  const moves = [
    { x: from.x + walk.x * PLAYER_STEP, y: from.y + walk.y * PLAYER_STEP },
    { x: from.x + walk.x * PLAYER_STEP, y: from.y },
    { x: from.x, y: from.y + walk.y * PLAYER_STEP },
  ];
  const airborne = player.verticalSpeed !== undefined;
  const feet = player.elevation - player.inset + player.height;
  const clearanceFeet =
    airborne && player.verticalSpeed! > 0 ? feet + player.verticalSpeed! - PLAYER_GRAVITY / 2 : feet;
  const next = moves.find(
    (move) =>
      (move.x !== from.x || move.y !== from.y) &&
      (airborne
        ? fitsInAir(ground, move, clearanceFeet, topInset)
        : fitsAt(ground, move, player.elevation) || canLeaveEdge(ground, move, feet, topInset)),
  );
  if (next === undefined)
    return diagnose ? blockReasonAt(ground, moves[0], player.elevation, clearanceFeet, airborne, topInset) : undefined;
  // The feet keep their height in the world: over a lower top (a lower column, or sand's sunken
  // one) they are higher above it and fall; onto a slightly higher one they step up on it, and onto
  // a higher one they climb, from where they are.
  const surface = supportAt(ground, next);
  const elevation = surface?.elevation ?? player.elevation;
  const inset = surface ? topInset(surface.type) : player.inset;
  const rise = elevation - inset - feet;
  if (!airborne && rise > PLAYER_STEP_HEIGHT) {
    player.climb = startClimb(ground, from, next, elevation, feet, rise);
    player.verticalSpeed = undefined;
    return;
  }
  player.x = next.x;
  player.y = next.y;
  player.elevation = elevation;
  player.inset = inset;
  player.height = airborne ? feet - (elevation - inset) : Math.max(0, feet - (elevation - inset));
  if (!airborne && player.height === 0) player.verticalSpeed = undefined;
}

/**
 * A climb from `from` onto the top `next` stands on, `rise` blocks above the feet (at `feet`): it
 * ends {@link PLAYER_CLIMB_REACH} columns further on that column, if the feet fit there, or at `next`.
 */
function startClimb(
  ground: PlayerGround,
  from: GridPoint,
  next: GridPoint,
  elevation: number,
  feet: number,
  rise: number,
): PlayerClimb {
  const length = Math.hypot(next.x - from.x, next.y - from.y);
  const direction = { x: (next.x - from.x) / length, y: (next.y - from.y) / length };
  const further = {
    x: next.x + direction.x * PLAYER_CLIMB_REACH,
    y: next.y + direction.y * PLAYER_CLIMB_REACH,
  };
  const column = getPlayerColumn(next);
  const onTop = getPlayerColumn(further);
  const fits = onTop.x === column.x && onTop.y === column.y && fitsAt(ground, further, elevation);
  return {
    from: { x: from.x, y: from.y },
    to: fits ? further : { x: next.x, y: next.y },
    direction,
    feet,
    rise,
    ticks: Math.round(PLAYER_CLIMB_TICKS * rise),
    tick: 0,
  };
}

/**
 * One tick of a climb: its feet rise towards the top ({@link getClimbRise}) and then it steps onto
 * it ({@link getClimbAdvance}), on whichever column is under it.
 */
function stepClimb(player: PlayerState, climb: PlayerClimb, ground: PlayerGround, topInset: PlayerTopInset): void {
  climb.tick += 1;
  const progress = climb.tick / climb.ticks;
  const advance = getClimbAdvance(progress);
  const point = {
    x: climb.from.x + (climb.to.x - climb.from.x) * advance,
    y: climb.from.y + (climb.to.y - climb.from.y) * advance,
  };
  const feet = climb.feet + climb.rise * getClimbRise(progress);
  player.x = point.x;
  player.y = point.y;
  player.elevation = elevationAt(ground, point);
  player.inset = insetAt(ground, point, topInset);
  const height = feet - (player.elevation - player.inset);
  player.height = height > LANDING ? height : 0;
}

/**
 * The player system: runs `ticks` simulation ticks (default `1`) of the player walking at
 * {@link PLAYER_SPEED}. Each tick it moves along `player.walk` if its feet fit there (land,
 * a climb of at most {@link PLAYER_MAX_CLIMB}, nothing in the way); otherwise it slides along
 * whichever axis is free, or stays. It jumps too: asked to (`jumpPlayer()`) on the ground, its
 * feet take off at {@link PLAYER_JUMP_SPEED} and gravity ({@link PLAYER_GRAVITY}) brings them down,
 * after {@link PLAYER_JUMP_TICKS} ticks on flat ground (`getJumpHeight()`). Its feet keep their
 * height when it walks onto a lower top (a lower column, or the sunken top of `topInset`, e.g. sand),
 * so it falls onto it, jumping or not; onto one at most {@link PLAYER_STEP_HEIGHT} above its feet it
 * steps up as on the ground, and onto a higher one (a column at most {@link PLAYER_MAX_CLIMB} up, or
 * a full top from sand) it climbs (`player.climb`): it stops at the foot of it, its feet rise to the
 * top in the first {@link PLAYER_CLIMB_RISE_SHARE} of {@link PLAYER_CLIMB_TICKS} ticks per block
 * and then it steps {@link PLAYER_CLIMB_REACH} columns onto it, its walk and jumps ignored until it
 * stands there. In the air it checks body clearance separately from support, so it can cross
 * real void gaps and short obstacles. A fresh press can wait for landing, and a press shortly
 * after leaving a void edge can still start a jump. Keeps
 * `player.previous` one tick behind for interpolation. Deterministic: the same walk and jumps on
 * the same ground give the same path.
 */
export function stepPlayer(
  player: PlayerState,
  ground: PlayerGround,
  ticks = 1,
  topInset = NO_INSET,
  probe?: PlayerStepProbe,
): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    // A climb is over the tick after its last one, so that one is drawn as part of it.
    if (player.climb && player.climb.tick >= player.climb.ticks) player.climb = undefined;
    const { climb } = player;
    // Standing still on the ground, every tick is the same: one is enough to settle `previous`.
    const resting =
      player.walk.x === 0 &&
      player.walk.y === 0 &&
      player.verticalSpeed === undefined &&
      player.jumpBufferTicks === 0 &&
      climb === undefined;
    if (resting && tick > 0) return;
    // On the ground its feet are on the top under it (a new or restored player starts at `0`).
    if (player.verticalSpeed === undefined && climb === undefined) player.inset = insetAt(ground, player, topInset);
    const { x, y, elevation, inset, height } = player;
    player.previous = { x, y, elevation, inset, height };
    const input = probe ? { walk: { ...player.walk }, jump: player.wantsJump } : undefined;
    if (climb) {
      // Climbing ignores queued presses; a late press near its end cannot cause a surprise jump.
      player.wantsJump = false;
      player.jumpBufferTicks = 0;
      player.coyoteTicks = 0;
      stepClimb(player, climb, ground, topInset);
      updateMotion(player);
      if (probe && input)
        probe({
          step: tick,
          input,
          contact: "climbing",
          position: {
            x: player.x,
            y: player.y,
            elevation: player.elevation,
            inset: player.inset,
            height: player.height,
          },
          verticalSpeed: player.verticalSpeed,
          blockReason: "climbing",
        });
      continue;
    }
    const groundedAtStart =
      player.verticalSpeed === undefined && player.height === 0 && supportAt(ground, player) !== undefined;
    if (groundedAtStart) player.coyoteTicks = PLAYER_COYOTE_TICKS;
    if (player.jumpBufferTicks > 0 && (groundedAtStart || player.coyoteTicks > 0)) {
      player.verticalSpeed = PLAYER_JUMP_SPEED;
      player.wantsJump = false;
      player.jumpBufferTicks = 0;
      player.coyoteTicks = 0;
    }
    const blockReason = stepOnce(player, ground, topInset, probe !== undefined);
    const airResult = player.climb === undefined ? stepAir(player, ground, topInset) : undefined;
    if (player.climb) {
      player.wantsJump = false;
      player.jumpBufferTicks = 0;
      player.coyoteTicks = 0;
    } else if (airResult === "rescued") {
      cancelPlayerJump(player);
    } else if (airResult === "landed" && player.jumpBufferTicks > 0) {
      player.verticalSpeed = PLAYER_JUMP_SPEED;
      player.wantsJump = false;
      player.jumpBufferTicks = 0;
      player.coyoteTicks = 0;
    } else {
      if (player.jumpBufferTicks > 0) {
        player.jumpBufferTicks -= 1;
        player.wantsJump = player.jumpBufferTicks > 0;
      }
      if (player.verticalSpeed === undefined && supportAt(ground, player)) player.coyoteTicks = PLAYER_COYOTE_TICKS;
      else if (!groundedAtStart && player.coyoteTicks > 0) player.coyoteTicks -= 1;
    }
    if (player.verticalSpeed === undefined && supportAt(ground, player))
      player.lastSafe = { x: player.x, y: player.y, elevation: player.elevation, inset: player.inset, height: 0 };
    updateMotion(player);
    if (probe && input)
      probe({
        step: tick,
        input,
        contact: player.verticalSpeed === undefined ? "ground" : "air",
        position: { x: player.x, y: player.y, elevation: player.elevation, inset: player.inset, height: player.height },
        verticalSpeed: player.verticalSpeed,
        ...(blockReason ? { blockReason } : {}),
      });
  }
}

/**
 * How far through its climb the player is drawn this frame, `alpha` of a tick after `previous`
 * (`0` at the foot, `1` standing on the top), or `undefined` when it is not climbing.
 */
export function getPlayerClimbProgress(player: PlayerState, alpha: number): number | undefined {
  const { climb } = player;
  if (climb === undefined) return undefined;
  const t = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));
  return Math.min(1, Math.max(0, (climb.tick - 1 + t) / climb.ticks));
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
 * ({@link PLAYER_PART}) walks one step (`stepPlayer()`) on the world's ground, whose tops sink by
 * `options.topInset` (the terrain content's, e.g. sand's half block; none by default), and then stands in
 * `world.movers` on the columns its feet take (`getPlayerCells()`): moved there on its first step
 * and whenever those columns change, not on every tick, so AI or collisions can find it by cell.
 *
 * @throws On a step, when the world has no player part.
 */
export function createPlayerSystem(
  options: { readonly topInset?: PlayerTopInset; readonly probe?: PlayerStepProbe } = {},
): WorldSystem<PlayerWorld> {
  // Where the player was last put in which index: a restored world has a new one of both.
  let placed: { movers: PlayerMovers; player: PlayerState; cells: WorldRect } | undefined;
  return {
    id: "player",
    step: (world) => {
      const player = world.parts.get(PLAYER_PART);
      stepPlayer(player, world, 1, options.topInset, options.probe);
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
export function getPlayerRenderPosition(player: PlayerState, alpha: number): PlayerRenderPosition {
  const t = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));
  const lerp = (from: number, to: number) => from + (to - from) * t;
  return {
    x: lerp(player.previous.x, player.x),
    y: lerp(player.previous.y, player.y),
    elevation: lerp(player.previous.elevation, player.elevation),
    inset: lerp(player.previous.inset ?? 0, player.inset),
    height: lerp(player.previous.height ?? 0, player.height),
  };
}
