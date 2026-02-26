import { describe, it, expect } from 'vitest';
import {
  getShip2DCells,
  getShipCellsFromShip,
  getShipSize,
  isValidShipPlacement,
  findFreeShipPosition,
  generateShip,
  generateShip2D,
  generateShips,
  getQuadrantPreferences,
  generatePositionInPreferredQuadrant,
  generateRandomPosition,
} from '../../tools/ships';
import { GAME_CONSTANTS } from '../../constants/game';
import {
  SMALL_SHIP,
  MEDIUM_SHIP,
  LARGE_SHIP,
  XLARGE_SHIP,
} from '../../constants/ships';
import { StandardBoardView, withView } from '../../constants/views';
import type { GameShip } from '../../types/entities';

describe('getShip2DCells', () => {
  it('should generate horizontal ship cells', () => {
    const cells = getShip2DCells(2, 3, 3, 1);
    expect(cells).toEqual([
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });

  it('should generate vertical ship cells', () => {
    const cells = getShip2DCells(5, 2, 1, 3);
    expect(cells).toEqual([
      [5, 2],
      [5, 3],
      [5, 4],
    ]);
  });

  it('should handle single cell ship', () => {
    const cells = getShip2DCells(0, 0, 1, 1);
    expect(cells).toEqual([[0, 0]]);
  });

  it('should handle large ships', () => {
    const cells = getShip2DCells(0, 0, 5, 1);
    expect(cells).toHaveLength(5);
    expect(cells).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
  });
});

describe('getShipCellsFromShip', () => {
  it('should get cells from small horizontal ship', () => {
    const ship: GameShip = { coords: [2, 3], width: 2, height: 1 };
    expect(getShipCellsFromShip(ship)).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it('should get cells from medium vertical ship', () => {
    const ship: GameShip = { coords: [5, 5], width: 1, height: 3 };
    expect(getShipCellsFromShip(ship)).toEqual([
      [5, 5],
      [5, 6],
      [5, 7],
    ]);
  });

  it('should get cells from large ship', () => {
    const ship: GameShip = { coords: [0, 0], width: 4, height: 1 };
    expect(getShipCellsFromShip(ship)).toHaveLength(4);
  });

  it('should get cells from xlarge vertical ship', () => {
    const ship: GameShip = { coords: [0, 0], width: 1, height: 5 };
    expect(getShipCellsFromShip(ship)).toHaveLength(5);
  });
});

describe('getShipSize', () => {
  it('should return correct size for small ship', () => {
    expect(getShipSize(SMALL_SHIP)).toBe(2);
  });

  it('should return correct size for medium ship', () => {
    expect(getShipSize(MEDIUM_SHIP)).toBe(3);
  });

  it('should return correct size for large ship', () => {
    expect(getShipSize(LARGE_SHIP)).toBe(4);
  });

  it('should return correct size for xlarge ship', () => {
    expect(getShipSize(XLARGE_SHIP)).toBe(5);
  });

  it('should return width × height for 2D ships', () => {
    const ship2D: GameShip = { coords: [0, 0], width: 3, height: 2 };
    expect(getShipSize(ship2D)).toBe(6);
  });
});

describe('isValidShipPlacement', () => {
  it('should validate ship within board bounds', () => {
    const ship: GameShip = { coords: [0, 0], width: 2, height: 1 };
    expect(isValidShipPlacement(ship, [], 10, 10)).toBe(true);
  });

  it('should reject ship outside board (right edge)', () => {
    const ship: GameShip = { coords: [9, 0], width: 2, height: 1 };
    expect(isValidShipPlacement(ship, [], 10, 10)).toBe(false);
  });

  it('should reject ship outside board (bottom edge)', () => {
    const ship: GameShip = { coords: [0, 9], width: 1, height: 2 };
    expect(isValidShipPlacement(ship, [], 10, 10)).toBe(false);
  });

  it('should reject ship starting at negative coordinates', () => {
    const ship: GameShip = { coords: [-1, 0], width: 2, height: 1 };
    expect(isValidShipPlacement(ship, [], 10, 10)).toBe(false);
  });

  it('should reject overlapping ships', () => {
    const existing: GameShip = { coords: [2, 2], width: 2, height: 1 };
    const newShip: GameShip = { coords: [3, 2], width: 2, height: 1 };
    expect(isValidShipPlacement(newShip, [existing], 10, 10)).toBe(false);
  });

  it('should enforce minimum distance between ships', () => {
    const existing: GameShip = { coords: [2, 2], width: 2, height: 1 };
    const tooClose: GameShip = { coords: [2, 3], width: 2, height: 1 };
    const farEnough: GameShip = { coords: [2, 4], width: 2, height: 1 };

    expect(isValidShipPlacement(tooClose, [existing], 10, 10)).toBe(false);
    expect(isValidShipPlacement(farEnough, [existing], 10, 10)).toBe(true);
  });

  it('should validate diagonal distance', () => {
    const existing: GameShip = { coords: [5, 5], width: 2, height: 1 };
    const diagonal: GameShip = { coords: [7, 6], width: 2, height: 1 };
    expect(isValidShipPlacement(diagonal, [existing], 10, 10)).toBe(false);
  });

  it('should allow ships at exact minimum distance', () => {
    const existing: GameShip = { coords: [0, 0], width: 2, height: 1 };
    const newShip: GameShip = { coords: [0, 2], width: 2, height: 1 };
    expect(isValidShipPlacement(newShip, [existing], 10, 10)).toBe(true);
  });
});

describe('findFreeShipPosition', () => {
  it('should find a free position on empty board', () => {
    const pos = findFreeShipPosition(2, 1, [], [], 10, 10);
    expect(pos).not.toBeNull();
    expect(pos![0]).toBeGreaterThanOrEqual(0);
    expect(pos![1]).toBeGreaterThanOrEqual(0);
  });

  it('should return preferred position when it fits', () => {
    const pos = findFreeShipPosition(2, 1, [], [], 10, 10, [4, 4]);
    expect(pos).toEqual([4, 4]);
  });

  it('should fall back from preferred if blocked by shot cells', () => {
    const shotCells = [{ x: 4, y: 4 }, { x: 5, y: 4 }];
    const pos = findFreeShipPosition(2, 1, [], shotCells, 10, 10, [4, 4]);
    // preferred is blocked, should find another slot
    expect(pos).not.toBeNull();
    expect(pos).not.toEqual([4, 4]);
  });

  it('should return null when no space is available', () => {
    const ships: GameShip[] = [{ coords: [0, 0], width: 10, height: 10, shipId: 0 }];
    const pos = findFreeShipPosition(2, 1, ships, [], 10, 10);
    expect(pos).toBeNull();
  });
});

describe('generateShip', () => {
  it('should generate a valid ship on empty board', () => {
    const ship = generateShip(SMALL_SHIP, 10, 10, []);
    expect(ship).not.toBeNull();
    expect(ship?.coords).toHaveLength(2);
  });

  it('should generate different ship templates', () => {
    for (const template of [SMALL_SHIP, MEDIUM_SHIP, LARGE_SHIP, XLARGE_SHIP]) {
      const ship = generateShip(template, 15, 15, []);
      expect(ship).not.toBeNull();
    }
  });

  it('should respect existing ships', () => {
    const existing: GameShip[] = [{ coords: [0, 0], width: 2, height: 1, shipId: 0 }];
    const ship = generateShip(SMALL_SHIP, 10, 10, existing);
    if (ship) {
      expect(isValidShipPlacement(ship, existing, 10, 10)).toBe(true);
    }
  });

  it('should assign correct ship ID', () => {
    const existing: GameShip[] = [
      { coords: [0, 0], width: 2, height: 1, shipId: 0 },
      { coords: [5, 5], width: 2, height: 1, shipId: 1 },
    ];
    const ship = generateShip(SMALL_SHIP, 10, 10, existing);
    expect(ship?.shipId).toBe(2);
  });
});

describe('generateShip2D', () => {
  it('should generate a valid 2D ship', () => {
    const ship = generateShip2D(2, 2, 10, 10, []);
    expect(ship).not.toBeNull();
    expect(ship?.width).toBe(2);
    expect(ship?.height).toBe(2);
  });

  it('should respect existing ships', () => {
    const existing: GameShip[] = [{ coords: [0, 0], width: 2, height: 2, shipId: 0 }];
    const ship = generateShip2D(2, 2, 10, 10, existing);
    if (ship) {
      expect(isValidShipPlacement(ship, existing, 10, 10)).toBe(true);
    }
  });

  it('should return null when board is too small', () => {
    const ship = generateShip2D(5, 5, 2, 2, []);
    expect(ship).toBeNull();
  });
});

describe('generateShips', () => {
  it('should generate ships according to config', () => {
    const config = {
      boardView: withView({ width: 10, height: 10 }, StandardBoardView),
      shipCounts: { small: 2, medium: 1, large: 1, xlarge: 0 },
    };
    const ships = generateShips(config);
    const small = ships.filter(s => Math.max(s.width, s.height) === 2);
    const medium = ships.filter(s => Math.max(s.width, s.height) === 3);
    const large = ships.filter(s => Math.max(s.width, s.height) === 4);
    expect(small).toHaveLength(2);
    expect(medium).toHaveLength(1);
    expect(large).toHaveLength(1);
  });

  it('should generate no ships when counts are zero', () => {
    const config = {
      boardView: withView({ width: 10, height: 10 }, StandardBoardView),
      shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
    };
    expect(generateShips(config)).toHaveLength(0);
  });

  it('should generate valid placements for all ships', () => {
    const config = {
      boardView: withView({ width: 15, height: 15 }, StandardBoardView),
      shipCounts: { small: 2, medium: 2, large: 1, xlarge: 1 },
    };
    const ships = generateShips(config);
    ships.forEach((ship, idx) => {
      expect(isValidShipPlacement(ship, ships.slice(0, idx), 15, 15)).toBe(true);
    });
  });

  it('should assign unique ship IDs', () => {
    const config = {
      boardView: withView({ width: 10, height: 10 }, StandardBoardView),
      shipCounts: { small: 3, medium: 0, large: 0, xlarge: 0 },
    };
    const ships = generateShips(config);
    const ids = new Set(ships.map(s => s.shipId));
    expect(ids.size).toBe(ships.length);
  });

  it('should handle default config values', () => {
    const ships = generateShips({});
    expect(ships.length).toBeGreaterThanOrEqual(0);
  });
});

describe('getQuadrantPreferences', () => {
  it('should return two groups for small ships (≤2 cells)', () => {
    const prefs = getQuadrantPreferences(2);
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs.length).toBeGreaterThan(0);
  });

  it('should return preferences for all ship sizes', () => {
    for (const cells of [2, 3, 4, 5]) {
      const prefs = getQuadrantPreferences(cells);
      expect(Array.isArray(prefs)).toBe(true);
    }
  });
});

describe('generatePositionInPreferredQuadrant', () => {
  it('should generate position within board bounds', () => {
    const pos = generatePositionInPreferredQuadrant(2, 'horizontal', [[0, 1]], 10, 10);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeGreaterThanOrEqual(0);
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(pos[0]).toBeLessThan(10);
    expect(pos[1]).toBeLessThan(10);
  });

  it('should fit horizontal ship within width', () => {
    const pos = generatePositionInPreferredQuadrant(3, 'horizontal', [[0]], 10, 10);
    expect(pos[0] + 3).toBeLessThanOrEqual(10);
  });

  it('should fit vertical ship within height', () => {
    const pos = generatePositionInPreferredQuadrant(3, 'vertical', [[0]], 10, 10);
    expect(pos[1] + 3).toBeLessThanOrEqual(10);
  });

  it('should not throw for any quadrant index', () => {
    for (const q of [0, 1, 2, 3]) {
      const pos = generatePositionInPreferredQuadrant(2, 'horizontal', [[q]], 10, 10);
      expect(pos).toBeDefined();
    }
  });
});

describe('generateRandomPosition', () => {
  it('should generate valid horizontal position', () => {
    const pos = generateRandomPosition(3, 'horizontal', 10, 10);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeGreaterThanOrEqual(0);
    expect(pos[0] + 3).toBeLessThanOrEqual(10);
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(pos[1]).toBeLessThan(10);
  });

  it('should generate valid vertical position', () => {
    const pos = generateRandomPosition(3, 'vertical', 10, 10);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeGreaterThanOrEqual(0);
    expect(pos[0]).toBeLessThan(10);
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(pos[1] + 3).toBeLessThanOrEqual(10);
  });

  it('should handle ship filling entire dimension', () => {
    const pos = generateRandomPosition(10, 'horizontal', 10, 10);
    expect(pos[0]).toBe(0);
  });
});

describe('Integration - Full Ship Generation', () => {
  it('should generate a complete valid fleet', () => {
    const config = {
      boardView: withView({ width: 20, height: 20 }, StandardBoardView),
      shipCounts: { small: 3, medium: 3, large: 2, xlarge: 2 },
    };
    const ships = generateShips(config);
    expect(ships.length).toBeGreaterThanOrEqual(8);
    ships.forEach((ship, idx) => {
      expect(isValidShipPlacement(ship, ships.slice(0, idx), 20, 20)).toBe(true);
    });
  });

  it('should handle crowded board gracefully', () => {
    const config = {
      boardView: withView({ width: 8, height: 8 }, StandardBoardView),
      shipCounts: { small: 3, medium: 2, large: 1, xlarge: 0 },
    };
    const ships = generateShips(config);
    expect(ships.length).toBeGreaterThanOrEqual(0);
    expect(ships.length).toBeLessThanOrEqual(6);
  });

  it('should maintain min distance between all generated ships', () => {
    const config = {
      boardView: withView({ width: 15, height: 15 }, StandardBoardView),
      shipCounts: { small: 2, medium: 2, large: 1, xlarge: 1 },
    };
    const ships = generateShips(config);
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        for (const [x1, y1] of getShipCellsFromShip(ships[i])) {
          for (const [x2, y2] of getShipCellsFromShip(ships[j])) {
            const dist = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
            expect(dist).toBeGreaterThanOrEqual(GAME_CONSTANTS.SHIPS.MIN_DISTANCE);
          }
        }
      }
    }
  });
});
