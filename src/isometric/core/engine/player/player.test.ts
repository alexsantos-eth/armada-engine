import { describe, expect, it, vi } from "vitest";
import type {
  ITerrainColumn,
  PlayerJumpPhase,
  PlayerState,
  SimulationEvents,
  ScreenDirections,
  TerrainMaterial,
  WorldPartKey,
} from "../../types";
import { createEventBus } from "../events";
import { CellMap, SpatialIndex } from "../grid";
import { TICKS_PER_SECOND } from "../time";
import {
  PLAYER_MAX_CLIMB,
  PLAYER_CLIMB_REACH,
  PLAYER_CLIMB_RISE_SHARE,
  PLAYER_CLIMB_TICKS,
  PLAYER_STEP_HEIGHT,
  getClimbAdvance,
  getClimbRise,
  getPlayerClimbProgress,
  PLAYER_PART,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_STEP,
  PLAYER_GROUND_ACCEL,
  PLAYER_GROUND_BRAKE,
  PLAYER_RUN_SPEED,
  PLAYER_RUN_STEP,
  isPlayerRunning,
  isPlayerSkidding,
  setPlayerRun,
  PLAYER_AIR_ACCEL,
  PLAYER_AIR_BRAKE,
  PLAYER_CORNER_NUDGE,
  type PlayerGround,
  type PlayerObstacle,
  type PlayerStepSample,
  canStandOn,
  createPlayer,
  createPlayerSystem,
  findPlayerSpawn,
  fitsPlayerAt,
  PLAYER_SPAWN_RADIUS,
  getPlayerCells,
  getPlayerColumn,
  getPlayerRenderPosition,
  getPlayerJumpPhase,
  getJumpHeight,
  PLAYER_LANDING_TICKS,
  PLAYER_TAKEOFF_TICKS,
  PLAYER_APEX_SPEED,
  getPlayerFacing,
  jumpPlayer,
  PLAYER_JUMP_HEIGHT,
  PLAYER_JUMP_TICKS,
  PLAYER_JUMP_SPEED,
  PLAYER_BODY_HEIGHT,
  PLAYER_JUMP_CUT_SPEED,
  PLAYER_MAX_FALL_SPEED,
  PLAYER_GRAVITY,
  PLAYER_COYOTE_TICKS,
  PLAYER_AIR_JUMPS,
  PLAYER_JUMP_BUFFER_TICKS,
  cancelPlayerJump,
  getWalkDirection,
  PLAYER_FACINGS,
  setPlayerWalk,
  setPlayerJumpHeld,
  stepPlayer,
} from "./player";

/** Side of the square a `t` trunk blocks in {@link groundFrom}. */
const TRUNK = 0.2;

/** Ticks a walking player needs to cover `columns`, whatever `PLAYER_SPEED` is. */
const ticksFor = (columns: number) => Math.ceil(columns / PLAYER_STEP);

const still: ScreenDirections = { up: false, down: false, left: false, right: false };

/**
 * A ground drawn as text: each string is a row along `y`, each character a column along `x`.
 * Digits are grass at that elevation, `~` water, `T` a tree (grass at 0 with a non-walkable
 * occupant), `w` grass at 0 with a walkable occupant, `t` a trunk (an occupant blocking a square of
 * side {@link TRUNK} on its centre), `o` an occupant that blocks none of its block and `s` sand at 0.
 */
const groundFrom = (rows: readonly string[]): PlayerGround => {
  const columns: ITerrainColumn[] = [];
  const occupants = new CellMap<PlayerObstacle[]>();
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      const type: TerrainMaterial = cell === "~" ? "water" : cell === "s" ? "sand" : "grass";
      const elevation = /\d/.test(cell) ? Number(cell) : cell === "~" ? -1 : 0;
      if (cell !== ".") columns.push({ x, y, elevation, type, metadata: {} });
      if (cell === "T") occupants.set(x, y, [{ walkable: false }]);
      if (cell === "w") occupants.set(x, y, [{ walkable: true }]);
      if (cell === "t") occupants.set(x, y, [{ walkable: false, collisionAt: () => TRUNK }]);
      if (cell === "o") occupants.set(x, y, [{ walkable: false, collisionAt: () => 0 }]);
      if (cell === "l") occupants.set(x, y, [{ walkable: false, height: 0.25 }]);
    }),
  );
  return {
    columnIndex: CellMap.from(columns, (column) => column),
    occupancy: { at: (x, y) => occupants.get(x, y) ?? [] },
  };
};

const walking = (ground: PlayerGround, at: { x: number; y: number }, directions: Partial<ScreenDirections>) => {
  const player = createPlayer(ground, at);
  setPlayerWalk(player, { ...still, ...directions });
  return player;
};

describe("player constants", () => {
  it("walks PLAYER_SPEED columns per second of simulation", () => {
    expect(PLAYER_STEP * TICKS_PER_SECOND).toBeCloseTo(PLAYER_SPEED);
    expect(PLAYER_RADIUS).toBeLessThan(0.5);
    expect(PLAYER_MAX_CLIMB).toBe(1);
  });
});

describe("getPlayerColumn", () => {
  it("is the column whose centre is nearest", () => {
    expect(getPlayerColumn({ x: 2.4, y: 2.6 })).toEqual({ x: 2, y: 3 });
    expect(getPlayerColumn({ x: -0.6, y: 0 })).toEqual({ x: -1, y: 0 });
  });
});

describe("canStandOn", () => {
  const ground = groundFrom(["0123", "~Tw0"]);

  it("needs land a climb of at most one block away and nothing non-walkable on it", () => {
    expect(canStandOn(ground, 1, 0, 0)).toBe(true);
    expect(canStandOn(ground, 2, 0, 0)).toBe(false);
    expect(canStandOn(ground, 2, 0, 3)).toBe(true);
    expect(canStandOn(ground, 0, 1, 0)).toBe(false);
    expect(canStandOn(ground, 1, 1, 0)).toBe(false);
    expect(canStandOn(ground, 2, 1, 0)).toBe(true);
    expect(canStandOn(ground, 9, 9, 0)).toBe(false);
  });
});

describe("fitsPlayerAt", () => {
  it("needs every column under the player's feet to take it from the column under it", () => {
    expect(fitsPlayerAt(groundFrom(["0T0"]), { x: 0, y: 0 })).toBe(true);
    expect(fitsPlayerAt(groundFrom(["0T0"]), { x: 0.2, y: 0 })).toBe(true);
    expect(fitsPlayerAt(groundFrom(["0T0"]), { x: 0.4, y: 0 })).toBe(false);
    expect(fitsPlayerAt(groundFrom(["01"]), { x: 0.5, y: 0 })).toBe(true);
    expect(fitsPlayerAt(groundFrom(["03"]), { x: 0.5, y: 0 })).toBe(false);
    expect(fitsPlayerAt(groundFrom(["~"]), { x: 0, y: 0 })).toBe(false);
  });
});

