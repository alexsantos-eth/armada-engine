import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../../engine/logic";
import { StandardBoardView, withView } from "../../constants/views";
import {
  SHOT_PATTERNS,
  getShotPattern,
  createCustomPattern,
} from "../../constants/shots";
import type { GameShip } from "../../types/entities";

// All built-in patterns as an ordered array — index is passed to executeShotPattern.
const ALL_PATTERNS = Object.values(SHOT_PATTERNS);
const idx = (id: string) => ALL_PATTERNS.findIndex((p) => p.id === id);

const SINGLE_IDX        = idx("single");
const CROSS_IDX         = idx("cross");
const LARGE_CROSS_IDX   = idx("large-cross");
const HLINE_IDX         = idx("horizontal-line");
const VLINE_IDX         = idx("vertical-line");
const SQUARE_IDX        = idx("square");
const DIAG_X_IDX        = idx("diagonal-x");
const SMALL_SQUARE_IDX  = idx("small-square");
const T_SHAPE_IDX       = idx("t-shape");
const L_SHAPE_IDX       = idx("l-shape");

describe("Shot Pattern System", () => {
  let engine: GameEngine;
  const playerShips: GameShip[] = [
    { coords: [0, 0], width: 3, height: 1 },
  ];
  const enemyShips: GameShip[] = [
    { coords: [5, 5], width: 3, height: 1 },
    { coords: [8, 2], width: 1, height: 2 },
  ];

  beforeEach(() => {
    engine = new GameEngine({ boardView: withView({ width: 10, height: 10 }, StandardBoardView, ) });
    engine.initializeGame(playerShips, enemyShips, [], [], [], [], ALL_PATTERNS, ALL_PATTERNS);
  });

  describe("Single Shot Pattern", () => {
    it("should execute a single shot", () => {
      const result = engine.executeShotPattern(5, 5, SINGLE_IDX, true);
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].x).toBe(5);
      expect(result.shots[0].y).toBe(5);
      expect(result.shots[0].hit).toBe(true);
      expect(result.shots[0].executed).toBe(true);
    });

    it("should miss when shooting at empty cell", () => {
      const result = engine.executeShotPattern(0, 5, SINGLE_IDX, true);
      
      expect(result.success).toBe(true);
      expect(result.shots[0].hit).toBe(false);
      expect(result.shots[0].executed).toBe(true);
    });
  });

  describe("Cross Shot Pattern", () => {
    it("should execute 5 shots in a cross pattern", () => {
      const result = engine.executeShotPattern(5, 5, CROSS_IDX, true);
      
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
      const result = engine.executeShotPattern(5, 5, CROSS_IDX, true);
      
      // Center should hit enemy ship at (5,5)
      const centerShot = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(centerShot?.hit).toBe(true);
      
      // Right should hit enemy ship at (6,5)
      const rightShot = result.shots.find(s => s.x === 6 && s.y === 5);
      expect(rightShot?.hit).toBe(true);
    });

    it("should handle cross pattern at board edge", () => {
      const result = engine.executeShotPattern(0, 0, CROSS_IDX, true);
      
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
      engine.executeShotPattern(5, 5, SINGLE_IDX, true);
      
      // Execute cross pattern
      const result = engine.executeShotPattern(5, 5, CROSS_IDX, true);
      
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
      const result = engine.executeShotPattern(5, 5, HLINE_IDX, true);
      
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
      const result = engine.executeShotPattern(5, 5, HLINE_IDX, true);
      
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
      
      const currentPatterns = engine.getPlayerShotPatterns();
      const customIdx = currentPatterns.length;
      engine.setPlayerShotPatterns([...currentPatterns, customPattern]);

      const result = engine.executeShotPattern(5, 5, customIdx, true);
      
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
      engine.setGameOver("player");
      
      const result = engine.executeShotPattern(5, 5, CROSS_IDX, true);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is already over");
      expect(result.shots).toHaveLength(0);
    });
  });

  describe("Shot Count", () => {
    it("should increment shot count for each executed shot in pattern", () => {
      engine.executeShotPattern(5, 5, CROSS_IDX, true);
      
      // All 5 shots in cross pattern should execute
      const executedCount = engine.getPlayerShots().length;
      expect(executedCount).toBe(5);
    });

    it("should not count out-of-bounds or already-shot cells", () => {
      // Shoot center first
      engine.executeShotPattern(0, 0, SINGLE_IDX, true);
      
      // Execute cross at corner (some will be out of bounds, one already shot)
      engine.executeShotPattern(0, 0, CROSS_IDX, true);
      
      // Only the valid, unshot cells should be added
      const playerShots = engine.getPlayerShots();
      const uniqueShots = new Set(playerShots.map(s => `${s.x},${s.y}`));
      expect(uniqueShots.size).toBe(playerShots.length);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Remaining built-in patterns
  // ─────────────────────────────────────────────────────────────────────────

  describe("Vertical Line Shot Pattern", () => {
    it("should fire 3 shots in a vertical column", () => {
      const result = engine.executeShotPattern(5, 5, VLINE_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(3);

      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      expect(positions).toContainEqual({ x: 5, y: 4 }); // Up
      expect(positions).toContainEqual({ x: 5, y: 5 }); // Center
      expect(positions).toContainEqual({ x: 5, y: 6 }); // Down

      // All shots share the same X coordinate
      expect(result.shots.every(s => s.x === 5)).toBe(true);
    });

    it("should hit ship cells in the column", () => {
      // Enemy ship at coords [5,5] width=3 → cells (5,5),(6,5),(7,5)
      // Vertical line at (5,5): fires (5,4),(5,5),(5,6)
      // Only (5,5) is a ship cell
      const result = engine.executeShotPattern(5, 5, VLINE_IDX, true);

      const centerShot = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(centerShot?.hit).toBe(true);

      const upShot = result.shots.find(s => s.x === 5 && s.y === 4);
      expect(upShot?.hit).toBe(false);
    });

    it("should skip out-of-bounds cells at the top edge", () => {
      const result = engine.executeShotPattern(5, 0, VLINE_IDX, true);

      const outOfBounds = result.shots.find(s => s.y === -1);
      expect(outOfBounds?.executed).toBe(false);

      const centerShot = result.shots.find(s => s.x === 5 && s.y === 0);
      expect(centerShot?.executed).toBe(true);
    });
  });

  describe("Large Cross Shot Pattern", () => {
    it("should fire 9 shots in an extended cross", () => {
      const result = engine.executeShotPattern(5, 5, LARGE_CROSS_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(9);
    });

    it("should include center, two lateral cells in each direction", () => {
      const result = engine.executeShotPattern(5, 5, LARGE_CROSS_IDX, true);
      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));

      expect(positions).toContainEqual({ x: 5, y: 5 }); // Center
      expect(positions).toContainEqual({ x: 3, y: 5 }); // Left-2
      expect(positions).toContainEqual({ x: 7, y: 5 }); // Right-2
      expect(positions).toContainEqual({ x: 5, y: 3 }); // Up-2
      expect(positions).toContainEqual({ x: 5, y: 7 }); // Down-2
    });

    it("should skip out-of-bounds cells near the corner", () => {
      const result = engine.executeShotPattern(1, 1, LARGE_CROSS_IDX, true);
      const oob = result.shots.filter(s => !s.executed);
      // Cells at x=-1 and y=-1 are out-of-bounds (dx=-2 or dy=-2)
      expect(oob.length).toBeGreaterThan(0);
      oob.forEach(s => {
        expect(s.x < 0 || s.x >= 10 || s.y < 0 || s.y >= 10).toBe(true);
      });
    });
  });

  describe("Square Shot Pattern", () => {
    it("should fire 9 shots covering a 3×3 block", () => {
      const result = engine.executeShotPattern(5, 5, SQUARE_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(9);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(result.shots).toContainEqual(
            expect.objectContaining({ x: 5 + dx, y: 5 + dy }),
          );
        }
      }
    });

    it("should cover and hit all cells of a 3-cell ship entirely inside the square", () => {
      // Enemy ship at [5,5] width=3 → (5,5),(6,5),(7,5)
      // Square centered at (6,5) covers all three cells
      const result = engine.executeShotPattern(6, 5, SQUARE_IDX, true);
      const hits = result.shots.filter(s => s.hit && s.executed);
      expect(hits.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Diagonal X Shot Pattern", () => {
    it("should fire 5 shots in an X shape", () => {
      const result = engine.executeShotPattern(5, 5, DIAG_X_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);

      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      expect(positions).toContainEqual({ x: 5, y: 5 }); // Center
      expect(positions).toContainEqual({ x: 4, y: 4 }); // Top-left
      expect(positions).toContainEqual({ x: 6, y: 4 }); // Top-right
      expect(positions).toContainEqual({ x: 4, y: 6 }); // Bottom-left
      expect(positions).toContainEqual({ x: 6, y: 6 }); // Bottom-right
    });

    it("should not include horizontal or vertical neighbors", () => {
      const result = engine.executeShotPattern(5, 5, DIAG_X_IDX, true);
      const positions = result.shots.map(s => `${s.x},${s.y}`);

      expect(positions).not.toContain("4,5"); // left
      expect(positions).not.toContain("6,5"); // right
      expect(positions).not.toContain("5,4"); // up
      expect(positions).not.toContain("5,6"); // down
    });
  });

  describe("Small Square Shot Pattern", () => {
    it("should fire 4 shots in a 2×2 block", () => {
      const result = engine.executeShotPattern(5, 5, SMALL_SQUARE_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(4);

      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      expect(positions).toContainEqual({ x: 5, y: 5 }); // top-left
      expect(positions).toContainEqual({ x: 6, y: 5 }); // top-right
      expect(positions).toContainEqual({ x: 5, y: 6 }); // bottom-left
      expect(positions).toContainEqual({ x: 6, y: 6 }); // bottom-right
    });

    it("should hit both cells of a 2-cell ship lying inside the square", () => {
      // Re-init with a custom enemy ship fitting the small square
      engine.initializeGame(
        playerShips,
        [{ coords: [5, 5], width: 2, height: 1 }],
        [], [], [], [], ALL_PATTERNS, ALL_PATTERNS,
      );
      const result = engine.executeShotPattern(5, 5, SMALL_SQUARE_IDX, true);
      const hits = result.shots.filter(s => s.hit && s.executed);
      expect(hits).toHaveLength(2);
    });
  });

  describe("T-Shape Shot Pattern", () => {
    it("should fire 5 shots in a T formation", () => {
      const result = engine.executeShotPattern(5, 5, T_SHAPE_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);

      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      // Horizontal bar
      expect(positions).toContainEqual({ x: 4, y: 5 });
      expect(positions).toContainEqual({ x: 5, y: 5 });
      expect(positions).toContainEqual({ x: 6, y: 5 });
      // Vertical stem
      expect(positions).toContainEqual({ x: 5, y: 6 });
      expect(positions).toContainEqual({ x: 5, y: 7 });
    });
  });

  describe("L-Shape Shot Pattern", () => {
    it("should fire 4 shots in an L formation", () => {
      const result = engine.executeShotPattern(5, 5, L_SHAPE_IDX, true);

      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(4);

      const positions = result.shots.map(s => ({ x: s.x, y: s.y }));
      // Vertical column
      expect(positions).toContainEqual({ x: 5, y: 5 });
      expect(positions).toContainEqual({ x: 5, y: 6 });
      expect(positions).toContainEqual({ x: 5, y: 7 });
      // Horizontal foot
      expect(positions).toContainEqual({ x: 6, y: 7 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Pattern metadata
  // ─────────────────────────────────────────────────────────────────────────

  describe("Pattern metadata", () => {
    it("all built-in patterns should have a non-empty id, name and description", () => {
      Object.values(SHOT_PATTERNS).forEach(pattern => {
        expect(pattern.id).toBeTruthy();
        expect(pattern.name).toBeTruthy();
        expect(pattern.description).toBeTruthy();
      });
    });

    it("all built-in pattern ids should be unique", () => {
      const ids = Object.values(SHOT_PATTERNS).map(p => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it("SHOT_PATTERNS map key should match the pattern id", () => {
      Object.entries(SHOT_PATTERNS).forEach(([key, pattern]) => {
        expect(key).toBe(pattern.id);
      });
    });

    it("each pattern should have at least one offset", () => {
      Object.values(SHOT_PATTERNS).forEach(pattern => {
        expect(pattern.offsets.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
