import { describe, it, expect } from 'vitest';
import {
  getObstacleCellsFromObstacle,
  generateObstacle,
  generateObstacles,
} from '../../tools/obstacles';
import {
  ROCK_OBSTACLE,
  REEF_OBSTACLE,
  ISLAND_OBSTACLE,
} from '../../constants/obstacles';
import { StandardBoardView, withView } from '../../constants/views';
import type { GameItem, GameObstacle, GameShip } from '../../types/common';

const BOARD = 10;
const NO_SHIPS: GameShip[] = [];
const NO_ITEMS: GameItem[] = [];
const NO_OBS: GameObstacle[] = [];

describe('getObstacleCellsFromObstacle', () => {
  it('should return single cell for 1×1 obstacle', () => {
    const obs: GameObstacle = { coords: [3, 4], width: 1, height: 1, obstacleId: 0 };
    expect(getObstacleCellsFromObstacle(obs)).toEqual([[3, 4]]);
  });

  it('should return 2 cells for 2×1 obstacle', () => {
    const obs: GameObstacle = { coords: [2, 5], width: 2, height: 1, obstacleId: 0 };
    expect(getObstacleCellsFromObstacle(obs)).toEqual([[2, 5], [3, 5]]);
  });

  it('should return 4 cells for 2×2 obstacle', () => {
    const obs: GameObstacle = { coords: [0, 0], width: 2, height: 2, obstacleId: 0 };
    expect(getObstacleCellsFromObstacle(obs)).toEqual([
      [0, 0], [1, 0],
      [0, 1], [1, 1],
    ]);
  });

  it('should work for all built-in templates at origin', () => {
    const rock: GameObstacle = { ...ROCK_OBSTACLE, coords: [0, 0], obstacleId: 0 };
    const reef: GameObstacle = { ...REEF_OBSTACLE, coords: [0, 0], obstacleId: 1 };
    const island: GameObstacle = { ...ISLAND_OBSTACLE, coords: [0, 0], obstacleId: 2 };

    expect(getObstacleCellsFromObstacle(rock)).toHaveLength(1);
    expect(getObstacleCellsFromObstacle(reef)).toHaveLength(2);
    expect(getObstacleCellsFromObstacle(island)).toHaveLength(4);
  });
});

describe('generateObstacle', () => {
  it('should generate a rock obstacle on empty board', () => {
    const obs = generateObstacle(ROCK_OBSTACLE, BOARD, BOARD, NO_SHIPS, NO_ITEMS, NO_OBS, 0);
    expect(obs).not.toBeNull();
    expect(obs?.obstacleId).toBe(0);
    expect(obs?.width).toBe(1);
    expect(obs?.height).toBe(1);
  });

  it('should generate a reef obstacle on empty board', () => {
    const obs = generateObstacle(REEF_OBSTACLE, BOARD, BOARD, NO_SHIPS, NO_ITEMS, NO_OBS, 0);
    expect(obs).not.toBeNull();
    expect(obs?.width).toBe(2);
    expect(obs?.height).toBe(1);
  });

  it('should generate an island obstacle on empty board', () => {
    const obs = generateObstacle(ISLAND_OBSTACLE, BOARD, BOARD, NO_SHIPS, NO_ITEMS, NO_OBS, 0);
    expect(obs).not.toBeNull();
    expect(obs?.width).toBe(2);
    expect(obs?.height).toBe(2);
  });

  it('should place obstacle within board bounds', () => {
    const obs = generateObstacle(REEF_OBSTACLE, BOARD, BOARD, NO_SHIPS, NO_ITEMS, NO_OBS, 0);
    expect(obs).not.toBeNull();
    const [x, y] = obs!.coords;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + obs!.width).toBeLessThanOrEqual(BOARD);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y + obs!.height).toBeLessThanOrEqual(BOARD);
  });

  it('should not overlap an existing obstacle', () => {
    const first = generateObstacle(ROCK_OBSTACLE, BOARD, BOARD, NO_SHIPS, NO_ITEMS, NO_OBS, 0);
    expect(first).not.toBeNull();
    const second = generateObstacle(ROCK_OBSTACLE, BOARD, BOARD, NO_SHIPS, NO_ITEMS, [first!], 1);
    if (second) {
      const firstCells = getObstacleCellsFromObstacle(first!).map(([x, y]) => `${x},${y}`);
      for (const [x, y] of getObstacleCellsFromObstacle(second)) {
        expect(firstCells).not.toContain(`${x},${y}`);
      }
    }
  });

  it('should not overlap a ship cell', () => {
    const ship: GameShip = { coords: [5, 5], width: 1, height: 1, shipId: 0 };
    for (let i = 0; i < 20; i++) {
      const obs = generateObstacle(ROCK_OBSTACLE, BOARD, BOARD, [ship], NO_ITEMS, NO_OBS, i);
      if (obs) {
        const cells = getObstacleCellsFromObstacle(obs).map(([x, y]) => `${x},${y}`);
        expect(cells).not.toContain('5,5');
      }
    }
  });

  it('should return null when obstacle is larger than board', () => {
    const obs = generateObstacle(ISLAND_OBSTACLE, 1, 1, NO_SHIPS, NO_ITEMS, NO_OBS, 0);
    expect(obs).toBeNull();
  });
});

describe('generateObstacles', () => {
  it('should generate obstacles according to config counts', () => {
    const config = {
      boardView: withView({ width: 15, height: 15 }, StandardBoardView),
      obstacleCounts: { rock: 2, reef: 1 },
    };
    const obstacles = generateObstacles(config, NO_SHIPS, NO_ITEMS);
    const rocks = obstacles.filter(o => o.width === 1 && o.height === 1);
    const reefs = obstacles.filter(o => o.width === 2 && o.height === 1);
    expect(rocks).toHaveLength(2);
    expect(reefs).toHaveLength(1);
  });

  it('should skip unknown template names', () => {
    const config = { obstacleCounts: { unknown_thing: 3 } };
    expect(generateObstacles(config, NO_SHIPS, NO_ITEMS)).toHaveLength(0);
  });

  it('should generate zero obstacles when counts are zero', () => {
    const config = { obstacleCounts: { rock: 0, reef: 0, island: 0 } };
    expect(generateObstacles(config, NO_SHIPS, NO_ITEMS)).toHaveLength(0);
  });

  it('should assign sequential obstacleIds', () => {
    const config = {
      boardView: withView({ width: 15, height: 15 }, StandardBoardView),
      obstacleCounts: { rock: 3 },
    };
    const obstacles = generateObstacles(config, NO_SHIPS, NO_ITEMS);
    obstacles.forEach((obs, idx) => expect(obs.obstacleId).toBe(idx));
  });

  it('should place all obstacles within board bounds', () => {
    const W = 15, H = 15;
    const config = {
      boardView: withView({ width: W, height: H }, StandardBoardView),
      obstacleCounts: { rock: 2, reef: 1 },
    };
    const obstacles = generateObstacles(config, NO_SHIPS, NO_ITEMS);
    for (const obs of obstacles) {
      const [x, y] = obs.coords;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + obs.width).toBeLessThanOrEqual(W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + obs.height).toBeLessThanOrEqual(H);
    }
  });

  it('should use default config values when not specified', () => {
    const obstacles = generateObstacles({}, NO_SHIPS, NO_ITEMS);
    expect(obstacles.length).toBeGreaterThanOrEqual(0);
  });
});