describe("findPlayerSpawn", () => {
  it("picks the walkable column nearest the centre, the same every time", () => {
    const ground = groundFrom(["000", "0T0", "000"]);
    const spawn = findPlayerSpawn(ground, { x: 1, y: 1 });
    // (1, 0), (0, 1), (2, 1) and (1, 2) are as near: the lowest x, then y, wins.
    expect(spawn).toEqual({ x: 0, y: 1, elevation: 0 });
    expect(findPlayerSpawn(ground, { x: 1, y: 1 })).toEqual(spawn);
  });

  it("breaks distance ties by x, then y", () => {
    expect(findPlayerSpawn(groundFrom(["00", "00"]), { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0, elevation: 0 });
    expect(findPlayerSpawn(groundFrom(["~0", "0~"]), { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 1, elevation: 0 });
  });

  it("falls back to the nearest column when nothing is walkable, and to the centre without columns", () => {
    expect(findPlayerSpawn(groundFrom(["~T"]), { x: 0.8, y: 0 })).toEqual({ x: 1, y: 0, elevation: 0 });
    expect(findPlayerSpawn(groundFrom([]), { x: 2, y: 3 })).toEqual({ x: 2, y: 3, elevation: 0 });
  });

  it("searches rings around the centre, no further than it must nor than PLAYER_SPAWN_RADIUS", () => {
    const row = (length: number, at: number, cell: string) => "~".repeat(at) + cell + "~".repeat(length - at - 1);
    const near = groundFrom([row(80, 42, "0")]);
    const get = vi.spyOn(near.columnIndex, "get");

    expect(findPlayerSpawn(near, { x: 40, y: 0 })).toEqual({ x: 42, y: 0, elevation: 0 });
    // Found on ring 2: ring 3 could still hold a nearer column, ring 4 cannot.
    expect(Math.max(...get.mock.calls.map(([x]) => Math.abs(x - 40)))).toBe(3);

    expect(PLAYER_SPAWN_RADIUS).toBe(32);
    const far = groundFrom([row(80, 40 + PLAYER_SPAWN_RADIUS + 1, "0")]);
    expect(findPlayerSpawn(far, { x: 40, y: 0 })).toEqual({ x: 40, y: 0, elevation: -1 });
  });
});

describe("createPlayer", () => {
  it("stands still on the column under it, with no previous movement", () => {
    const player = createPlayer(groundFrom(["03"]), { x: 1.2, y: 0 });
    expect(player).toEqual({
      x: 1.2,
      y: 0,
      elevation: 3,
      motion: { type: "idle" },
      inset: 0,
      height: 0,
      verticalSpeed: undefined,
      lastSafe: { x: 1.2, y: 0, elevation: 3, inset: 0, height: 0 },
      wantsJump: false,
      jumpBufferTicks: 0,
      coyoteTicks: 0,
      jumpHeld: false,
      running: false,
      airJumps: 1,
      velocity: { x: 0, y: 0 },
      climb: undefined,
      previous: { x: 1.2, y: 0, elevation: 3, inset: 0, height: 0 },
      feedback: expect.objectContaining({ jumps: 0, landings: 0, rejections: 0 }),
      walk: { x: 0, y: 0 },
    });
  });

  it("stands at elevation 0 off the terrain", () => {
    expect(createPlayer(groundFrom(["0"]), { x: 5, y: 5 }).elevation).toBe(0);
  });
});

describe("getPlayerFacing", () => {
  const still = { up: false, down: false, left: false, right: false };

  it("faces the screen direction walked in, of eight, east first and counter-clockwise", () => {
    const held: Array<[Partial<ScreenDirections>, string]> = [
      [{ right: true }, "east"],
      [{ up: true, right: true }, "north-east"],
      [{ up: true }, "north"],
      [{ up: true, left: true }, "north-west"],
      [{ left: true }, "west"],
      [{ down: true, left: true }, "south-west"],
      [{ down: true }, "south"],
      [{ down: true, right: true }, "south-east"],
    ];
    for (const [directions, facing] of held) {
      const index = getPlayerFacing(getWalkDirection({ ...still, ...directions }));
      expect(PLAYER_FACINGS[index ?? -1]).toBe(facing);
    }
  });

  it("rounds any direction to the nearest facing", () => {
    // Mostly up (`+x +y`), a little to the right (`+x −y`).
    expect(PLAYER_FACINGS[getPlayerFacing({ x: 1, y: 0.8 }) ?? -1]).toBe("north");
    // Just under east: right, a hair down.
    expect(PLAYER_FACINGS[getPlayerFacing({ x: 0.5, y: -0.6 }) ?? -1]).toBe("east");
  });

  it("has no facing standing still", () => {
    expect(getPlayerFacing({ x: 0, y: 0 })).toBeUndefined();
  });
});

describe("getWalkDirection", () => {
  it("maps screen directions to unit world directions: up is north, right is east", () => {
    const expectDirection = (directions: Partial<ScreenDirections>, x: number, y: number) => {
      const walk = getWalkDirection({ ...still, ...directions });
      expect(walk.x).toBeCloseTo(x * Math.SQRT1_2);
      expect(walk.y).toBeCloseTo(y * Math.SQRT1_2);
    };
    expectDirection({ up: true }, 1, 1);
    expectDirection({ right: true }, 1, -1);
    expectDirection({ down: true }, -1, -1);
    expectDirection({ left: true }, -1, 1);
    expect(getWalkDirection({ ...still, up: true, right: true })).toEqual({ x: 1, y: 0 });
  });

  it("stands still with nothing or opposite directions held", () => {
    expect(getWalkDirection(still)).toEqual({ x: 0, y: 0 });
    expect(getWalkDirection({ up: true, down: true, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });
});

describe("horizontal control", () => {
  const field = groundFrom(["00000", "00000", "00000"]);
  const east = { up: true, right: true };

  it("accelerates, brakes and reverses on the ground with bounded velocity", () => {
    const player = walking(field, { x: 1, y: 1 }, east);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_GROUND_ACCEL);
    stepPlayer(player, field, 2);
    expect(player.velocity.x).toBeCloseTo(PLAYER_STEP);
    setPlayerWalk(player, still);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_STEP - PLAYER_GROUND_BRAKE);
    stepPlayer(player, field, 3);
    expect(player.velocity.x).toBeGreaterThan(0);
    stepPlayer(player, field);
    expect(player.velocity).toEqual({ x: 0, y: 0 });
    setPlayerWalk(player, { ...still, down: true, left: true });
    stepPlayer(player, field);
    expect(player.velocity.x).toBeLessThan(0);
  });

  it("uses softer acceleration and braking in the air, and can steer to a landing", () => {
    const player = walking(field, { x: 1, y: 1 }, east);
    jumpPlayer(player);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_AIR_ACCEL);
    setPlayerWalk(player, still);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_AIR_ACCEL - PLAYER_AIR_BRAKE);
    setPlayerWalk(player, { ...still, ...east });
    stepPlayer(player, field, 5);
    expect(player.x).toBeGreaterThan(1 + PLAYER_STEP);
    expect(player.verticalSpeed).toBeDefined();
  });

  it("runs up to PLAYER_RUN_STEP while the run key is held, and slides back to a walk without it", () => {
    const player = walking(field, { x: 1, y: 1 }, east);
    setPlayerRun(player, true);
    expect(PLAYER_RUN_STEP * TICKS_PER_SECOND).toBeCloseTo(PLAYER_RUN_SPEED);
    stepPlayer(player, field, 3);
    expect(player.velocity.x).toBeCloseTo(PLAYER_STEP);
    expect(isPlayerRunning(player)).toBe(false);
    stepPlayer(player, field);
    expect(isPlayerRunning(player)).toBe(true);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_RUN_STEP);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_RUN_STEP);

    setPlayerRun(player, false);
    stepPlayer(player, field);
    expect(player.velocity.x).toBeCloseTo(PLAYER_RUN_STEP - PLAYER_GROUND_BRAKE);
    expect(isPlayerRunning(player)).toBe(true);
    stepPlayer(player, field, 3);
    expect(player.velocity.x).toBeCloseTo(PLAYER_STEP);
    expect(isPlayerRunning(player)).toBe(false);
  });

  it("skids while it slides on after letting go or holding the other way, not walking on or standing", () => {
    const player = walking(field, { x: 1, y: 1 }, east);
    expect(isPlayerSkidding(player)).toBe(false);
    stepPlayer(player, field, 3);
    expect(isPlayerSkidding(player)).toBe(false);
    setPlayerWalk(player, still);
    stepPlayer(player, field);
    expect(isPlayerSkidding(player)).toBe(true);
    setPlayerWalk(player, { ...still, down: true, left: true });
    expect(isPlayerSkidding(player)).toBe(true);
    for (let tick = 0; tick < 10 && player.velocity.x > 0; tick += 1) stepPlayer(player, field);
    expect(isPlayerSkidding(player)).toBe(false);
    jumpPlayer(player);
    setPlayerWalk(player, still);
    stepPlayer(player, field);
    expect(isPlayerSkidding(player)).toBe(false);
  });

  it("does not count as running in the air or climbing, and jumps farther from a run", () => {
    const distance = (run: boolean) => {
      const player = walking(field, { x: 0, y: 1 }, east);
      setPlayerRun(player, run);
      stepPlayer(player, field, 6);
      jumpPlayer(player);
      stepPlayer(player, field);
      expect(isPlayerRunning(player)).toBe(false);
      const from = player.x;
      for (let tick = 0; tick < 30 && player.verticalSpeed !== undefined; tick += 1) stepPlayer(player, field);
      return player.x - from;
    };
    expect(distance(true)).toBeGreaterThan(distance(false) + 0.5);
    const climber = walking(groundFrom(["01"]), { x: 0.3, y: 0 }, { right: true, up: true });
    setPlayerRun(climber, true);
    for (let tick = 0; tick < 20 && !climber.climb; tick += 1) stepPlayer(climber, groundFrom(["01"]));
    expect(climber.climb).toBeDefined();
    expect(isPlayerRunning(climber)).toBe(false);
  });

  it("keeps diagonal movement at the same maximum speed as axial movement", () => {
    const player = walking(field, { x: 1, y: 1 }, { right: true });
    stepPlayer(player, field, 3);
    expect(Math.hypot(player.velocity.x, player.velocity.y)).toBeCloseTo(PLAYER_STEP);
  });

  it("turns against existing momentum on land and in the air", () => {
    const reverse = { ...still, down: true, left: true };
    const groundPlayer = walking(field, { x: 1, y: 1 }, east);
    stepPlayer(groundPlayer, field, 2);
    setPlayerWalk(groundPlayer, reverse);
    stepPlayer(groundPlayer, field);
    expect(groundPlayer.velocity.x).toBeCloseTo(2 * PLAYER_GROUND_ACCEL - (PLAYER_GROUND_ACCEL + PLAYER_GROUND_BRAKE));
    stepPlayer(groundPlayer, field);
    expect(groundPlayer.velocity.x).toBeLessThan(0);

    const jumper = walking(field, { x: 1, y: 1 }, east);
    jumpPlayer(jumper);
    stepPlayer(jumper, field);
    setPlayerWalk(jumper, reverse);
    stepPlayer(jumper, field);
    expect(jumper.velocity.x).toBeLessThan(0);
    expect(jumper.verticalSpeed).toBeDefined();
  });

  it("nudges around a minor corner only when both the nudge and destination fit", () => {
    const passable = groundFrom(["0t00", "0000"]);
    const player = walking(passable, { x: 0.6, y: 0.29 }, east);
    stepPlayer(player, passable, 2);
    expect(player.y).toBeCloseTo(0.29 + PLAYER_CORNER_NUDGE);
    expect(player.x).toBeGreaterThan(0.7);

    const blocked = groundFrom(["0t00", "~~~~"]);
    const other = walking(blocked, { x: 0.6, y: 0.29 }, east);
    stepPlayer(other, blocked, 2);
    expect(other.y).toBeCloseTo(0.29);
    expect(other.x).toBeLessThan(player.x);
  });

  it("nudges sideways along x around a corner when it walks along y", () => {
    const passable = groundFrom(["00", "t0", "00", "00"]);
    const player = walking(passable, { x: 0.29, y: 0.6 }, { up: true, left: true });
    stepPlayer(player, passable, 2);
    expect(player.x).toBeCloseTo(0.29 + PLAYER_CORNER_NUDGE);
    expect(player.y).toBeGreaterThan(0.7);
  });

  it("removes blocked velocity so a wall does not store momentum", () => {
    const wall = groundFrom(["0T0"]);
    const player = walking(wall, { x: 0.3, y: 0 }, east);
    stepPlayer(player, wall);
    expect(player.x).toBeCloseTo(0.3);
    expect(player.velocity).toEqual({ x: 0, y: 0 });
    setPlayerWalk(player, { ...still, down: true, left: true });
    stepPlayer(player, wall);
    expect(player.x).toBeLessThan(0.3);
  });
});

