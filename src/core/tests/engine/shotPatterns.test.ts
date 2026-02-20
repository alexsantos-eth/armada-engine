import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../../engine/logic";
import { CROSS_SHOT, HORIZONTAL_LINE_SHOT, SINGLE_SHOT, getShotPattern, createCustomPattern } from "../../constants/shotPatterns";
import type { GameShip } from "../../types/common";

describe("Shot Pattern System", () => {
  let engine: GameEngine;
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "medium", orientation: "horizontal" },
    { coords: [8, 2], variant: "small", orientation: "vertical" },
  ];

  beforeEach(() => {
    engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
    engine.initializeGame(playerShips, enemyShips, "PLAYER_TURN");
  });

  describe("Single Shot Pattern", () => {
    it("should execute a single shot", () => {
      const result = engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].x).toBe(5);
      expect(result.shots[0].y).toBe(5);
      expect(result.shots[0].hit).toBe(true);
      expect(result.shots[0].executed).toBe(true);
    });

    it("should miss when shooting at empty cell", () => {
      const result = engine.executeShotPattern(0, 5, SINGLE_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots[0].hit).toBe(false);
      expect(result.shots[0].executed).toBe(true);
    });
  });

  describe("Cross Shot Pattern", () => {
    it("should execute 5 shots in a cross pattern", () => {
      const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);
      
      // Verify all 5 positions
      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      expect(positions).toContainEqual({ x: 5, y: 5 }); // Center
      expect(positions).toContainEqual({ x: 4, y: 5 }); // Left
      expect(positions).toContainEqual({ x: 6, y: 5 }); // Right
      expect(positions).toContainEqual({ x: 5, y: 4 }); // Up
      expect(positions).toContainEqual({ x: 5, y: 6 }); // Down
    });

    it("should hit ships at multiple positions in the cross", () => {
      const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
      
      // Center should hit enemy ship at (5,5)
      const centerShot = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(centerShot?.hit).toBe(true);
      
      // Right should hit enemy ship at (6,5)
      const rightShot = result.shots.find(s => s.x === 6 && s.y === 5);
      expect(rightShot?.hit).toBe(true);
    });

    it("should handle cross pattern at board edge", () => {
      const result = engine.executeShotPattern(0, 0, CROSS_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);
      
      // Check that out-of-bounds shots are marked as not executed
      const leftShot = result.shots.find(s => s.x === -1 && s.y === 0);
      expect(leftShot?.executed).toBe(false);
      
      const upShot = result.shots.find(s => s.x === 0 && s.y === -1);
      expect(upShot?.executed).toBe(false);
      
      // Center should still execute
      const centerShot = result.shots.find(s => s.x === 0 && s.y === 0);
      expect(centerShot?.executed).toBe(true);
    });

    it("should not re-shoot already shot cells", () => {
      // First shot at center
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      
      // Execute cross pattern
      const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
      
      expect(result.success).toBe(true);
      const centerShot = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(centerShot?.executed).toBe(false); // Already shot
      
      // But other positions should execute
      const rightShot = result.shots.find(s => s.x === 6 && s.y === 5);
      expect(rightShot?.executed).toBe(true);
    });
  });

  describe("Horizontal Line Shot Pattern", () => {
    it("should execute 3 shots in a horizontal line", () => {
      const result = engine.executeShotPattern(5, 5, HORIZONTAL_LINE_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(3);
      
      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      expect(positions).toContainEqual({ x: 4, y: 5 }); // Left
      expect(positions).toContainEqual({ x: 5, y: 5 }); // Center
      expect(positions).toContainEqual({ x: 6, y: 5 }); // Right
      
      // All should have same Y coordinate
      expect(result.shots.every(s => s.y === 5)).toBe(true);
    });

    it("should hit consecutive ship cells", () => {
      const result = engine.executeShotPattern(5, 5, HORIZONTAL_LINE_SHOT, true);
      
      // Ship spans (5,5), (6,5), (7,5)
      const shotAt5 = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(shotAt5?.hit).toBe(true);
      
      const shotAt6 = result.shots.find(s => s.x === 6 && s.y === 5);
      expect(shotAt6?.hit).toBe(true);
      
      const shotAt4 = result.shots.find(s => s.x === 4 && s.y === 5);
      expect(shotAt4?.hit).toBe(false); // No ship here
    });
  });

  describe("Custom Shot Patterns", () => {
    it("should create and execute a custom pattern", () => {
      const customPattern = createCustomPattern(
        "triangle",
        "Triangle Shot",
        [
          { dx: 0, dy: 0 },
          { dx: -1, dy: 1 },
          { dx: 1, dy: 1 },
        ],
        "Fires in a triangle shape"
      );
      
      const result = engine.executeShotPattern(5, 5, customPattern, true);
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(3);
      
      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      expect(positions).toContainEqual({ x: 5, y: 5 });
      expect(positions).toContainEqual({ x: 4, y: 6 });
      expect(positions).toContainEqual({ x: 6, y: 6 });
    });
  });

  describe("Get Shot Pattern", () => {
    it("should retrieve pattern by ID", () => {
      const pattern = getShotPattern("cross");
      expect(pattern.id).toBe("cross");
      expect(pattern.offsets).toHaveLength(5);
    });

    it("should return single shot for unknown ID", () => {
      const pattern = getShotPattern("unknown-pattern");
      expect(pattern.id).toBe("single");
      expect(pattern.offsets).toHaveLength(1);
    });
  });

  describe("Game Over Detection", () => {
    it("should not execute pattern when game is already over", () => {
      const internal = engine.getInternalAPI();
      internal.setGameOver("player");
      
      const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is already over");
      expect(result.shots).toHaveLength(0);
    });
  });

  describe("Shot Count", () => {
    it("should increment shot count for each executed shot in pattern", () => {
      engine.executeShotPattern(5, 5, CROSS_SHOT, true);
      
      // All 5 shots in cross pattern should execute
      const executedCount = engine.getPlayerShots().length;
      expect(executedCount).toBe(5);
    });

    it("should not count out-of-bounds or already-shot cells", () => {
      // Shoot center first
      engine.executeShotPattern(0, 0, SINGLE_SHOT, true);
      
      // Execute cross at corner (some will be out of bounds, one already shot)
      engine.executeShotPattern(0, 0, CROSS_SHOT, true);
      
      // Only the valid, unshot cells should be added
      const playerShots = engine.getPlayerShots();
      const uniqueShots = new Set(playerShots.map(s => `${s.x},${s.y}`));
      expect(uniqueShots.size).toBe(playerShots.length);
    });
  });
});
