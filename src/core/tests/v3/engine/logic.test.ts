import { describe, expect, it, beforeEach } from "vitest";
import { GameEngine } from "../../../engine/logic";
import type { GameShip, GameItem, GameObstacle } from "../../../types/entities";
import type { Shot, ShotPattern } from "../../../types/shots";
import type { BoardViewConfig } from "../../../types/config";

describe("Logic (v3)", () => {
  let engine: GameEngine;
  let playerShips: GameShip[];
  let enemyShips: GameShip[];

  // Test-specific board configuration
  const testBoardView: BoardViewConfig = {
    id: "test-board",
    title: "TestBoard",
    description: "Test board configuration",
    width: 10,
    height: 10,
    playerSide: ["playerShips", "enemyShots"],
    enemySide: ["enemyObstacles", "playerShots", "collectedItems"],
  };

  beforeEach(() => {
    engine = new GameEngine({
      boardView: testBoardView,
    });

    playerShips = [
      { coords: [0, 0], width: 2, height: 1, shipId: 0 },
      { coords: [2, 2], width: 1, height: 3, shipId: 1 },
    ];

    enemyShips = [
      { coords: [5, 5], width: 2, height: 1, shipId: 0 },
      { coords: [7, 7], width: 1, height: 3, shipId: 1 },
    ];
  });

  describe("GameEngine Initialization", () => {
    it("should start with default values", () => {
      const state = engine.getState();

      expect(state.isGameOver).toBe(false);
      expect(state.winner).toBe(null);
      expect(state.playerShips).toHaveLength(0);
      expect(state.enemyShips).toHaveLength(0);
      expect(state.shotCount).toBe(0);
    });

    it("should initialize game with ships", () => {
      engine.initializeGame(playerShips, enemyShips);

      const state = engine.getState();
      expect(state.playerShips).toHaveLength(2);
      expect(state.enemyShips).toHaveLength(2);
      expect(state.shotCount).toBe(0);
    });

    it("should set correct board dimensions from config", () => {
      const dimensions = engine.getBoardDimensions();

      expect(dimensions.width).toBe(10);
      expect(dimensions.height).toBe(10);
    });

    it("should allow changing board dimensions", () => {
      engine.setBoardDimensions(15, 12);

      const dimensions = engine.getBoardDimensions();
      expect(dimensions.width).toBe(15);
      expect(dimensions.height).toBe(12);
    });
  });

  describe("Shot Execution", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should execute a successful hit", () => {
      const result = engine.executeShotPattern(5, 5, 0, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].hit).toBe(true);
      expect(result.shots[0].shipId).toBe(0);
      expect(result.shots[0].x).toBe(5);
      expect(result.shots[0].y).toBe(5);
    });

    it("should execute a miss", () => {
      const result = engine.executeShotPattern(0, 9, 0, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].hit).toBe(false);
      expect(result.shots[0].shipId).toBeUndefined();
    });

    it("should reject duplicate shots", () => {
      engine.executeShotPattern(5, 5, 0, true);

      const result = engine.executeShotPattern(5, 5, 0, true);

      expect(result.shots[0].executed).toBe(false);
    });

    it("should reject out-of-bounds shots", () => {
      const result = engine.executeShotPattern(15, 15, 0, true);

      expect(result.shots[0].executed).toBe(false);
    });

    it("should increment shot count", () => {
      expect(engine.getShotCount()).toBe(0);

      engine.executeShotPattern(5, 5, 0, true);
      expect(engine.getShotCount()).toBe(1);

      engine.executeShotPattern(0, 0, 0, false);
      expect(engine.getShotCount()).toBe(2);
    });

    it("should track shots for both players independently", () => {
      engine.executeShotPattern(5, 5, 0, true); // Player shot
      engine.executeShotPattern(0, 0, 0, false); // Enemy shot

      expect(engine.getPlayerShots()).toHaveLength(1);
      expect(engine.getEnemyShots()).toHaveLength(1);
    });
  });

  describe("Shot Patterns", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should execute single-shot pattern (default)", () => {
      const result = engine.executeShotPattern(5, 5, 0, true);

      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].x).toBe(5);
      expect(result.shots[0].y).toBe(5);
    });

    it("should execute multi-shot pattern", () => {
      const customPattern: ShotPattern = {
        id: "cross-pattern",
        title: "Cross Pattern",
        description: "Shoots in a cross",
        offsets: [
          { dx: 0, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ],
      };

      engine.setPlayerShotPatterns([customPattern]);
      const result = engine.executeShotPattern(5, 5, 0, true);

      expect(result.shots).toHaveLength(5);
      expect(result.shots.filter((s) => s.executed).length).toBeGreaterThan(0);
    });

    it("should skip out-of-bounds cells in patterns", () => {
      const customPattern: ShotPattern = {
        id: "corner-pattern",
        title: "Corner Pattern",
        description: "Shoots corners",
        offsets: [
          { dx: 0, dy: 0 },
          { dx: -1, dy: -1 }, // Out of bounds
          { dx: 10, dy: 10 }, // Out of bounds
        ],
      };

      engine.setPlayerShotPatterns([customPattern]);
      const result = engine.executeShotPattern(0, 0, 0, true);

      expect(result.shots).toHaveLength(3);
      expect(result.shots.filter((s) => s.executed).length).toBe(1); // Only [0,0] executed
      expect(result.shots.filter((s) => !s.executed).length).toBe(2);
    });

    it("should skip duplicate cells in patterns", () => {
      engine.executeShotPattern(5, 5, 0, true); // Shoot first

      const customPattern: ShotPattern = {
        id: "repeat-pattern",
        title: "Repeat Pattern",
        description: "Tries to shoot same cell",
        offsets: [
          { dx: 0, dy: 0 },
          { dx: 1, dy: 0 },
        ],
      };

      engine.setPlayerShotPatterns([customPattern]);
      const result = engine.executeShotPattern(5, 5, 0, true);

      expect(result.shots).toHaveLength(2);
      expect(result.shots[0].executed).toBe(false); // Already shot
      expect(result.shots[1].executed).toBe(true); // New cell
    });
  });

  describe("Ship Destruction", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should detect when a ship is destroyed", () => {
      // Enemy ship 0 at [5,5], size 2x1
      expect(engine.isShipDestroyed(0, true)).toBe(false);

      engine.executeShotPattern(5, 5, 0, true);
      expect(engine.isShipDestroyed(0, true)).toBe(false);

      engine.executeShotPattern(6, 5, 0, true);
      expect(engine.isShipDestroyed(0, true)).toBe(true);
    });

    it("should track destruction status for multiple ships", () => {
      // Destroy enemy ship 0
      engine.executeShotPattern(5, 5, 0, true);
      engine.executeShotPattern(6, 5, 0, true);

      // Destroy enemy ship 1
      engine.executeShotPattern(7, 7, 0, true);
      engine.executeShotPattern(7, 8, 0, true);
      engine.executeShotPattern(7, 9, 0, true);

      expect(engine.isShipDestroyed(0, true)).toBe(true);
      expect(engine.isShipDestroyed(1, true)).toBe(true);
    });

    it("should mark destroying shot correctly", () => {
      engine.executeShotPattern(5, 5, 0, true);

      const result = engine.executeShotPattern(6, 5, 0, true);

      expect(result.shots[0].shipDestroyed).toBe(true);
    });

    it("should detect when all ships are destroyed", () => {
      const state = engine.getState();
      expect(state.areAllEnemyShipsDestroyed).toBe(false);

      // Destroy all enemy ships
      engine.executeShotPattern(5, 5, 0, true);
      engine.executeShotPattern(6, 5, 0, true);
      engine.executeShotPattern(7, 7, 0, true);
      engine.executeShotPattern(7, 8, 0, true);
      engine.executeShotPattern(7, 9, 0, true);

      const finalState = engine.getState();
      expect(finalState.areAllEnemyShipsDestroyed).toBe(true);
      expect(finalState.areAllPlayerShipsDestroyed).toBe(false);
    });

    it("should use areAllShipsDestroyed helper method", () => {
      // Destroy all enemy ships
      engine.executeShotPattern(5, 5, 0, true);
      engine.executeShotPattern(6, 5, 0, true);
      engine.executeShotPattern(7, 7, 0, true);
      engine.executeShotPattern(7, 8, 0, true);
      engine.executeShotPattern(7, 9, 0, true);

      expect(engine.areAllShipsDestroyed(false)).toBe(true); // enemy ships
      expect(engine.areAllShipsDestroyed(true)).toBe(false); // player ships
    });
  });

  describe("Game Over", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should set game over state", () => {
      expect(engine.getState().isGameOver).toBe(false);

      engine.setGameOver("player");

      expect(engine.getState().isGameOver).toBe(true);
      expect(engine.getWinner()).toBe("player");
    });

    it("should allow setting different winners", () => {
      engine.setGameOver("enemy");

      expect(engine.getWinner()).toBe("enemy");
    });

    it("should allow draw/tie outcome", () => {
      engine.setGameOver(null);

      expect(engine.getWinner()).toBe(null);
    });
  });

  describe("Items", () => {
    let playerItems: GameItem[];
    let enemyItems: GameItem[];

    beforeEach(() => {
      playerItems = [
        { coords: [1, 1], part: 1 },
        { coords: [3, 3], part: 2 },
      ];

      enemyItems = [
        { coords: [6, 6], part: 1 },
        { coords: [8, 8], part: 2 },
      ];

      engine.initializeGame(playerShips, enemyShips, playerItems, enemyItems);
    });

    it("should detect item collection", () => {
      const result = engine.executeShotPattern(6, 6, 0, true);

      expect(result.shots[0].collected).toBe(true);
      expect(result.shots[0].itemId).toBe(0);
      expect(result.shots[0].itemFullyCollected).toBe(true);
    });

    it("should handle multi-part item collection", () => {
      const r1 = engine.executeShotPattern(8, 8, 0, true);
      expect(r1.shots[0].collected).toBe(true);
      expect(r1.shots[0].itemFullyCollected).toBe(false);

      const r2 = engine.executeShotPattern(9, 8, 0, true);
      expect(r2.shots[0].collected).toBe(true);
      expect(r2.shots[0].itemFullyCollected).toBe(true);
    });

    it("should track collected items", () => {
      engine.executeShotPattern(6, 6, 0, true);

      const state = engine.getState();
      expect(state.playerCollectedItems).toContain(0);
    });

    it("should mark items as used", () => {
      expect(engine.isItemUsed(0, true)).toBe(false);

      engine.markItemUsed(0, true);

      expect(engine.isItemUsed(0, true)).toBe(true);
    });

    it("should store used items with optional shipId", () => {
      engine.markItemUsed(0, true, 5);

      const state = engine.getState();
      expect(state.playerUsedItems).toContainEqual({ itemId: 0, shipId: 5 });
    });

    it("should track used items independently per side", () => {
      engine.markItemUsed(0, true);
      engine.markItemUsed(1, false);

      expect(engine.isItemUsed(0, true)).toBe(true);
      expect(engine.isItemUsed(1, false)).toBe(true);
      expect(engine.isItemUsed(0, false)).toBe(false);
      expect(engine.isItemUsed(1, true)).toBe(false);
    });
  });

  describe("Obstacles", () => {
    let playerObstacles: GameObstacle[];
    let enemyObstacles: GameObstacle[];

    beforeEach(() => {
      playerObstacles = [
        { coords: [1, 1], width: 1, height: 1, obstacleId: 0 },
      ];

      enemyObstacles = [
        { coords: [6, 6], width: 2, height: 2, obstacleId: 0 },
      ];

      engine.initializeGame(
        playerShips,
        enemyShips,
        [],
        [],
        playerObstacles,
        enemyObstacles
      );
    });

    it("should include obstacles in state", () => {
      const state = engine.getState();

      expect(state.playerObstacles).toHaveLength(1);
      expect(state.enemyObstacles).toHaveLength(1);
    });

    it("should allow setting obstacles after initialization", () => {
      const newObstacles: GameObstacle[] = [
        { coords: [2, 2], width: 1, height: 1, obstacleId: 1 },
      ];

      engine.setPlayerObstacles(newObstacles);

      const state = engine.getState();
      expect(state.playerObstacles).toHaveLength(1);
      expect(state.playerObstacles[0].coords).toEqual([2, 2]);
    });
  });

  describe("Position Queries", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should detect ship at position", () => {
      expect(engine.hasShipAtPosition(0, 0, true)).toBe(true);
      expect(engine.hasShipAtPosition(1, 0, true)).toBe(true);
      expect(engine.hasShipAtPosition(5, 5, false)).toBe(true);
    });

    it("should return false for empty positions", () => {
      expect(engine.hasShipAtPosition(9, 9, true)).toBe(false);
      expect(engine.hasShipAtPosition(9, 9, false)).toBe(false);
    });

    it("should check if cell has been shot", () => {
      expect(engine.isCellShot(5, 5, true)).toBe(false);

      engine.executeShotPattern(5, 5, 0, true);

      expect(engine.isCellShot(5, 5, true)).toBe(true);
      expect(engine.isCellShot(5, 5, false)).toBe(false);
    });

    it("should get shot at position", () => {
      engine.executeShotPattern(5, 5, 0, true);

      const shot = engine.getShotAtPosition(5, 5, true);
      expect(shot).toBeDefined();
      expect(shot?.x).toBe(5);
      expect(shot?.y).toBe(5);
    });

    it("should return undefined for positions without shots", () => {
      const shot = engine.getShotAtPosition(9, 9, true);
      expect(shot).toBeUndefined();
    });

    it("should validate positions", () => {
      expect(engine.isValidPosition(0, 0)).toBe(true);
      expect(engine.isValidPosition(9, 9)).toBe(true);
      expect(engine.isValidPosition(-1, 0)).toBe(false);
      expect(engine.isValidPosition(10, 0)).toBe(false);
    });
  });

  describe("State Management", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should return complete game state", () => {
      const state = engine.getState();

      expect(state).toHaveProperty("playerShips");
      expect(state).toHaveProperty("enemyShips");
      expect(state).toHaveProperty("playerShots");
      expect(state).toHaveProperty("enemyShots");
      expect(state).toHaveProperty("isGameOver");
      expect(state).toHaveProperty("winner");
      expect(state).toHaveProperty("boardWidth");
      expect(state).toHaveProperty("boardHeight");
      expect(state).toHaveProperty("shotCount");
    });

    it("should increment version on mutations", () => {
      const v0 = engine.getVersion();

      engine.executeShotPattern(5, 5, 0, true);
      const v1 = engine.getVersion();

      expect(v1).toBeGreaterThan(v0);
    });

    it("should reset game state", () => {
      engine.executeShotPattern(5, 5, 0, true);
      engine.resetGame();

      const state = engine.getState();
      expect(state.playerShots).toHaveLength(0);
      expect(state.enemyShots).toHaveLength(0);
      expect(state.shotCount).toBe(0);
      expect(state.isGameOver).toBe(false);
    });

    it("should return copied arrays for ships", () => {
      const ships1 = engine.getPlayerShips();
      const ships2 = engine.getPlayerShips();

      expect(ships1).toEqual(ships2);
      expect(ships1).not.toBe(ships2); // Different references
    });

    it("should return copied arrays for shots", () => {
      engine.executeShotPattern(5, 5, 0, true);

      const shots1 = engine.getPlayerShots();
      const shots2 = engine.getPlayerShots();

      expect(shots1).toEqual(shots2);
      expect(shots1).not.toBe(shots2);
    });
  });

  describe("Shot History Manipulation", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should allow setting player shots directly", () => {
      const shots: Shot[] = [
        { x: 5, y: 5, hit: true, shipId: 0 },
        { x: 6, y: 5, hit: true, shipId: 0 },
      ];

      engine.setPlayerShots(shots);

      const playerShots = engine.getPlayerShots();
      expect(playerShots).toHaveLength(2);
      expect(engine.isCellShot(5, 5, true)).toBe(true);
    });

    it("should allow setting enemy shots directly", () => {
      const shots: Shot[] = [
        { x: 0, y: 0, hit: true, shipId: 0 },
        { x: 1, y: 0, hit: true, shipId: 0 },
      ];

      engine.setEnemyShots(shots);

      const enemyShots = engine.getEnemyShots();
      expect(enemyShots).toHaveLength(2);
      expect(engine.isCellShot(0, 0, false)).toBe(true);
    });

    it("should update ship destruction state when setting shots", () => {
      const shots: Shot[] = [
        { x: 5, y: 5, hit: true, shipId: 0 },
        { x: 6, y: 5, hit: true, shipId: 0 },
      ];

      engine.setPlayerShots(shots);

      expect(engine.isShipDestroyed(0, true)).toBe(true);
    });

    it("should preserve ship hit tracking when clearing opponent shots", () => {
      // Player destroys all enemy ships
      engine.executeShotPattern(5, 5, 0, true);
      engine.executeShotPattern(6, 5, 0, true);
      engine.executeShotPattern(7, 7, 0, true);
      engine.executeShotPattern(7, 8, 0, true);
      engine.executeShotPattern(7, 9, 0, true);

      expect(engine.getState().areAllEnemyShipsDestroyed).toBe(true);

      // Clear enemy shots (simulating EMP grenade)
      engine.setEnemyShots([]);

      // Player's progress should remain
      expect(engine.getState().areAllEnemyShipsDestroyed).toBe(true);
    });
  });

  describe("Custom Shot Patterns", () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it("should support setting custom shot patterns", () => {
      const customPattern: ShotPattern = {
        id: "test-pattern",
        title: "Test Pattern",
        description: "Test pattern for v3",
        offsets: [
          { dx: 0, dy: 0 },
          { dx: 1, dy: 0 },
        ],
      };

      engine.setPlayerShotPatterns([customPattern]);

      const state = engine.getState();
      expect(state.playerShotPatterns).toHaveLength(1);
      expect(state.playerShotPatterns[0].title).toBe("Test Pattern");
    });

    it("should execute custom patterns after setting them", () => {
      const customPattern: ShotPattern = {
        id: "diagonal-pattern",
        title: "Diagonal Pattern",
        description: "Shoots diagonally",
        offsets: [
          { dx: 0, dy: 0 },
          { dx: 1, dy: 1 },
          { dx: 2, dy: 2 },
        ],
      };

      engine.setPlayerShotPatterns([customPattern]);

      const result = engine.executeShotPattern(5, 5, 0, true);

      expect(result.success).toBe(true);
      expect(result.shots.length).toBeGreaterThan(0);
    });
  });

  describe("Version Control", () => {
    it("should increment version on all mutations", () => {
      const eng = new GameEngine({
        boardView: testBoardView,
      });

      const v0 = eng.getVersion();

      eng.initializeGame(playerShips, enemyShips);
      expect(eng.getVersion()).toBeGreaterThan(v0);

      const v1 = eng.getVersion();
      eng.executeShotPattern(5, 5, 0, true);
      expect(eng.getVersion()).toBeGreaterThan(v1);

      const v2 = eng.getVersion();
      eng.setGameOver("player");
      expect(eng.getVersion()).toBeGreaterThan(v2);

      const v3 = eng.getVersion();
      eng.resetGame();
      expect(eng.getVersion()).toBeGreaterThan(v3);
    });
  });
});