describe("createPlayerSystem", () => {
  it("walks the world's player one tick on the world's ground", () => {
    const field = groundFrom(["00000", "00000", "00000", "00000", "00000"]);
    const player = walking(field, { x: 1, y: 2 }, { up: true, right: true });
    const system = createPlayerSystem();

    system.step({
      ...field,
      movers: new SpatialIndex<object>(),
      parts: { get: <T>(key: WorldPartKey<T>) => (key.id === PLAYER_PART.id ? player : null) as T },
    });

    expect(system.id).toBe("player");
    expect(player.x).toBeCloseTo(1 + PLAYER_GROUND_ACCEL);
    expect(player.previous).toEqual({ x: 1, y: 2, elevation: 0, inset: 0, height: 0 });
  });

  it("sinks the player onto the tops its options inset", () => {
    const sand = groundFrom(["ss", "ss"]);
    const player = createPlayer(sand, { x: 1, y: 1 });
    const system = createPlayerSystem({ topInset: () => 0.25 });

    system.step({
      ...sand,
      movers: new SpatialIndex<object>(),
      parts: { get: <T>(key: WorldPartKey<T>) => (key.id === PLAYER_PART.id ? player : null) as T },
    });

    expect(player.inset).toBe(0.25);
  });

  /** The 5 × 5 field with `player` as its part and `movers` as its index of what moves. */
  const worldOf = (player: PlayerState, movers = new SpatialIndex<object>()) => ({
    ...groundFrom(["00000", "00000", "00000", "00000", "00000"]),
    movers,
    parts: { get: <T>(key: WorldPartKey<T>) => (key.id === PLAYER_PART.id ? player : null) as T },
  });

  it("puts the player in the world's movers on the columns its feet take, on its first step", () => {
    const player = createPlayer(groundFrom(["00000"]), { x: 2, y: 0.9 });
    const world = worldOf(player);

    createPlayerSystem().step(world);

    expect(world.movers.at(2, 1)).toEqual([player]);
    expect(world.movers.cellsOf(player)).toEqual([{ x: 2, y: 1 }]);
  });

  it("moves the player in the movers only when the columns under its feet change", () => {
    const player = walking(groundFrom(["00000"]), { x: 1, y: 2 }, { right: true, up: true });
    const world = worldOf(player);
    const move = vi.spyOn(world.movers, "move");
    const system = createPlayerSystem();

    system.step(world);
    expect(world.movers.cellsOf(player)).toEqual([{ x: 1, y: 2 }]);
    // Two steps more put its feet across the edge with the next column along `x`.
    system.step(world);
    system.step(world);
    expect(move).toHaveBeenCalledTimes(2);
    expect(world.movers.cellsOf(player)).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);

    setPlayerWalk(player, still);
    for (let tick = 0; tick < 5; tick += 1) system.step(world);
    expect(move).toHaveBeenCalledTimes(2);
    expect(world.movers.size).toBe(1);
  });

  it("puts the player again in a new index or as a new player, as a restored world has", () => {
    const player = createPlayer(groundFrom(["00000"]), { x: 1, y: 1 });
    const system = createPlayerSystem();
    system.step(worldOf(player));

    const restored = worldOf(player);
    system.step(restored);
    expect(restored.movers.at(1, 1)).toEqual([player]);

    const other = createPlayer(groundFrom(["00000"]), { x: 1, y: 1 });
    const again = worldOf(other, restored.movers);
    system.step(again);
    expect(again.movers.at(1, 1)).toEqual([player, other]);
  });
});

describe("getPlayerCells", () => {
  it("is the columns the square of the player's feet touches", () => {
    expect(getPlayerCells({ x: 2, y: 3 })).toEqual({ minX: 2, minY: 3, maxX: 2, maxY: 3 });
    expect(getPlayerCells({ x: 2.5, y: 3 })).toEqual({ minX: 2, minY: 3, maxX: 3, maxY: 3 });
    expect(getPlayerCells({ x: 2.4, y: 2.6 })).toEqual({ minX: 2, minY: 2, maxX: 3, maxY: 3 });
  });
});

describe("getJumpHeight", () => {
  it("rises and falls on a parabola, peaking halfway through the jump", () => {
    expect(getJumpHeight(0)).toBe(0);
    expect(getJumpHeight(PLAYER_JUMP_TICKS / 2)).toBeCloseTo(PLAYER_JUMP_HEIGHT);
    expect(getJumpHeight(PLAYER_JUMP_TICKS)).toBe(0);
    expect(getJumpHeight(2)).toBeCloseTo(getJumpHeight(PLAYER_JUMP_TICKS - 2));
    expect(getJumpHeight(2)).toBeLessThan(getJumpHeight(3));
  });

  it("is on the ground outside the jump", () => {
    expect(getJumpHeight(-1)).toBe(0);
    expect(getJumpHeight(PLAYER_JUMP_TICKS + 3)).toBe(0);
  });
});

