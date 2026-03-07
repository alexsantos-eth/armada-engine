import { describe, expect, it, beforeEach } from "vitest";
import { GameInitializer } from "../../../manager/initializer";
import type { GameConfig, BoardViewConfig } from "../../../types/config";
import { TEST_MODE } from "../../../modes/test";

// Test-specific default values (from TEST_MODE)
const TEST_DEFAULT_WIDTH = TEST_MODE.boardView.width;
const TEST_DEFAULT_HEIGHT = TEST_MODE.boardView.height;

// Helper to create board view configurations for tests
function createBoardView(overrides: Partial<BoardViewConfig>): BoardViewConfig {
  return {
    ...TEST_MODE.boardView,
    ...overrides,
  };
}

describe("GameInitializer (v3)", () => {
  describe("Constructor and Configuration", () => {
    it("should create initializer with default config", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const config = initializer.getDefaultConfig();

      // Verify config has board dimensions (values come from TEST_MODE defaults)
      expect(config.boardView.width).toBe(TEST_DEFAULT_WIDTH);
      expect(config.boardView.height).toBe(TEST_DEFAULT_HEIGHT);
    });

    it("should create initializer with custom config", () => {
      const customConfig: Partial<GameConfig> = {
        boardView: createBoardView({ width: 15, height: 12 }),
        shipCounts: { small: 2, medium: 1, large: 1, xlarge: 0 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.config.boardView?.width).toBe(15);
      expect(setup.config.boardView?.height).toBe(12);
      expect(setup.config.shipCounts?.small).toBe(2);
    });

    it("should merge custom config with defaults", () => {
      const initializer = new GameInitializer({
        boardView: createBoardView({ width: 12 }),
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.config.boardView?.width).toBe(12);
      // Height should use the default from TEST_MODE
      expect(setup.config.boardView?.height).toBe(TEST_DEFAULT_HEIGHT);
    });

    it("should allow overriding specific ship counts", () => {
      const initializer = new GameInitializer({
        boardView: createBoardView({ width: 15, height: 15 }),
        shipCounts: { small: 5, medium: 2, large: 1, xlarge: 0 },
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.config.shipCounts?.small).toBe(5);
      expect(setup.config.shipCounts?.medium).toBe(2);
      expect(setup.config.shipCounts?.large).toBe(1);
      expect(setup.config.shipCounts?.xlarge).toBe(0);
    });
  });

  describe("Configuration Validation", () => {
    it("should reject board width below minimum", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 2, height: 10 }),
        }, "random", TEST_MODE);
      }).toThrow();
    });

    it("should reject board height below minimum", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 10, height: 2 }),
        }, "random", TEST_MODE);
      }).toThrow();
    });

    it("should reject board width above maximum", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 31 }),
        }, "random", TEST_MODE);
      }).toThrow();
    });

    it("should reject board height above maximum", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 30, height: 31 }),
        }, "random", TEST_MODE);
      }).toThrow();
    });

    it("should reject too many ships for board size", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 5, height: 5 }),
          shipCounts: { small: 10, medium: 10, large: 10, xlarge: 10 },
        }, "random", TEST_MODE);
      }).toThrow(/Too many ships/);
    });

    it("should accept valid board sizes at boundaries", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 3, height: 3 }),
          shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
        }, "random", TEST_MODE);
      }).not.toThrow();

      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 30, height: 30 }),
        }, "random", TEST_MODE);
      }).not.toThrow();
    });

    it("should accept reasonable ship counts", () => {
      expect(() => {
        new GameInitializer({
          boardView: createBoardView({ width: 10, height: 10 }),
          shipCounts: { small: 2, medium: 2, large: 1, xlarge: 1 },
        }, "random", TEST_MODE);
      }).not.toThrow();
    });

    it("should handle zero ship counts", () => {
      expect(() => {
        new GameInitializer({
          shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
        }, "random", TEST_MODE);
      }).not.toThrow();
    });
  });

  describe("Game Setup Generation", () => {
    let initializer: GameInitializer;

    beforeEach(() => {
      initializer = new GameInitializer({}, "random", TEST_MODE);
    });

    it("should generate complete game setup", () => {
      const setup = initializer.getGameSetup();

      expect(setup).toHaveProperty("playerShips");
      expect(setup).toHaveProperty("enemyShips");
      expect(setup).toHaveProperty("initialTurn");
      expect(setup).toHaveProperty("config");
    });

    it("should generate ships for both players", () => {
      const setup = initializer.getGameSetup();

      expect(setup.playerShips.length).toBeGreaterThan(0);
      expect(setup.enemyShips.length).toBeGreaterThan(0);
    });

    it("should generate equal number of ships for both players", () => {
      const initializer = new GameInitializer({
        boardView: createBoardView({ width: 12, height: 12 }),
        shipCounts: { small: 2, medium: 1, large: 1, xlarge: 0 },
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.playerShips.length).toBe(setup.enemyShips.length);
    });

    it("should generate correct number of ships", () => {
      const customConfig = {
        boardView: createBoardView({ width: 10, height: 10 }),
        shipCounts: { small: 2, medium: 1, large: 1, xlarge: 1 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      const totalShips = 2 + 1 + 1 + 1;
      expect(setup.playerShips).toHaveLength(totalShips);
      expect(setup.enemyShips).toHaveLength(totalShips);
    });

    it("should generate ships with correct variants", () => {
      const customConfig = {
        boardView: createBoardView({ width: 10, height: 10 }),
        shipCounts: { small: 2, medium: 1, large: 0, xlarge: 0 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      const smallShips = setup.playerShips.filter(
        (s) => Math.max(s.width, s.height) === 2
      );
      const mediumShips = setup.playerShips.filter(
        (s) => Math.max(s.width, s.height) === 3
      );

      expect(smallShips).toHaveLength(2);
      expect(mediumShips).toHaveLength(1);
    });

    it("should generate valid ship placements", () => {
      const setup = initializer.getGameSetup();
      const boardWidth = setup.config.boardView?.width ?? TEST_DEFAULT_WIDTH;
      const boardHeight = setup.config.boardView?.height ?? TEST_DEFAULT_HEIGHT;

      setup.playerShips.forEach((ship) => {
        expect(ship.coords[0]).toBeGreaterThanOrEqual(0);
        expect(ship.coords[1]).toBeGreaterThanOrEqual(0);
        expect(ship.coords[0] + ship.width).toBeLessThanOrEqual(boardWidth);
        expect(ship.coords[1] + ship.height).toBeLessThanOrEqual(boardHeight);
      });
    });

    it("should generate non-overlapping ships", () => {
      const setup = initializer.getGameSetup();

      // Check player ships don't overlap
      for (let i = 0; i < setup.playerShips.length; i++) {
        for (let j = i + 1; j < setup.playerShips.length; j++) {
          const ship1 = setup.playerShips[i];
          const ship2 = setup.playerShips[j];

          const overlap =
            ship1.coords[0] < ship2.coords[0] + ship2.width &&
            ship1.coords[0] + ship1.width > ship2.coords[0] &&
            ship1.coords[1] < ship2.coords[1] + ship2.height &&
            ship1.coords[1] + ship1.height > ship2.coords[1];

          expect(overlap).toBe(false);
        }
      }
    });

    it("should set default initial turn to PLAYER_TURN or ENEMY_TURN", () => {
      const setup = initializer.getGameSetup();

      expect(["PLAYER_TURN", "ENEMY_TURN"]).toContain(setup.initialTurn);
    });
  });

  describe("Items Generation", () => {
    it("should generate items when configured", () => {
      const customConfig = {
        boardView: createBoardView({ width: 12, height: 12 }),
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
        itemCounts: { health_kit: 1, radar_device: 1 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.playerItems).toBeDefined();
      expect(setup.enemyItems).toBeDefined();
      expect(setup.playerItems!.length).toBeGreaterThan(0);
      expect(setup.enemyItems!.length).toBeGreaterThan(0);
    });

    it("should not generate items when not configured", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      // TEST_MODE has no items by default
      expect(setup.playerItems).toBeDefined();
      expect(setup.enemyItems).toBeDefined();
      expect(setup.playerItems!.length).toBe(0);
      expect(setup.enemyItems!.length).toBe(0);
    });

    it("should generate items in valid positions", () => {
      const customConfig = {
        boardView: createBoardView({ width: 12, height: 12 }),
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
        itemCounts: { health_kit: 2, radar_device: 1 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();
      const boardWidth = setup.config.boardView?.width ?? TEST_DEFAULT_WIDTH;
      const boardHeight = setup.config.boardView?.height ?? TEST_DEFAULT_HEIGHT;

      setup.playerItems?.forEach((item) => {
        expect(item.coords[0]).toBeGreaterThanOrEqual(0);
        expect(item.coords[1]).toBeGreaterThanOrEqual(0);
        expect(item.coords[0] + item.part).toBeLessThanOrEqual(boardWidth);
        expect(item.coords[1]).toBeLessThan(boardHeight);
      });
    });
  });

  describe("Obstacles Generation", () => {
    it("should generate obstacles when configured", () => {
      const customConfig = {
        obstacleCounts: { rock: 2, mine: 1 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.playerObstacles).toBeDefined();
      expect(setup.enemyObstacles).toBeDefined();
      expect(setup.playerObstacles!.length).toBeGreaterThan(0);
      expect(setup.enemyObstacles!.length).toBeGreaterThan(0);
    });

    it("should not generate obstacles when not configured", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      // TEST_MODE has no obstacles by default
      expect(setup.playerObstacles).toBeDefined();
      expect(setup.enemyObstacles).toBeDefined();
      expect(setup.playerObstacles!.length).toBe(0);
      expect(setup.enemyObstacles!.length).toBe(0);
    });

    it("should generate obstacles in valid positions", () => {
      const customConfig = {
        obstacleCounts: { rock: 2 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup = initializer.getGameSetup();
      const boardWidth = setup.config.boardView?.width ?? TEST_DEFAULT_WIDTH;
      const boardHeight = setup.config.boardView?.height ?? TEST_DEFAULT_HEIGHT;

      setup.playerObstacles?.forEach((obstacle) => {
        expect(obstacle.coords[0]).toBeGreaterThanOrEqual(0);
        expect(obstacle.coords[1]).toBeGreaterThanOrEqual(0);
        expect(obstacle.coords[0] + obstacle.width).toBeLessThanOrEqual(boardWidth);
        expect(obstacle.coords[1] + obstacle.height).toBeLessThanOrEqual(boardHeight);
      });
    });
  });

  describe("Shot Patterns Generation", () => {
    it("should include default shot patterns", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.playerShotPatterns).toBeDefined();
      expect(setup.enemyShotPatterns).toBeDefined();
    });

    it("should generate equal patterns for both players", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.playerShotPatterns?.length).toBe(
        setup.enemyShotPatterns?.length
      );
    });
  });

  describe("Configuration Consistency", () => {
    it("should maintain config across multiple setups", () => {
      const customConfig = {
        boardView: createBoardView({ width: 12, height: 12 }),
        shipCounts: { small: 3, medium: 2, large: 1, xlarge: 0 },
      };

      const initializer = new GameInitializer(customConfig, "random", TEST_MODE);
      const setup1 = initializer.getGameSetup();
      const setup2 = initializer.getGameSetup();

      expect(setup1.config.boardView?.width).toBe(12);
      expect(setup2.config.boardView?.width).toBe(12);
      expect(setup1.playerShips.length).toBe(setup2.playerShips.length);
    });

    it("should provide access to default config", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const defaultConfig = initializer.getDefaultConfig();

      expect(defaultConfig).toBeDefined();
      expect(defaultConfig.boardView).toBeDefined();
      expect(defaultConfig.shipCounts).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero ships configuration", () => {
      const initializer = new GameInitializer({
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.playerShips).toHaveLength(0);
      expect(setup.enemyShips).toHaveLength(0);
    });

    it("should handle maximum board size", () => {
      const initializer = new GameInitializer({
        boardView: createBoardView({ width: 30, height: 30 }),
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.config.boardView?.width).toBe(30);
      expect(setup.config.boardView?.height).toBe(30);
    });

    it("should handle minimum board size", () => {
      const initializer = new GameInitializer({
        boardView: createBoardView({ width: 3, height: 3 }),
        shipCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      expect(setup.config.boardView?.width).toBe(3);
      expect(setup.config.boardView?.height).toBe(3);
    });

    it("should handle large ship counts on large board", () => {
      const initializer = new GameInitializer({
        boardView: createBoardView({ width: 20, height: 20 }),
        shipCounts: { small: 5, medium: 4, large: 3, xlarge: 2 },
      }, "random", TEST_MODE);
      const setup = initializer.getGameSetup();

      const totalShips = 5 + 4 + 3 + 2;
      expect(setup.playerShips).toHaveLength(totalShips);
    });
  });

  describe("Randomization", () => {
    it("should generate different ship placements", () => {
      const initializer = new GameInitializer({}, "random", TEST_MODE);
      const setup1 = initializer.getGameSetup();
      const setup2 = initializer.getGameSetup();

      // At least one ship should have different position
      let hasDifference = false;
      for (let i = 0; i < setup1.playerShips.length; i++) {
        if (
          setup1.playerShips[i].coords[0] !== setup2.playerShips[i].coords[0] ||
          setup1.playerShips[i].coords[1] !== setup2.playerShips[i].coords[1]
        ) {
          hasDifference = true;
          break;
        }
      }

      expect(hasDifference).toBe(true);
    });
  });
});
