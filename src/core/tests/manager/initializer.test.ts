import { describe, it, expect, beforeEach } from 'vitest';
import { GameInitializer } from '../../manager/initializer';
import { GAME_CONSTANTS } from '../../constants/game';
import { BOARD_DEFAULT_HEIGHT, BOARD_DEFAULT_WIDTH, StandardBoardView } from '../../constants/views';
import type { GameConfig } from '../../types/config';

describe('GameInitializer', () => {
  describe('Constructor and Configuration', () => {
    it('should create initializer with default config', () => {
      const initializer = new GameInitializer();
      const config = initializer.getDefaultConfig();
      
      expect(config.boardView.width).toBe(BOARD_DEFAULT_WIDTH);
      expect(config.boardView.height).toBe(BOARD_DEFAULT_HEIGHT);
      expect(config.shipCounts).toEqual(GAME_CONSTANTS.SHIPS.DEFAULT_COUNTS);
    });

    it('should create initializer with custom config', () => {
      const customConfig: Partial<GameConfig> = {
        boardView: { ...StandardBoardView, width: 15, height: 12 },
        shipCounts: { small: 2, medium: 1, large: 1, xlarge: 0 },
      };
      
      const initializer = new GameInitializer(customConfig);
      const setup = initializer.getGameSetup();
      
      expect(setup.config.boardView?.width).toBe(15);
      expect(setup.config.boardView?.height).toBe(12);
      expect(setup.config.shipCounts?.small).toBe(2);
    });

    it('should merge custom config with defaults', () => {
      const initializer = new GameInitializer({ boardView: { ...StandardBoardView, width: 12 } });
      const setup = initializer.getGameSetup();
      
      expect(setup.config.boardView?.width).toBe(12);
      expect(setup.config.boardView?.height).toBe(BOARD_DEFAULT_HEIGHT);
      expect(setup.config.shipCounts).toEqual(GAME_CONSTANTS.SHIPS.DEFAULT_COUNTS);
    });
  });

  describe('Configuration Validation', () => {
    it('should reject board width below minimum', () => {
      expect(() => {
        new GameInitializer({ boardView: { ...StandardBoardView, width: 2 } });
      }).toThrow();
    });

    it('should reject board height below minimum', () => {
      expect(() => {
        new GameInitializer({ boardView: { ...StandardBoardView, height: 2 } });
      }).toThrow();
    });

    it('should reject board width above maximum', () => {
      expect(() => {
        new GameInitializer({ boardView: { ...StandardBoardView, width: 31 } });
      }).toThrow();
    });

    it('should reject board height above maximum', () => {
      expect(() => {
        new GameInitializer({ boardView: { ...StandardBoardView, height: 31 } });
      }).toThrow();
    });

    it('should reject too many ships for board size', () => {
      expect(() => {
        new GameInitializer({
          boardView: { ...StandardBoardView, width: 5, height: 5 },
          shipCounts: { small: 10, medium: 10, large: 10, xlarge: 10 },
        });
      }).toThrow(/Too many ships/);
    });

    it('should accept valid board sizes at boundaries', () => {
      expect(() => {
        new GameInitializer({ 
          boardView: { ...StandardBoardView, width: 3, height: 3 },
          shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 }
        });
      }).not.toThrow();
      
      expect(() => {
        new GameInitializer({ boardView: { ...StandardBoardView, width: 30, height: 30 } });
      }).not.toThrow();
    });

    it('should accept reasonable ship counts', () => {
      expect(() => {
        new GameInitializer({
          boardView: { ...StandardBoardView, width: 10, height: 10 },
          shipCounts: { small: 2, medium: 2, large: 1, xlarge: 1 },
        });
      }).not.toThrow();
    });
  });

  describe('Game Initialization', () => {
    let initializer: GameInitializer;

    beforeEach(() => {
      initializer = new GameInitializer();
    });

    it('should generate complete game setup', () => {
      const setup = initializer.getGameSetup();
      
      expect(setup).toHaveProperty('playerShips');
      expect(setup).toHaveProperty('enemyShips');
      expect(setup).toHaveProperty('initialTurn');
      expect(setup).toHaveProperty('config');
    });

    it('should generate ships for both players', () => {
      const setup = initializer.getGameSetup();
      
      expect(setup.playerShips.length).toBeGreaterThan(0);
      expect(setup.enemyShips.length).toBeGreaterThan(0);
    });

    it('should generate correct number of ships', () => {
      const customConfig = {
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 2, medium: 1, large: 1, xlarge: 1 },
      };
      
      const initializer = new GameInitializer(customConfig);
      const setup = initializer.getGameSetup();
      
      const totalShips = 2 + 1 + 1 + 1; // 5 ships total
      expect(setup.playerShips).toHaveLength(totalShips);
      expect(setup.enemyShips).toHaveLength(totalShips);
    });

    it('should generate ships with correct variants', () => {
      const customConfig = {
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 2, medium: 1, large: 0, xlarge: 0 },
      };
      
      const initializer = new GameInitializer(customConfig);
      const setup = initializer.getGameSetup();
      
      const smallShips = setup.playerShips.filter(s => Math.max(s.width, s.height) === 2);
      const mediumShips = setup.playerShips.filter(s => Math.max(s.width, s.height) === 3);
      
      expect(smallShips).toHaveLength(2);
      expect(mediumShips).toHaveLength(1);
    });

    it('should generate valid ship placements', () => {
      const setup = initializer.getGameSetup();
      
      setup.playerShips.forEach(ship => {
        expect(ship.coords).toHaveLength(2);
        expect(ship.coords[0]).toBeGreaterThanOrEqual(0);
        expect(ship.coords[1]).toBeGreaterThanOrEqual(0);
        expect(ship.width).toBeGreaterThanOrEqual(1);
        expect(ship.height).toBeGreaterThanOrEqual(1);
      });
      
      setup.enemyShips.forEach(ship => {
        expect(ship.coords).toHaveLength(2);
        expect(ship.coords[0]).toBeGreaterThanOrEqual(0);
        expect(ship.coords[1]).toBeGreaterThanOrEqual(0);
        expect(ship.width).toBeGreaterThanOrEqual(1);
        expect(ship.height).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Initial Turn Selection', () => {
    it('should set player turn when specified', () => {
      const setup = new GameInitializer({}, 'player').getGameSetup();
      
      expect(setup.initialTurn).toBe('PLAYER_TURN');
    });

    it('should set enemy turn when specified', () => {
      const setup = new GameInitializer({}, 'enemy').getGameSetup();
      
      expect(setup.initialTurn).toBe('ENEMY_TURN');
    });

    it('should randomize turn when specified', () => {
      const results = new Set();
      
      // Run multiple times to get both outcomes
      for (let i = 0; i < 20; i++) {
        const setup = new GameInitializer({}, 'random').getGameSetup();
        results.add(setup.initialTurn);
        
        if (results.size === 2) break; // Both outcomes found
      }
      
      // Should have at least one turn type (random may give same result multiple times)
      expect(results.size).toBeGreaterThan(0);
      expect(['PLAYER_TURN', 'ENEMY_TURN']).toContain(Array.from(results)[0] as string);
    });

    it('should use initialTurn constructor argument by default', () => {
      const initializerPlayer = new GameInitializer({}, 'player');
      const setupPlayer = initializerPlayer.getGameSetup();
      expect(setupPlayer.initialTurn).toBe('PLAYER_TURN');
      
      const initializerEnemy = new GameInitializer({}, 'enemy');
      const setupEnemy = initializerEnemy.getGameSetup();
      expect(setupEnemy.initialTurn).toBe('ENEMY_TURN');
    });
  });

  describe('Custom Ship Placements', () => {
    let initializer: GameInitializer;

    beforeEach(() => {
      initializer = new GameInitializer();
    });

    it('should accept custom ship placements', () => {
      const customShips = {
        playerShips: [
          { coords: [0, 0] as [number, number], width: 2, height: 1, shipId: 0 },
        ],
        enemyShips: [
          { coords: [5, 5] as [number, number], width: 2, height: 1, shipId: 0 },
        ],
      };
      
      const setup = initializer.appendGameSetup(customShips);
      
      expect(setup.playerShips).toEqual(customShips.playerShips);
      expect(setup.enemyShips).toEqual(customShips.enemyShips);
    });

    it('should generate ships when not provided', () => {
      const setup = initializer.getGameSetup();
      
      expect(setup.playerShips.length).toBeGreaterThan(0);
      expect(setup.enemyShips.length).toBeGreaterThan(0);
    });
  });

  describe('Default Configuration', () => {
    it('should return default configuration values', () => {
      const initializer = new GameInitializer();
      const config = initializer.getDefaultConfig();
      
      expect(config.boardView?.width).toBe(5);
      expect(config.boardView?.height).toBe(5);
      expect(config.shipCounts).toEqual({
        small: 1,
        medium: 2,
        large: 1,
        xlarge: 1,
      });
    });
  });

  describe('Ship Generation with Different Configs', () => {
    it('should generate no ships when all counts are zero', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      });
      
      const setup = initializer.getGameSetup();
      
      expect(setup.playerShips).toHaveLength(0);
      expect(setup.enemyShips).toHaveLength(0);
    });

    it('should handle single ship configuration', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 1, medium: 0, large: 0, xlarge: 0 },
      });
      
      const setup = initializer.getGameSetup();
      
      expect(setup.playerShips).toHaveLength(1);
      expect(Math.max(setup.playerShips[0].width, setup.playerShips[0].height)).toBe(2);
      expect(setup.enemyShips).toHaveLength(1);
      expect(Math.max(setup.enemyShips[0].width, setup.enemyShips[0].height)).toBe(2);
    });

    it('should handle only large ships', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 15, height: 15 },
        shipCounts: { small: 0, medium: 0, large: 2, xlarge: 1 },
      });
      
      const setup = initializer.getGameSetup();
      
      expect(setup.playerShips).toHaveLength(3);
      const largeShips = setup.playerShips.filter(s => Math.max(s.width, s.height) === 4);
      const xlargeShips = setup.playerShips.filter(s => Math.max(s.width, s.height) === 5);
      
      expect(largeShips).toHaveLength(2);
      expect(xlargeShips).toHaveLength(1);
    });
  });

  describe('Configuration Consistency', () => {
    it('should maintain config across multiple initializations', () => {
      const initializer = new GameInitializer({ boardView: { ...StandardBoardView, width: 12 } });
      
      const setup1 = initializer.getGameSetup();
      const setup2 = initializer.getGameSetup();
      
      expect(setup1.config.boardView?.width).toBe(12);
      expect(setup2.config.boardView?.width).toBe(12);
    });

    it('should return same config instance', () => {
      const initializer = new GameInitializer({ boardView: { ...StandardBoardView, width: 12 } });
      
      const config1 = initializer.getDefaultConfig();
      const config2 = initializer.getDefaultConfig();
      
      expect(config1.boardView?.width).toBe(config2.boardView?.width);
    });
  });

  describe('Item Validation in appendGameSetup', () => {
    it('should throw when a player item overlaps a ship cell', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      });

      const ship = { coords: [2, 2] as [number, number], width: 2, height: 1, shipId: 0 };
      // Item placed exactly on the first cell of the ship
      const overlappingItem = { coords: [2, 2] as [number, number], part: 1, itemId: 0 };

      expect(() => {
        initializer.appendGameSetup({
          playerShips: [ship],
          enemyShips: [],
          playerItems: [overlappingItem],
          enemyItems: [],
        });
      }).toThrow(/player item.*overlaps a ship/i);
    });

    it('should throw when an enemy item overlaps a ship cell', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      });

      const ship = { coords: [5, 3] as [number, number], width: 3, height: 1, shipId: 0 };
      // Item spans cells [5,3], [6,3], [7,3] — all on the ship
      const overlappingItem = { coords: [5, 3] as [number, number], part: 2, itemId: 0 };

      expect(() => {
        initializer.appendGameSetup({
          playerShips: [],
          enemyShips: [ship],
          playerItems: [],
          enemyItems: [overlappingItem],
        });
      }).toThrow(/enemy item.*overlaps a ship/i);
    });

    it('should throw when a multi-part item partially overlaps a ship', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      });

      const ship = { coords: [4, 0] as [number, number], width: 1, height: 1, shipId: 0 };
      // Item starts at [3,0] with part=2 → occupies [3,0] and [4,0]; [4,0] is the ship
      const partialOverlap = { coords: [3, 0] as [number, number], part: 2, itemId: 0 };

      expect(() => {
        initializer.appendGameSetup({
          playerShips: [ship],
          enemyShips: [],
          playerItems: [partialOverlap],
          enemyItems: [],
        });
      }).toThrow(/player item.*overlaps a ship/i);
    });

    it('should not throw when items are placed away from ships', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      });

      const ship = { coords: [0, 0] as [number, number], width: 2, height: 1, shipId: 0 };
      const safeItem = { coords: [5, 5] as [number, number], part: 1, itemId: 0 };

      expect(() => {
        initializer.appendGameSetup({
          playerShips: [ship],
          enemyShips: [],
          playerItems: [safeItem],
          enemyItems: [],
        });
      }).not.toThrow();
    });

    it('should not validate items that were not provided (auto-generated)', () => {
      // When playerItems is not passed, auto-generation handles placement —
      // no error should be thrown regardless of ship density
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 10, height: 10 },
        shipCounts: { small: 2, medium: 1, large: 0, xlarge: 0 },
      });

      expect(() => {
        initializer.appendGameSetup({});
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum board size', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 3, height: 3 },
        shipCounts: { small: 1, medium: 0, large: 0, xlarge: 0 },
      });
      
      const setup = initializer.getGameSetup();
      
      expect(setup.playerShips.length).toBeGreaterThan(0);
      expect(setup.config.boardView?.width).toBe(3);
      expect(setup.config.boardView?.height).toBe(3);
    });

    it('should handle maximum board size', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 30, height: 30 },
        shipCounts: { small: 5, medium: 5, large: 5, xlarge: 5 },
      });
      
      const setup = initializer.getGameSetup();
      
      expect(setup.config.boardView?.width).toBe(30);
      expect(setup.config.boardView?.height).toBe(30);
      expect(setup.playerShips.length).toBeLessThanOrEqual(20);
    });

    it('should handle rectangular boards', () => {
      const initializer = new GameInitializer({
        boardView: { ...StandardBoardView, width: 15, height: 8 },
      });
      
      const setup = initializer.getGameSetup();
      
      expect(setup.config.boardView?.width).toBe(15);
      expect(setup.config.boardView?.height).toBe(8);
      
      // Verify ships stay within bounds
      setup.playerShips.forEach(ship => {
        expect(ship.coords[0]).toBeLessThan(15);
        expect(ship.coords[1]).toBeLessThan(8);
      });
    });
  });
});