describe("jumping", () => {
  it("transitions through jumping and falling motion states and settles to idle", () => {
    const player = createPlayer(groundFrom(["0"]), { x: 0, y: 0 });
    jumpPlayer(player);
    stepPlayer(player, groundFrom(["0"]));
    expect(player.motion).toEqual({ type: "jumping" });
    stepPlayer(player, groundFrom(["0"]), PLAYER_JUMP_TICKS);
    expect(player.motion).toEqual({ type: "idle" });
  });

  const field = groundFrom(["00000", "00000", "00000"]);

  /** Steps `player` until it lands, returning the height of its feet after each tick. */
  const untilLanded = (player: PlayerState, ground: PlayerGround) => {
    const heights: number[] = [];
    do {
      stepPlayer(player, ground);
      heights.push(player.height);
    } while (player.verticalSpeed !== undefined && heights.length < 100);
    return heights;
  };

  it("derives its take-off speed and gravity from the height and length of a jump", () => {
    expect(PLAYER_JUMP_HEIGHT).toBeCloseTo(0.85);
    expect(PLAYER_JUMP_SPEED).toBeCloseTo(0.34);
    expect(PLAYER_GRAVITY).toBeCloseTo(0.068);
  });

  it("takes off on the next tick when asked on the ground, and lands after PLAYER_JUMP_TICKS", () => {
    const player = createPlayer(field, { x: 1, y: 1 });
    jumpPlayer(player);
    expect(player.wantsJump).toBe(true);

    const heights = untilLanded(player, field);

    expect(heights).toHaveLength(PLAYER_JUMP_TICKS);
    heights.slice(0, -1).forEach((height, tick) => expect(height).toBeCloseTo(getJumpHeight(tick + 1)));
    expect(player.height).toBe(0);
    expect(player.verticalSpeed).toBeUndefined();
    expect(player.wantsJump).toBe(false);
    // The tick before landing, in `previous`, for the render to interpolate.
    expect(player.previous.height).toBeCloseTo(getJumpHeight(PLAYER_JUMP_TICKS - 1));
  });

  it("does not jump again in the air, its double jump used, when the buffered press expires before landing", () => {
    const player = createPlayer(field, { x: 1, y: 1 });
    jumpPlayer(player);
    stepPlayer(player, field, 3);
    player.airJumps = 0;
    jumpPlayer(player);
    stepPlayer(player, field);

    expect(player.height).toBeCloseTo(getJumpHeight(4));
    expect(player.wantsJump).toBe(true);
    expect(player.jumpBufferTicks).toBe(1);
    stepPlayer(player, field, PLAYER_JUMP_TICKS);
    expect(player.height).toBe(0);
  });

  it("walks as on the ground while it jumps, and the same jump gives the same path", () => {
    const jump = () => {
      const player = walking(field, { x: 1, y: 1 }, { right: true });
      jumpPlayer(player);
      stepPlayer(player, field, 4);
      return player;
    };
    const player = jump();

    expect(player.x - player.y).toBeCloseTo((PLAYER_AIR_ACCEL * 6 + PLAYER_STEP) * Math.SQRT2);
    expect(player.height).toBeCloseTo(getJumpHeight(4));
    expect(jump()).toEqual(player);
  });

  it("runs every tick of a jump even standing still", () => {
    const player = createPlayer(field, { x: 1, y: 1 });
    jumpPlayer(player);
    stepPlayer(player, field, 5);

    expect(player.height).toBeCloseTo(getJumpHeight(5));
  });

  // Rows along y, columns along x: walking up and right goes along +x.
  const step = (row: string) => groundFrom([row, row, row]);

  it("falls onto a lower column it walks onto, instead of dropping there in one tick", () => {
    const ground = step("221111");
    const player = walking(ground, { x: 1, y: 1 }, { up: true, right: true });
    const feet: number[] = [];
    for (let tick = 0; tick < 20; tick += 1) {
      stepPlayer(player, ground);
      feet.push(player.elevation + player.height);
    }

    expect(player).toMatchObject({ elevation: 1, height: 0, verticalSpeed: undefined });
    const falling = feet.filter((at) => at > 1 && at < 2);
    expect(falling.length).toBeGreaterThanOrEqual(3);
    feet.slice(1).forEach((at, tick) => {
      expect(at).toBeLessThanOrEqual(feet[tick]);
      expect(feet[tick] - at).toBeLessThan(0.5);
    });
  });

  it("stays in the air longer when it jumps onto a lower column, and lands on it", () => {
    const ground = step("1100000");
    const player = walking(ground, { x: 1, y: 1 }, { up: true, right: true });
    jumpPlayer(player);

    const heights = untilLanded(player, ground);

    expect(heights.length).toBeGreaterThan(PLAYER_JUMP_TICKS);
    expect(Math.max(...heights)).toBeGreaterThan(PLAYER_JUMP_HEIGHT);
    expect(player).toMatchObject({ elevation: 0, inset: 0, height: 0 });
  });

  /** Sand's top sinks half a block, as in the terrain content. */
  const sandInset = (type: TerrainMaterial) => (type === "sand" ? 0.5 : 0);

  it("falls onto the sunken top of sand at the same elevation, and steps back up off it", () => {
    const ground = step("00ss00");
    const player = walking(ground, { x: 1, y: 1 }, { up: true, right: true });
    const feet: number[] = [];
    while (player.x < 3) {
      stepPlayer(player, ground, 1, sandInset);
      feet.push(player.elevation - player.inset + player.height);
    }

    expect(player).toMatchObject({ elevation: 0, inset: 0.5, height: 0, verticalSpeed: undefined });
    expect(feet.filter((at) => at > -0.5 && at < 0).length).toBeGreaterThanOrEqual(2);
    while (player.x < 4.6) stepPlayer(player, ground, 1, sandInset);
    expect(player).toMatchObject({ elevation: 0, inset: 0, height: 0 });
  });

  it("settles a player that starts on sand onto its sunken top at once", () => {
    const ground = step("ss");
    const player = createPlayer(ground, { x: 1, y: 1 });
    stepPlayer(player, ground, 3, sandInset);

    expect(player).toMatchObject({ inset: 0.5, height: 0, previous: { inset: 0.5, height: 0 } });

    const off = createPlayer(ground, { x: 9, y: 9 });
    stepPlayer(off, ground, 1, sandInset);
    expect(off.inset).toBe(0);
  });

  it("does not enter a higher column before its feet clear the top", () => {
    const ground = step("0011");
    const player = walking(ground, { x: 1, y: 1 }, { up: true, right: true });
    jumpPlayer(player);
    stepPlayer(player, ground, PLAYER_JUMP_TICKS);

    expect(player.elevation).toBe(0);
    expect(player.x).toBeLessThan(1.5 - PLAYER_RADIUS);
  });

  it("crosses a one-column gap while jumping and lands on the far side", () => {
    const ground = step("00.000");
    const player = walking(ground, { x: 1, y: 1 }, { up: true, right: true });
    stepPlayer(player, ground, 3); // Reach walking speed before the edge.
    jumpPlayer(player);
    stepPlayer(player, ground, PLAYER_JUMP_TICKS);

    expect(player.x).toBeGreaterThan(2.7);
    expect(player.lastSafe.x).toBeGreaterThan(2.7);
    expect(player).toMatchObject({ elevation: 0, height: 0, verticalSpeed: undefined });
  });

  it("passes over a low obstacle but not a tall one", () => {
    const low = step("00l00");
    const jumping = walking(low, { x: 1.3, y: 1 }, { up: true, right: true });
    jumpPlayer(jumping);
    stepPlayer(jumping, low, PLAYER_JUMP_TICKS);
    expect(jumping.x).toBeGreaterThan(2);

    const high = step("00T00");
    const blocked = walking(high, { x: 1.3, y: 1 }, { up: true, right: true });
    jumpPlayer(blocked);
    stepPlayer(blocked, high, PLAYER_JUMP_TICKS);
    expect(blocked.x).toBeLessThan(2);
  });

  it("lands on a lower top without crossing it and recovers after falling into water", () => {
    const lower = step("11000");
    const player = walking(lower, { x: 0.3, y: 1 }, { up: true, right: true });
    jumpPlayer(player);
    stepPlayer(player, lower, PLAYER_JUMP_TICKS + 8);
    expect(player.elevation).toBe(0);
    expect(player.height).toBe(0);

    const water = step("00~~~");
    const swimmer = walking(water, { x: 1.3, y: 1 }, { up: true, right: true });
    jumpPlayer(swimmer);
    stepPlayer(swimmer, water, 40);
    expect(swimmer.height).toBe(0);
    expect(swimmer.verticalSpeed).toBeUndefined();
    expect(swimmer.x).toBeLessThan(2);
  });
});

describe("variable jump", () => {
  const flat = groundFrom(["000"]);

  const profile = (releaseAfterTicks: number) => {
    const player = createPlayer(flat, { x: 1, y: 0 });
    jumpPlayer(player);
    const heights: number[] = [];
    for (let tick = 0; tick < 20; tick += 1) {
      if (tick === releaseAfterTicks) setPlayerJumpHeld(player, false);
      stepPlayer(player, flat);
      heights.push(player.height);
      if (player.verticalSpeed === undefined) break;
    }
    return { player, heights };
  };

  it("makes a tap shorter than a held jump without delaying take-off", () => {
    const tap = profile(0);
    const held = profile(20);
    expect(PLAYER_JUMP_CUT_SPEED).toBeLessThan(PLAYER_JUMP_SPEED);
    expect(tap.heights[0]).toBeGreaterThan(0);
    expect(Math.max(...tap.heights)).toBeCloseTo(0.306);
    expect(Math.max(...held.heights)).toBeCloseTo(PLAYER_JUMP_HEIGHT);
    expect(tap.heights).toHaveLength(6);
    expect(tap.heights.length).toBeLessThan(held.heights.length);
    expect(held.heights).toHaveLength(PLAYER_JUMP_TICKS);
  });

  it("cuts the rising speed on release and does not restore it on a new air press", () => {
    const player = createPlayer(flat, { x: 1, y: 0 });
    jumpPlayer(player);
    stepPlayer(player, flat);
    setPlayerJumpHeld(player, false);
    stepPlayer(player, flat);
    const cutSpeed = player.verticalSpeed;
    if (cutSpeed === undefined) throw new Error("The player landed before the second tick");
    expect(cutSpeed).toBeLessThan(PLAYER_JUMP_CUT_SPEED);
    player.airJumps = 0;
    jumpPlayer(player);
    stepPlayer(player, flat);
    expect(player.verticalSpeed).toBeLessThan(cutSpeed);
    stepPlayer(player, flat, 20);
    expect(player.height).toBe(0);
  });

  it("does not cut the jump when released after its apex", () => {
    const late = profile(6);
    const held = profile(20);
    expect(late.heights).toEqual(held.heights);
  });

  it("stops upward motion at an overhead obstacle and then lands", () => {
    const base = groundFrom(["000"]);
    const roof: PlayerGround = {
      ...base,
      occupancy: { at: (x, y) => (x === 1 && y === 0 ? [{ walkable: false, elevation: 0.9, height: 0.2 }] : []) },
    };
    expect(canStandOn(roof, 1, 0, 0)).toBe(true);
    expect(fitsPlayerAt(roof, { x: 1, y: 0 })).toBe(true);
    const player = createPlayer(roof, { x: 1, y: 0 });
    const samples: PlayerStepSample[] = [];
    jumpPlayer(player);
    stepPlayer(player, roof, 1, undefined, (sample) => samples.push(sample));
    expect(player.height).toBeCloseTo(0.9 - 0.6);
    expect(player.verticalSpeed).toBe(0);
    expect(samples[0].blockReason).toBe("ceiling");
    stepPlayer(player, roof, 20);
    expect(player.height).toBe(0);
    expect(player.verticalSpeed).toBeUndefined();
  });

  it("uses the nearest underside when several ceilings are crossed in one tick", () => {
    const base = groundFrom(["000"]);
    const ground: PlayerGround = {
      ...base,
      occupancy: {
        at: (x, y) =>
          x === 1 && y === 0
            ? [
                { walkable: false, elevation: 0.8, height: 0.1 },
                { walkable: false, elevation: 0.7, height: 0.1 },
              ]
            : [],
      },
    };
    const player = createPlayer(ground, { x: 1, y: 0 });
    jumpPlayer(player);
    stepPlayer(player, ground);
    expect(player.height).toBeCloseTo(0.7 - 0.6);
    expect(player.verticalSpeed).toBe(0);
  });

  it("resolves an overhead obstacle without a terrain column", () => {
    const base = groundFrom([]);
    const ground: PlayerGround = {
      ...base,
      occupancy: { at: () => [{ walkable: false, height: 0.1 }] },
    };
    const player = createPlayer(ground, { x: 0, y: 0 });
    player.height = -0.7;
    player.verticalSpeed = PLAYER_JUMP_SPEED;
    player.jumpHeld = true;
    stepPlayer(player, ground);
    expect(player.height).toBeCloseTo(-PLAYER_BODY_HEIGHT);
    expect(player.verticalSpeed).toBe(0);
  });

  it("caps vertical fall speed in a long unsupported drop", () => {
    const voidGround = groundFrom([]);
    const player = createPlayer(voidGround, { x: 0, y: 0 });
    player.lastSafe = { x: 0, y: 0, elevation: -100, inset: 0, height: 0 };
    stepPlayer(player, voidGround, 30);
    expect(player.verticalSpeed).toBe(-PLAYER_MAX_FALL_SPEED);
    expect(player.height).toBeLessThan(-10);
  });
});

