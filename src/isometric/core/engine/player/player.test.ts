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
  canStandOn,
  createPlayer,
  createPlayerSystem,
  findPlayerSpawn,
  fitsPlayerAt,
  PLAYER_SPAWN_RADIUS,
  getPlayerCells,
  getPlayerColumn,
  getPlayerRenderPosition,
  getWalkDirection,
  setPlayerWalk,
  stepPlayer,
} from "./player";

/** Ticks a walking player needs to cover `columns`, whatever `PLAYER_SPEED` is. */
const ticksFor = (columns: number) => Math.ceil(columns / PLAYER_STEP);

const still: ScreenDirections = { up: false, down: false, left: false, right: false };

/**
 * A ground drawn as text: each string is a row along `y`, each character a column along `x`.
 * Digits are grass at that elevation, `~` water, `T` a tree (grass at 0 with a non-walkable
 * occupant), `w` grass at 0 with a walkable occupant.
 */
const groundFrom = (rows: readonly string[]): PlayerGround => {
  const columns: ITerrainColumn[] = [];
  const occupants = new CellMap<{ walkable: boolean }[]>();
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      const type: TerrainMaterial = cell === "~" ? "water" : "grass";
      const elevation = /\d/.test(cell) ? Number(cell) : cell === "~" ? -1 : 0;
      columns.push({ x, y, elevation, type, metadata: {} });
      if (cell === "T") occupants.set(x, y, [{ walkable: false }]);
      if (cell === "w") occupants.set(x, y, [{ walkable: true }]);
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
      previous: { x: 1.2, y: 0, elevation: 3 },
      walk: { x: 0, y: 0 },
    });
  });

  it("stands at elevation 0 off the terrain", () => {
    expect(createPlayer(groundFrom(["0"]), { x: 5, y: 5 }).elevation).toBe(0);
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
    expect(player.previous).toEqual({ x: 1, y: 2, elevation: 0 });
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

describe("stepPlayer", () => {
  const field = groundFrom(["00000", "00000", "00000", "00000", "00000"]);

  it("walks PLAYER_STEP per tick along its walk, keeping the previous position", () => {
    const player = walking(field, { x: 1, y: 2 }, { up: true, right: true });
    stepPlayer(player, field);
    expect(player.x).toBeCloseTo(1 + PLAYER_STEP);
    expect(player.y).toBe(2);
    expect(player.previous).toEqual({ x: 1, y: 2, elevation: 0 });

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
    expect(player.previous).toEqual({ x: 2, y: 2, elevation: 0 });
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
    previous: { x: 1, y: 4, elevation: 0 },
    walk: { x: 1, y: 0 },
  };

  it("interpolates between the previous and the current position", () => {
    expect(getPlayerRenderPosition(player, 0)).toEqual({ x: 1, y: 4, elevation: 0 });
    expect(getPlayerRenderPosition(player, 0.25)).toEqual({ x: 1.25, y: 4, elevation: 0.25 });
    expect(getPlayerRenderPosition(player, 1)).toEqual({ x: 2, y: 4, elevation: 1 });
  });

  it("clamps alpha to [0, 1] and treats invalid values as the current position", () => {
    expect(getPlayerRenderPosition(player, -1)).toEqual({ x: 1, y: 4, elevation: 0 });
    expect(getPlayerRenderPosition(player, 2)).toEqual({ x: 2, y: 4, elevation: 1 });
    expect(getPlayerRenderPosition(player, Number.NaN)).toEqual({ x: 2, y: 4, elevation: 1 });
  });
});
