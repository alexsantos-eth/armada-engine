import { describe, it, expect, beforeEach } from "vitest";
import { Match } from "../../engine/match";
import { CROSS_SHOT, HORIZONTAL_LINE_SHOT, SINGLE_SHOT } from "../../constants/shotPatterns";
import type { GameShip } from "../../types/common";

describe("Match Shot Patterns", () => {
  let match: Match;
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "medium", orientation: "horizontal" },
    { coords: [8, 2], variant: "small", orientation: "vertical" },
  ];

  beforeEach(() => {
    match = new Match({ boardWidth: 10, boardHeight: 10 });
    match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");
  });

  describe("planShot and confirmAttack flow", () => {
    it("should plan a shot with a pattern", () => {
      const planResult = match.planShot(5, 5, CROSS_SHOT, true);
      
      expect(planResult.phase).toBe("PLAN");
      expect(planResult.ready).toBe(true);
      expect(planResult.pattern).toBe(CROSS_SHOT);
      expect(planResult.centerX).toBe(5);
      expect(planResult.centerY).toBe(5);
      expect(match.getPhase()).toBe("PLAN");
    });

    it("should store pending plan", () => {
      match.planShot(5, 5, CROSS_SHOT, true);
      
      const pendingPlan = match.getPendingPlan();
      expect(pendingPlan).toBeDefined();
      expect(pendingPlan?.centerX).toBe(5);
      expect(pendingPlan?.centerY).toBe(5);
      expect(pendingPlan?.pattern).toBe(CROSS_SHOT);
      expect(pendingPlan?.isPlayerShot).toBe(true);
    });

    it("should execute planned attack", () => {
      match.planShot(5, 5, CROSS_SHOT, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);
      expect(result.phase).toBe("TURN");
    });

    it("should clear pending plan after confirmation", () => {
      match.planShot(5, 5, CROSS_SHOT, true);
      match.confirmAttack();
      
      const pendingPlan = match.getPendingPlan();
      expect(pendingPlan).toBeNull();
    });

    it("should fail to confirm attack without planning first", () => {
      const result = match.confirmAttack();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("No attack planned");
      expect(result.shots).toHaveLength(0);
    });

    it("should cancel pending plan", () => {
      match.planShot(5, 5, CROSS_SHOT, true);
      expect(match.getPendingPlan()).not.toBeNull();
      
      match.cancelPlan();
      
      expect(match.getPendingPlan()).toBeNull();
      expect(match.getPhase()).toBe("IDLE");
    });

    it("should reject invalid position in plan", () => {
      const result = match.planShot(-1, 5, CROSS_SHOT, true);
      
      expect(result.ready).toBe(false);
      expect(result.error).toBe("Invalid position");
    });
  });

  describe("Pattern execution with different patterns", () => {
    it("should execute SINGLE_SHOT pattern", () => {
      match.planShot(5, 5, SINGLE_SHOT, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].x).toBe(5);
      expect(result.shots[0].y).toBe(5);
      expect(result.shots[0].hit).toBe(true);
    });

    it("should execute CROSS_SHOT pattern", () => {
      match.planShot(5, 5, CROSS_SHOT, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);
      
      const hitShots = result.shots.filter(s => s.hit);
      expect(hitShots.length).toBeGreaterThan(0);
    });

    it("should execute HORIZONTAL_LINE_SHOT pattern", () => {
      match.planShot(5, 5, HORIZONTAL_LINE_SHOT, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(3);
      
      // All shots should have the same Y coordinate
      expect(result.shots.every(s => s.y === 5)).toBe(true);
    });
  });

  describe("Turn management with patterns", () => {
    it("should handle turn ending after pattern", () => {
      match.planShot(5, 5, CROSS_SHOT, true);
      const result = match.confirmAttack();
      
      // The default ruleset should toggle turn after any shot
      expect(result.turnEnded).toBeDefined();
      expect(result.canShootAgain).toBeDefined();
    });

    it("should consider pattern as hit if any shot hits", () => {
      // Mix of hits and misses
      match.planShot(5, 5, CROSS_SHOT, true);
      const result = match.confirmAttack();
      
      const anyHit = result.shots.some(s => s.hit);
      expect(anyHit).toBe(true);
    });
  });

  describe("Legacy planAndAttack method", () => {
    it("should still work for backward compatibility", () => {
      const result = match.planAndAttack(5, 5, true);
      
      expect(result.success).toBe(true);
      expect(result.hit).toBe(true);
    });

    it("should use SINGLE_SHOT pattern internally", () => {
      // Execute shot should not leave a pending plan
      match.planAndAttack(5, 5, true);
      
      expect(match.getPendingPlan()).toBeNull();
    });

    it("should accept a pattern parameter",() => {
      // Test that pattern parameter works correctly
      // Use a position that hasn't been shot before
      const result = match.planAndAttack(6, 6, true, CROSS_SHOT);
      
      expect(result.success).toBe(true);
      // First shot of CROSS is center (6,6) which should miss (no ship there)
      expect(result.hit).toBe(false);
      expect(match.getPendingPlan()).toBeNull();
    });

    it("should accept different pattern types", () => {
      // Horizontal line pattern at (8, 2) where there's a vertical ship
      const result = match.planAndAttack(8, 2, true, HORIZONTAL_LINE_SHOT);
      
      expect(result.success).toBe(true);
      // Returns first shot info (7, 2) which should miss
      expect(result.hit).toBeDefined();
    });
  });

  describe("Multiple pattern executions", () => {
    it("should allow planning different patterns sequentially", () => {
      // First pattern
      match.planShot(5, 5, CROSS_SHOT, true);
      let result = match.confirmAttack();
      expect(result.shots).toHaveLength(5);
      
      // Change turn if needed
      if (!match.isPlayerTurn()) {
        match.getEngine().toggleTurn();
      }
      
      // Second pattern
      match.planShot(8, 2, HORIZONTAL_LINE_SHOT, true);
      result = match.confirmAttack();
      expect(result.shots).toHaveLength(3);
    });

    it("should allow replanning before confirming", () => {
      // Plan first attack
      match.planShot(5, 5, CROSS_SHOT, true);
      expect(match.getPendingPlan()?.pattern).toBe(CROSS_SHOT);
      
      // Change mind and plan different attack
      match.planShot(8, 2, HORIZONTAL_LINE_SHOT, true);
      expect(match.getPendingPlan()?.pattern).toBe(HORIZONTAL_LINE_SHOT);
      
      // Confirm the second plan
      const result = match.confirmAttack();
      expect(result.shots).toHaveLength(3);
    });
  });

  describe("Edge cases", () => {
    it("should handle pattern at board edge", () => {
      match.planShot(0, 0, CROSS_SHOT, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      // Some shots will be out of bounds
      const executedShots = result.shots.filter(s => s.executed);
      expect(executedShots.length).toBeLessThan(5);
    });

    it("should not re-shoot already shot cells", () => {
      // First shot at center
      match.planAndAttack(5, 5, true);
      
      if (!match.isPlayerTurn()) {
        match.getEngine().toggleTurn();
      }
      
      // Plan cross pattern including the already-shot center
      match.planShot(5, 5, CROSS_SHOT, true);
      const result = match.confirmAttack();
      
      const centerShot = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(centerShot?.executed).toBe(false);
    });
  });
});