describe("jump forgiveness", () => {
  const ledge = groundFrom(["00.000", "00.000", "00.000"]);
  const toward = { up: true, right: true };

  it("starts a coyote window after walking off a real edge and consumes it on jump", () => {
    const player = walking(ledge, { x: 1.3, y: 1 }, toward);
    while (player.verticalSpeed === undefined) stepPlayer(player, ledge);
    expect(player.coyoteTicks).toBe(PLAYER_COYOTE_TICKS);
    jumpPlayer(player);
    stepPlayer(player, ledge);
    expect(player.verticalSpeed).toBeGreaterThan(0);
    expect(player.coyoteTicks).toBe(0);
    expect(player.jumpBufferTicks).toBe(0);
    expect(player.wantsJump).toBe(false);
  });

  it("expires coyote time after two airborne ticks and does not grant a jump past the double jump", () => {
    const player = walking(ledge, { x: 1.3, y: 1 }, toward);
    while (player.verticalSpeed === undefined) stepPlayer(player, ledge);
    stepPlayer(player, ledge, PLAYER_COYOTE_TICKS);
    expect(player.coyoteTicks).toBe(0);
    player.airJumps = 0;
    jumpPlayer(player);
    stepPlayer(player, ledge);
    expect(player.verticalSpeed).toBeLessThan(0);

    const flat = groundFrom(["000"]);
    const jumper = createPlayer(flat, { x: 1, y: 0 });
    jumpPlayer(jumper);
    stepPlayer(jumper, flat);
    jumper.airJumps = 0;
    jumpPlayer(jumper);
    stepPlayer(jumper, flat);
    expect(jumper.verticalSpeed).toBeLessThan(PLAYER_JUMP_SPEED);
    expect(jumper.coyoteTicks).toBe(0);
  });

  it("buffers an early press and launches once on landing, even on the final buffer tick", () => {
    const flat = groundFrom(["000"]);
    const player = createPlayer(flat, { x: 1, y: 0 });
    jumpPlayer(player);
    stepPlayer(player, flat, PLAYER_JUMP_TICKS - 2);
    player.airJumps = 0;
    jumpPlayer(player);
    stepPlayer(player, flat);
    expect(player.jumpBufferTicks).toBe(PLAYER_JUMP_BUFFER_TICKS - 1);
    stepPlayer(player, flat);
    expect(player.verticalSpeed).toBe(PLAYER_JUMP_SPEED);
    expect(player.height).toBe(0);
    expect(player.jumpBufferTicks).toBe(0);
    stepPlayer(player, flat);
    expect(player.height).toBeGreaterThan(0);
  });

  it("discards expired input, and cancellation clears a pending jump on blur or pause", () => {
    const flat = groundFrom(["000"]);
    const player = createPlayer(flat, { x: 1, y: 0 });
    jumpPlayer(player);
    stepPlayer(player, flat, 2);
    jumpPlayer(player);
    stepPlayer(player, flat, PLAYER_JUMP_BUFFER_TICKS);
    expect(player.jumpBufferTicks).toBe(0);
    expect(player.wantsJump).toBe(false);
    jumpPlayer(player);
    cancelPlayerJump(player);
    expect(player.jumpBufferTicks).toBe(0);
    expect(player.jumpHeld).toBe(false);
    stepPlayer(player, flat, PLAYER_JUMP_TICKS);
    expect(player.verticalSpeed).toBeUndefined();
  });

  it("does not carry a buffered jump through climbing or rescue", () => {
    const stairs = groundFrom(["01"]);
    const climber = walking(stairs, { x: 0.3, y: 0 }, toward);
    while (!climber.climb) stepPlayer(climber, stairs);
    jumpPlayer(climber);
    stepPlayer(climber, stairs);
    expect(climber.jumpBufferTicks).toBe(0);

    const water = groundFrom(["00~~~"]);
    const falling = walking(water, { x: 1.3, y: 0 }, toward);
    jumpPlayer(falling);
    stepPlayer(falling, water, PLAYER_JUMP_TICKS + 5);
    jumpPlayer(falling);
    stepPlayer(falling, water, 30);
    expect(falling.jumpBufferTicks).toBe(0);
    expect(falling.verticalSpeed).toBeUndefined();
  });
});

describe("movement diagnostics", () => {
  it("records a deterministic tick-by-tick jump profile and input latency", () => {
    const run = () => {
      const ground = groundFrom(["000", "000", "000"]);
      const player = createPlayer(ground, { x: 1, y: 1 });
      const samples: PlayerStepSample[] = [];
      jumpPlayer(player);
      stepPlayer(player, ground, PLAYER_JUMP_TICKS, undefined, (sample) => samples.push(sample));
      return samples;
    };
    const samples = run();
    expect(samples).toEqual(run());
    expect(samples).toHaveLength(PLAYER_JUMP_TICKS);
    expect(samples[0]).toMatchObject({ step: 0, input: { jump: true }, contact: "air" });
    expect(samples[0].horizontalVelocity).toEqual({ x: 0, y: 0 });
    expect(samples[0].position.height).toBeCloseTo(getJumpHeight(1));
    expect(samples[PLAYER_JUMP_TICKS - 1]).toMatchObject({ step: 9, contact: "ground", verticalSpeed: undefined });
    expect(Math.max(...samples.map((sample) => sample.position.height ?? 0))).toBeCloseTo(PLAYER_JUMP_HEIGHT);
  });

  it("records terrain and obstacle blocks and climbing separately", () => {
    const blocked: PlayerStepSample[] = [];
    const shore = groundFrom(["00~"]);
    const walker = walking(shore, { x: 1.3, y: 0 }, { up: true, right: true });
    stepPlayer(walker, shore, 1, undefined, (sample) => blocked.push(sample));
    expect(blocked[0].blockReason).toBe("terrain");

    const tree = groundFrom(["0T"]);
    const beside = walking(tree, { x: 0.3, y: 0 }, { up: true, right: true });
    stepPlayer(beside, tree, 1, undefined, (sample) => blocked.push(sample));
    expect(blocked[1].blockReason).toBe("obstacle");

    const voidWithOccupant = groundFrom(["0."]);
    const floating: PlayerGround = {
      ...voidWithOccupant,
      occupancy: { at: (x) => (x === 1 ? [{ walkable: false, height: 1 }] : []) },
    };
    const inAir = walking(floating, { x: 0.3, y: 0 }, { up: true, right: true });
    jumpPlayer(inAir);
    stepPlayer(inAir, floating, 1, undefined, (sample) => blocked.push(sample));
    expect(blocked[2].blockReason).toBe("obstacle");

    const stairs = groundFrom(["01"]);
    const climber = walking(stairs, { x: 0.3, y: 0 }, { up: true, right: true });
    stepPlayer(climber, stairs, 4, undefined, (sample) => blocked.push(sample));
    expect(blocked.some((sample) => sample.contact === "climbing" && sample.blockReason === "climbing")).toBe(true);
  });

  it("allows a real gap but blocks an unloaded neighbouring chunk", () => {
    const columns = new CellMap<ITerrainColumn>();
    columns.set(31, 0, { x: 31, y: 0, elevation: 0, type: "grass", metadata: {} });
    const player = createPlayer({ columnIndex: columns, occupancy: { at: () => [] } }, { x: 31.2, y: 0 });
    player.walk = { x: 1, y: 0 };
    jumpPlayer(player);
    const unloaded: PlayerGround = {
      columnIndex: columns,
      occupancy: { at: () => [] },
      chunks: { has: (coord) => coord.cx === 0 },
    };
    stepPlayer(player, unloaded, 4);
    expect(player.x).toBeLessThan(31.5);

    const gap: PlayerGround = { ...unloaded, chunks: { has: () => true } };
    const crossing = createPlayer(gap, { x: 31.2, y: 0 });
    crossing.walk = { x: 1, y: 0 };
    jumpPlayer(crossing);
    stepPlayer(crossing, gap, 4);
    expect(crossing.x).toBeGreaterThan(31.5);
  });
});

