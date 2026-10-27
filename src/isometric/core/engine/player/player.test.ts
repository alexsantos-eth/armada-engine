import { describe, expect, it, vi } from "vitest";
import type { ITerrainColumn, PlayerState, ScreenDirections, TerrainMaterial, WorldPartKey } from "../../types";
import { CellMap, SpatialIndex } from "../grid";
import { TICKS_PER_SECOND } from "../time";
import {
  PLAYER_MAX_CLIMB,
  PLAYER_PART,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_STEP,
  type PlayerGround,
  type PlayerObstacle,
  canStandOn,
  createPlayer,
  createPlayerSystem,
  findPlayerSpawn,
  fitsPlayerAt,
  PLAYER_SPAWN_RADIUS,
  getPlayerCells,
  getPlayerColumn,
  getPlayerRenderPosition,
  getJumpHeight,
  getPlayerFacing,
  jumpPlayer,
  PLAYER_JUMP_HEIGHT,
  PLAYER_JUMP_TICKS,
  PLAYER_JUMP_SPEED,
  PLAYER_GRAVITY,
  getWalkDirection,
  PLAYER_FACINGS,
  setPlayerWalk,
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
      columns.push({ x, y, elevation, type, metadata: {} });
      if (cell === "T") occupants.set(x, y, [{ walkable: false }]);
      if (cell === "w") occupants.set(x, y, [{ walkable: true }]);
      if (cell === "t") occupants.set(x, y, [{ walkable: false, collisionAt: () => TRUNK }]);
      if (cell === "o") occupants.set(x, y, [{ walkable: false, collisionAt: () => 0 }]);
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
      inset: 0,
      height: 0,
      verticalSpeed: undefined,
      wantsJump: false,
      previous: { x: 1.2, y: 0, elevation: 3, inset: 0, height: 0 },
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
    expect(player.x).toBeCloseTo(1 + PLAYER_STEP);
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
    expect(PLAYER_JUMP_SPEED).toBeCloseTo(0.3);
    expect(PLAYER_GRAVITY).toBeCloseTo(0.06);
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

  it("does not jump again in the air: asking then is forgotten", () => {
    const player = createPlayer(field, { x: 1, y: 1 });
    jumpPlayer(player);
    stepPlayer(player, field, 3);
    jumpPlayer(player);
    stepPlayer(player, field);

    expect(player.height).toBeCloseTo(getJumpHeight(4));
    expect(player.wantsJump).toBe(false);
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

    expect(player.x - player.y).toBeCloseTo(1 - 1 + 4 * PLAYER_STEP * Math.SQRT2);
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
    const ground = step("2211");
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

  it("steps up onto a higher column it reaches in the air, landing there", () => {
    const ground = step("0011");
    const player = walking(ground, { x: 1, y: 1 }, { up: true, right: true });
    jumpPlayer(player);
    while (player.elevation === 0) stepPlayer(player, ground);

    expect(player).toMatchObject({ elevation: 1, height: 0, verticalSpeed: undefined });
  });
});

describe("stepPlayer", () => {
  const field = groundFrom(["00000", "00000", "00000", "00000", "00000"]);

  it("walks PLAYER_STEP per tick along its walk, keeping the previous position", () => {
    const player = walking(field, { x: 1, y: 2 }, { up: true, right: true });
    stepPlayer(player, field);
    expect(player.x).toBeCloseTo(1 + PLAYER_STEP);
    expect(player.y).toBe(2);
    expect(player.previous).toEqual({ x: 1, y: 2, elevation: 0, inset: 0, height: 0 });

    stepPlayer(player, field, 3);
    expect(player.x).toBeCloseTo(1 + 4 * PLAYER_STEP);
    expect(player.previous.x).toBeCloseTo(1 + 3 * PLAYER_STEP);
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

  it("stops at the edge of the land and of the world", () => {
    const shore = groundFrom(["00~"]);
    const player = walking(shore, { x: 0, y: 0 }, { up: true, right: true });
    stepPlayer(player, shore, ticksFor(4));
    expect(player.x).toBeLessThanOrEqual(1.5 - PLAYER_RADIUS + 1e-9);
    expect(player.x).toBeGreaterThan(1.5 - PLAYER_RADIUS - PLAYER_STEP);

    // Down-right walks along −y, off the world: the feet stop at the edge of column y = 0.
    const edge = walking(shore, { x: 0, y: 0 }, { down: true, right: true });
    stepPlayer(edge, shore, ticksFor(2));
    expect(edge.x).toBe(0);
    expect(edge.y).toBeGreaterThan(-0.5 + PLAYER_RADIUS - PLAYER_STEP);
    expect(edge.y).toBeLessThan(0);
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
    const elevations = Array.from({ length: ticksFor(6) }, () => {
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
    x: 2,
    y: 4,
    elevation: 1,
    inset: 0.5,
    height: 0.5,
    verticalSpeed: 0.1,
    wantsJump: false,
    previous: { x: 1, y: 4, elevation: 0 },
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