describe("stepPlayer", () => {
  const field = groundFrom(["00000", "00000", "00000", "00000", "00000"]);

  it("walks PLAYER_STEP per tick along its walk, keeping the previous position", () => {
    const player = walking(field, { x: 1, y: 2 }, { up: true, right: true });
    stepPlayer(player, field);
    expect(player.x).toBeCloseTo(1 + PLAYER_GROUND_ACCEL);
    expect(player.y).toBe(2);
    expect(player.previous).toEqual({ x: 1, y: 2, elevation: 0, inset: 0, height: 0 });

    stepPlayer(player, field, 2);
    const started = 1 + PLAYER_GROUND_ACCEL * 6;
    expect(player.x).toBeCloseTo(started);
    stepPlayer(player, field, 3);
    expect(player.x).toBeCloseTo(started + 3 * PLAYER_STEP);
    expect(player.previous.x).toBeCloseTo(started + 2 * PLAYER_STEP);
  });

  it("standing still only settles the previous position", () => {
    const player = createPlayer(field, { x: 2, y: 2 });
    player.previous = { x: 1, y: 1, elevation: 0 };
    stepPlayer(player, field, 100);
    expect(player).toMatchObject({ x: 2, y: 2, previous: { x: 2, y: 2, elevation: 0 } });
    stepPlayer(player, field, 0);
    expect(player.previous).toEqual({ x: 2, y: 2, elevation: 0, inset: 0, height: 0 });
  });

  it("is deterministic: the same walk gives the same path", () => {
    const run = () => {
      const player = walking(field, { x: 2, y: 2 }, { up: true });
      stepPlayer(player, field, 7);
      return { x: player.x, y: player.y };
    };
    expect(run()).toEqual(run());
  });

  it("can walk off a void ledge and recovers after the fall", () => {
    const voidEdge = groundFrom(["00."]);
    const player = walking(voidEdge, { x: 0, y: 0 }, { up: true, right: true });
    stepPlayer(player, voidEdge, ticksFor(1.8));
    expect(player.x).toBeGreaterThan(1.5);
    expect(player.verticalSpeed).toBeDefined();
    setPlayerWalk(player, still);
    stepPlayer(player, voidEdge, 30);
    expect(player.verticalSpeed).toBeUndefined();

    // Down-right walks along −y, off the loaded world.
    const edge = walking(voidEdge, { x: 0, y: 0 }, { down: true, right: true });
    stepPlayer(edge, voidEdge, ticksFor(1));
    expect(edge.x).toBe(0);
    expect(edge.y).toBeLessThan(-0.5);
    expect(edge.verticalSpeed).toBeDefined();
  });

  it("does not walk into a non-walkable occupant, but walks over a walkable one", () => {
    const yard = groundFrom(["0T", "0w"]);
    const blocked = walking(yard, { x: 0, y: 0 }, { up: true, right: true });
    stepPlayer(blocked, yard, ticksFor(2));
    expect(blocked.x).toBeLessThan(0.5);

    const free = walking(yard, { x: 0, y: 1 }, { up: true, right: true });
    stepPlayer(free, yard, ticksFor(2));
    expect(free.x).toBeGreaterThan(1);
  });

  it("only bumps into the square an occupant blocks, centred on its column", () => {
    const grove = groundFrom(["000", "0t0", "000"]);
    // Past the trunk, inside its column but clear of its square.
    const beside = walking(grove, { x: 0, y: 1 - (PLAYER_RADIUS + TRUNK / 2) - 0.05 }, { up: true, right: true });
    stepPlayer(beside, grove, ticksFor(2));
    expect(beside.x).toBeGreaterThan(1.9);

    // Straight at it: stops against its edge, well inside the column.
    const ahead = walking(grove, { x: 0, y: 1 }, { up: true, right: true });
    stepPlayer(ahead, grove, ticksFor(2));
    expect(ahead.x).toBeGreaterThan(0.5);
    expect(ahead.x).toBeLessThanOrEqual(1 - (PLAYER_RADIUS + TRUNK / 2));
    expect(ahead.x).toBeGreaterThan(1 - (PLAYER_RADIUS + TRUNK / 2) - PLAYER_STEP);
  });

  it("walks over an occupant that blocks none of its block, and cannot stand on a trunk's column", () => {
    const pier = groundFrom(["0o0"]);
    const player = walking(pier, { x: 0, y: 0 }, { up: true, right: true });
    stepPlayer(player, pier, ticksFor(2));
    expect(player.x).toBeGreaterThan(1.9);
    expect(canStandOn(pier, 1, 0, 0)).toBe(true);
    expect(canStandOn(groundFrom(["t"]), 0, 0, 0)).toBe(false);
  });

  it("climbs and goes down one block, and takes the elevation of the column under it", () => {
    const stairs = groundFrom(["01210"]);
    const player = walking(stairs, { x: 0, y: 0 }, { up: true, right: true });
    const elevations = Array.from({ length: ticksFor(6) + 2 * PLAYER_CLIMB_TICKS }, () => {
      stepPlayer(player, stairs);
      return player.elevation;
    });
    expect(player.x).toBeGreaterThan(3.5);
    const changes = elevations.filter((elevation, index) => elevation !== elevations[index - 1]);
    expect(changes).toEqual([0, 1, 2, 1, 0]);
  });

  it("stops at a wall two blocks high", () => {
    const wall = groundFrom(["02"]);
    const player = walking(wall, { x: 0, y: 0 }, { up: true, right: true });
    stepPlayer(player, wall, ticksFor(2));
    expect(player.x).toBeLessThan(0.5);
    expect(player.elevation).toBe(0);
  });

  it("slides along a wall on the free axis", () => {
    // Walking north (+x +y) against water at x = 2: x is blocked, y is free.
    const corridor = groundFrom(["00~", "00~", "00~", "00~"]);
    const player = walking(corridor, { x: 1, y: 0 }, { up: true });
    stepPlayer(player, corridor, ticksFor(4));
    expect(player.x).toBeLessThan(1.5);
    expect(player.y).toBeGreaterThan(2);

    // Walking north against water at y = 2: y is blocked, x is free.
    const across = groundFrom(["0000", "0000", "~~~~"]);
    const other = walking(across, { x: 0, y: 1 }, { up: true });
    stepPlayer(other, across, ticksFor(4));
    expect(other.y).toBeLessThan(1.5);
    expect(other.x).toBeGreaterThan(2);
  });
});

describe("getPlayerRenderPosition", () => {
  const player: PlayerState = {
    motion: { type: "jumping" },
    x: 2,
    y: 4,
    elevation: 1,
    inset: 0.5,
    height: 0.5,
    verticalSpeed: 0.1,
    lastSafe: { x: 1, y: 4, elevation: 0, inset: 0, height: 0 },
    wantsJump: false,
    jumpBufferTicks: 0,
    coyoteTicks: 0,
    jumpHeld: false,
    running: false,
    airJumps: 1,
    velocity: { x: 0, y: 0 },
    climb: undefined,
    previous: { x: 1, y: 4, elevation: 0 },
    feedback: {
      jumps: 0,
      landings: 0,
      rejections: 0,
      rejected: undefined,
      airTicks: 0,
      landingTicks: 0,
      impact: 0,
      leap: false,
      airJump: false,
    },
    walk: { x: 1, y: 0 },
  };

  it("interpolates between the previous and the current position", () => {
    expect(getPlayerRenderPosition(player, 0)).toEqual({ x: 1, y: 4, elevation: 0, inset: 0, height: 0 });
    expect(getPlayerRenderPosition(player, 0.25)).toEqual({
      x: 1.25,
      y: 4,
      elevation: 0.25,
      inset: 0.125,
      height: 0.125,
    });
    expect(getPlayerRenderPosition(player, 1)).toEqual({ x: 2, y: 4, elevation: 1, inset: 0.5, height: 0.5 });
  });

  it("clamps alpha to [0, 1] and treats invalid values as the current position", () => {
    expect(getPlayerRenderPosition(player, -1)).toEqual({ x: 1, y: 4, elevation: 0, inset: 0, height: 0 });
    expect(getPlayerRenderPosition(player, 2)).toEqual({ x: 2, y: 4, elevation: 1, inset: 0.5, height: 0.5 });
    expect(getPlayerRenderPosition(player, Number.NaN)).toEqual({ x: 2, y: 4, elevation: 1, inset: 0.5, height: 0.5 });
  });
});

describe("climbing", () => {
  /** Feet of `player` in the world. */
  const feetOf = (player: PlayerState) => player.elevation - player.inset + player.height;
  /** Steps `player` until it climbs, at most `limit` ticks. */
  const untilClimbing = (player: PlayerState, ground: PlayerGround, topInset?: (type: TerrainMaterial) => number) => {
    for (let tick = 0; tick < 50 && player.climb === undefined; tick += 1) stepPlayer(player, ground, 1, topInset);
  };
  /** Sand's top `depth` below its elevation, every other top at it. */
  const sunken = (depth: number) => (type: TerrainMaterial) => (type === "sand" ? depth : 0);

  it("eases the feet up over the first share of a climb and then steps onto the top", () => {
    expect([0, PLAYER_CLIMB_RISE_SHARE / 2, PLAYER_CLIMB_RISE_SHARE, 1, -1].map(getClimbRise)).toEqual([
      0, 0.5, 1, 1, 0,
    ]);
    const halfway = PLAYER_CLIMB_RISE_SHARE + (1 - PLAYER_CLIMB_RISE_SHARE) / 2;
    expect([0, PLAYER_CLIMB_RISE_SHARE, halfway, 1, 2].map(getClimbAdvance)).toEqual([0, 0, 0.5, 1, 1]);
    expect(PLAYER_STEP_HEIGHT).toBeLessThan(0.5);
  });

  it("stops at the foot of a higher column and climbs it: feet up first, then onto the top", () => {
    const ground = groundFrom(["01", "01"]);
    const player = walking(ground, { x: 0, y: 0 }, { up: true, right: true });
    untilClimbing(player, ground);
    const { climb } = player;

    expect(player).toMatchObject({ elevation: 0, height: 0 });
    expect(player.x).toBeLessThan(0.5);
    expect(climb).toMatchObject({ direction: { x: 1, y: 0 }, feet: 0, rise: 1, ticks: PLAYER_CLIMB_TICKS, tick: 0 });
    expect(climb?.from).toEqual({ x: player.x, y: 0 });
    expect(climb?.to.x).toBeCloseTo(player.x + PLAYER_STEP + PLAYER_CLIMB_REACH);

    const path: Array<{ x: number; feet: number }> = [];
    while (player.climb) {
      stepPlayer(player, ground);
      path.push({ x: player.x, feet: feetOf(player) });
    }
    // Its last tick is drawn as part of the climb; the next one walks on.
    expect(path).toHaveLength(PLAYER_CLIMB_TICKS + 1);
    const rising = path.filter((at) => at.x === climb?.from.x);
    expect(rising).toHaveLength(Math.floor(PLAYER_CLIMB_TICKS * PLAYER_CLIMB_RISE_SHARE));
    rising.forEach((at, index) => expect(at.feet).toBeGreaterThanOrEqual(rising[index - 1]?.feet ?? 0));
    path.slice(rising.length).forEach((at) => expect(at.feet).toBe(1));
    expect(path[PLAYER_CLIMB_TICKS - 1]).toEqual({ x: climb?.to.x, feet: 1 });
    expect(player).toMatchObject({ elevation: 1, inset: 0, height: 0, verticalSpeed: undefined });
    expect(player.x).toBeGreaterThan(climb?.to.x ?? 0);
    expect(player.motion).toEqual({ type: "walking" });
  });

  it("ignores its walk and forgets jumps while it climbs, even standing still", () => {
    const ground = groundFrom(["01"]);
    const player = walking(ground, { x: 0, y: 0 }, { up: true, right: true });
    untilClimbing(player, ground);
    setPlayerWalk(player, { ...still, down: true });
    jumpPlayer(player);
    stepPlayer(player, ground);

    expect(player.wantsJump).toBe(false);
    expect(player.verticalSpeed).toBeUndefined();
    player.walk = { x: 0, y: 0 };
    stepPlayer(player, ground, PLAYER_CLIMB_TICKS);
    stepPlayer(player, ground);
    expect(player).toMatchObject({ elevation: 1, height: 0 });
    expect(player.motion).toEqual({ type: "idle" });
  });

  it("climbs from sand's sunken top onto a full one in half the time, and steps up a little rise", () => {
    const sand = groundFrom(["s0"]);
    const player = walking(sand, { x: 0, y: 0 }, { up: true, right: true });
    untilClimbing(player, sand, sunken(0.5));
    expect(player.climb).toMatchObject({ feet: -0.5, rise: 0.5, ticks: PLAYER_CLIMB_TICKS / 2 });

    const low = groundFrom(["s0"]);
    const stepper = walking(low, { x: 0, y: 0 }, { up: true, right: true });
    for (let tick = 0; tick < ticksFor(1); tick += 1) stepPlayer(stepper, low, 1, sunken(PLAYER_STEP_HEIGHT));
    expect(stepper.climb).toBeUndefined();
    expect(stepper.x).toBeGreaterThan(0.5);
  });

  it("waits to climb a higher column until it has landed", () => {
    const ground = groundFrom(["0011"]);
    const player = walking(ground, { x: 1, y: 0 }, { up: true, right: true });
    jumpPlayer(player);
    stepPlayer(player, ground);
    stepPlayer(player, ground, PLAYER_JUMP_TICKS - 2);
    expect(player.climb).toBeUndefined();
    untilClimbing(player, ground);
    expect(player.climb?.feet).toBe(0);
    expect(player.verticalSpeed).toBeUndefined();
    while (player.elevation === 0 || player.climb) stepPlayer(player, ground);
    expect(player).toMatchObject({ elevation: 1, height: 0, verticalSpeed: undefined });
  });

  it("ends where it reached the top when its feet do not fit further on", () => {
    const open = groundFrom(["01"]);
    const ground: PlayerGround = {
      columnIndex: open.columnIndex,
      occupancy: { at: (x, y) => (x === 1 && y === 0 ? [{ walkable: false, collisionAt: () => TRUNK }] : []) },
    };
    const player = walking(ground, { x: 0, y: 0 }, { up: true, right: true });
    untilClimbing(player, ground);

    expect(player.climb?.to.x).toBeCloseTo(player.x + PLAYER_STEP);
  });

  it("is drawn through its climb between its last two ticks, and not at all standing", () => {
    const ground = groundFrom(["01"]);
    const player = walking(ground, { x: 0, y: 0 }, { up: true, right: true });
    expect(getPlayerClimbProgress(player, 0.5)).toBeUndefined();
    untilClimbing(player, ground);

    expect(getPlayerClimbProgress(player, 0.5)).toBe(0);
    stepPlayer(player, ground, 3);
    expect(getPlayerClimbProgress(player, 0)).toBe(2 / PLAYER_CLIMB_TICKS);
    expect(getPlayerClimbProgress(player, 0.5)).toBe(2.5 / PLAYER_CLIMB_TICKS);
    expect(getPlayerClimbProgress(player, Number.NaN)).toBe(3 / PLAYER_CLIMB_TICKS);
    expect(getPlayerClimbProgress(player, 5)).toBe(3 / PLAYER_CLIMB_TICKS);
  });
});

describe("double jump", () => {
  const flat = groundFrom(["000", "000", "000"]);

  it("jumps once more in the air, and gets that jump back when it lands", () => {
    const player = createPlayer(flat, { x: 1, y: 1 });
    jumpPlayer(player);
    stepPlayer(player, flat, 4);
    const before = player.height;
    jumpPlayer(player);
    stepPlayer(player, flat);

    expect(PLAYER_AIR_JUMPS).toBe(1);
    expect(player.height).toBeGreaterThan(before);
    expect(player.verticalSpeed).toBeGreaterThan(0);
    expect(player.airJumps).toBe(0);
    expect(player.feedback).toMatchObject({ jumps: 2, airJump: true, leap: true, rejections: 0 });
    expect(getPlayerJumpPhase(player)).toBe("takeoff");

    jumpPlayer(player);
    stepPlayer(player, flat, PLAYER_JUMP_BUFFER_TICKS);
    expect(player.feedback).toMatchObject({ jumps: 2, rejections: 1, rejected: "airborne" });
    for (let tick = 0; tick < 60 && player.verticalSpeed !== undefined; tick += 1) stepPlayer(player, flat);
    expect(player.height).toBe(0);
    expect(player.airJumps).toBe(PLAYER_AIR_JUMPS);
    expect(player.feedback).toMatchObject({ landings: 1, airJump: true });

    jumpPlayer(player);
    stepPlayer(player, flat);
    expect(player.feedback).toMatchObject({ jumps: 3, airJump: false });
  });

  it("jumps in the air after walking off an edge, once the coyote ticks are over", () => {
    const ledge = groundFrom(["00.000", "00.000", "00.000"]);
    const player = walking(ledge, { x: 1.3, y: 1 }, { right: true, up: true });
    for (let tick = 0; tick < 60 && player.verticalSpeed === undefined; tick += 1) stepPlayer(player, ledge);
    stepPlayer(player, ledge, PLAYER_COYOTE_TICKS);
    jumpPlayer(player);
    stepPlayer(player, ledge);
    expect(player.verticalSpeed).toBeGreaterThan(0);
    expect(player.feedback).toMatchObject({ jumps: 1, airJump: true });
    expect(player.airJumps).toBe(0);
  });

  it("reaches a top one block higher without climbing, which one jump cannot", () => {
    const step = groundFrom(["0001"]);
    const leap = (double: boolean) => {
      const player = createPlayer(step, { x: 2, y: 0 });
      jumpPlayer(player);
      stepPlayer(player, step, 4);
      if (double) jumpPlayer(player);
      setPlayerWalk(player, { ...still, right: true, up: true });
      let climbed = false;
      for (let tick = 0; tick < 60; tick += 1) {
        stepPlayer(player, step);
        climbed ||= player.climb !== undefined;
        if (player.verticalSpeed === undefined) break;
      }
      return { player, climbed };
    };

    const twice = leap(true);
    expect(twice.climbed).toBe(false);
    expect(twice.player.elevation).toBe(1);
    expect(twice.player.x).toBeGreaterThan(2.5);
    const once = leap(false);
    expect(once.climbed).toBe(false);
    expect(once.player.elevation).toBe(0);
  });

  it("announces a double jump as a jump in the air", () => {
    const player = createPlayer(flat, { x: 1, y: 1 });
    const world = {
      ...flat,
      movers: new SpatialIndex<object>(),
      parts: { get: <T>(key: WorldPartKey<T>) => (key.id === PLAYER_PART.id ? player : null) as T },
    };
    const events = createEventBus<SimulationEvents>();
    const heard: boolean[] = [];
    events.on("playerJumped", ({ air }) => heard.push(air));
    const system = createPlayerSystem();
    jumpPlayer(player);
    for (let tick = 0; tick < 4; tick += 1) system.step(world, events);
    jumpPlayer(player);
    system.step(world, events);
    expect(heard).toEqual([false, true]);
  });
});

describe("jump feedback", () => {
  const flat = groundFrom(["000", "000", "000"]);

  /** Phases of `player` after each of `ticks` ticks. */
  const phases = (player: PlayerState, ground: PlayerGround, ticks: number) => {
    const out: PlayerJumpPhase[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      stepPlayer(player, ground);
      out.push(getPlayerJumpPhase(player));
    }
    return out;
  };

  it("starts with nothing done", () => {
    expect(createPlayer(flat, { x: 1, y: 1 }).feedback).toEqual({
      jumps: 0,
      landings: 0,
      rejections: 0,
      rejected: undefined,
      airTicks: 0,
      landingTicks: 0,
      impact: 0,
      leap: false,
      airJump: false,
    });
    expect(PLAYER_TAKEOFF_TICKS).toBe(2);
    expect(PLAYER_LANDING_TICKS).toBe(3);
    expect(PLAYER_APEX_SPEED).toBe(PLAYER_GRAVITY);
  });

  it("goes through take-off, rise, apex, fall and landing in a held jump, the physics never waiting", () => {
    const player = createPlayer(flat, { x: 1, y: 1 });
    jumpPlayer(player);

    expect(phases(player, flat, PLAYER_JUMP_TICKS + PLAYER_LANDING_TICKS + 1)).toEqual([
      "takeoff",
      "takeoff",
      "rise",
      "apex",
      "apex",
      "apex",
      "fall",
      "fall",
      "fall",
      "landing",
      "landing",
      "landing",
      "ground",
      "ground",
    ]);
    expect(player.feedback).toMatchObject({ jumps: 1, landings: 1, rejections: 0, airTicks: 0, leap: false });
    expect(player.feedback.impact).toBeCloseTo(PLAYER_JUMP_SPEED - PLAYER_GRAVITY / 2);
  });

  it("falls at once without an apex when it walks off an edge, and lands", () => {
    const ledge = groundFrom(["1100", "1100", "1100"]);
    const player = walking(ledge, { x: 1.3, y: 1 }, { right: true, up: true });
    while (player.verticalSpeed === undefined) stepPlayer(player, ledge);

    expect(getPlayerJumpPhase(player)).toBe("fall");
    setPlayerWalk(player, still);
    while (player.verticalSpeed !== undefined) {
      expect(getPlayerJumpPhase(player)).toBe("fall");
      stepPlayer(player, ledge);
    }
    expect(getPlayerJumpPhase(player)).toBe("landing");
    expect(player.feedback).toMatchObject({ jumps: 0, landings: 1, landingTicks: PLAYER_LANDING_TICKS });
    expect(player.feedback.impact).toBeGreaterThan(0);
  });

  it("is on the ground while it climbs", () => {
    const stairs = groundFrom(["01"]);
    const climber = walking(stairs, { x: 0.3, y: 0 }, { right: true, up: true });
    while (!climber.climb) stepPlayer(climber, stairs);
    expect(getPlayerJumpPhase(climber)).toBe("ground");
  });

  it("rejects a press it cannot use: in the air, climbing, or under a ceiling right overhead", () => {
    const jumper = createPlayer(flat, { x: 1, y: 1 });
    jumpPlayer(jumper);
    stepPlayer(jumper, flat, 2);
    jumper.airJumps = 0;
    jumpPlayer(jumper);
    stepPlayer(jumper, flat);
    expect(jumper.feedback.rejections).toBe(0);
    stepPlayer(jumper, flat);
    expect(jumper.feedback).toMatchObject({ jumps: 1, rejections: 1, rejected: "airborne" });

    const stairs = groundFrom(["01"]);
    const climber = walking(stairs, { x: 0.3, y: 0 }, { right: true, up: true });
    while (!climber.climb) stepPlayer(climber, stairs);
    jumpPlayer(climber);
    stepPlayer(climber, stairs);
    expect(climber.feedback).toMatchObject({ jumps: 0, rejections: 1, rejected: "climbing" });

    const roof: PlayerGround = {
      ...flat,
      occupancy: { at: (x, y) => (x === 1 && y === 1 ? [{ walkable: false, elevation: 0.7, height: 1 }] : []) },
    };
    const bumped = createPlayer(roof, { x: 1, y: 1 });
    jumpPlayer(bumped);
    stepPlayer(bumped, roof);
    expect(bumped.feedback).toMatchObject({ jumps: 0, rejections: 1, rejected: "ceiling", leap: false });
    expect(getPlayerJumpPhase(bumped)).toBe("fall");
  });

  it("lands and takes off again on the same tick with a buffered press", () => {
    const player = createPlayer(flat, { x: 1, y: 1 });
    jumpPlayer(player);
    stepPlayer(player, flat, PLAYER_JUMP_TICKS - 1);
    player.airJumps = 0;
    jumpPlayer(player);
    stepPlayer(player, flat);

    expect(player.feedback).toMatchObject({ jumps: 2, landings: 1, landingTicks: 0, airTicks: 1, leap: true });
    expect(player.airJumps).toBe(PLAYER_AIR_JUMPS);
    expect(getPlayerJumpPhase(player)).toBe("takeoff");
  });

  it("announces landings, take-offs and rejected presses on the simulation events, the same every run", () => {
    const run = () => {
      const player = createPlayer(flat, { x: 1, y: 1 });
      const world = {
        ...flat,
        movers: new SpatialIndex<object>(),
        parts: { get: <T>(key: WorldPartKey<T>) => (key.id === PLAYER_PART.id ? player : null) as T },
      };
      const events = createEventBus<SimulationEvents>();
      const heard: Array<[string, object]> = [];
      events.on("playerJumped", (payload) => heard.push(["jumped", payload]));
      events.on("playerLanded", (payload) => heard.push(["landed", payload]));
      events.on("playerJumpRejected", (payload) => heard.push(["rejected", payload]));
      const system = createPlayerSystem();
      jumpPlayer(player);
      for (let tick = 0; tick < PLAYER_JUMP_TICKS - 1; tick += 1) system.step(world, events);
      player.airJumps = 0;
      jumpPlayer(player);
      system.step(world, events);
      for (let tick = 0; tick < 3; tick += 1) system.step(world, events);
      player.airJumps = 0;
      jumpPlayer(player);
      for (let tick = 0; tick < 3; tick += 1) system.step(world, events);
      return heard;
    };
    const heard = run();

    expect(heard.map(([name]) => name)).toEqual(["jumped", "landed", "jumped", "rejected"]);
    expect(heard[0][1]).toEqual({
      x: 1,
      y: 1,
      feet: expect.closeTo(PLAYER_JUMP_SPEED - PLAYER_GRAVITY / 2),
      air: false,
    });
    expect(heard[1][1]).toEqual({
      x: 1,
      y: 1,
      feet: 0,
      impact: expect.closeTo(PLAYER_JUMP_SPEED - PLAYER_GRAVITY / 2),
    });
    expect(heard[3][1]).toEqual({ reason: "airborne" });
    expect(run()).toEqual(heard);
  });

  it("builds no payload nobody listens to", () => {
    const player = createPlayer(flat, { x: 1, y: 1 });
    const world = {
      ...flat,
      movers: new SpatialIndex<object>(),
      parts: { get: <T>(key: WorldPartKey<T>) => (key.id === PLAYER_PART.id ? player : null) as T },
    };
    const events = createEventBus<SimulationEvents>();
    const emit = vi.spyOn(events, "emit");
    jumpPlayer(player);
    for (let tick = 0; tick < PLAYER_JUMP_TICKS + 4; tick += 1) {
      if (tick === 3) {
        player.airJumps = 0;
        jumpPlayer(player);
      }
      createPlayerSystem().step(world, events);
    }
    expect(player.feedback).toMatchObject({ jumps: 1, landings: 1, rejections: 1 });
    expect(emit).not.toHaveBeenCalled();
  });
});
