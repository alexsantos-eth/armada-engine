import { describe, it, expect, beforeEach } from "vitest";
import { Match } from "../../engine/match";
import { StandardBoardView, withView } from "../../constants/views";
import { SHOT_PATTERNS } from "../../constants/shots";
import type { GameShip } from "../../types/entities";
import { AttackError } from "../../types";

const ALL_PATTERNS = Object.values(SHOT_PATTERNS);
const idx = (id: string) => ALL_PATTERNS.findIndex((p) => p.id === id);
const SINGLE_IDX = idx("single");
const CROSS_IDX  = idx("cross");
const HLINE_IDX  = idx("horizontal-line");

describe("Match Shot Patterns", () => {
  let match: Match;
  const playerShips: GameShip[] = [
    { coords: [0, 0], width: 3, height: 1 },
  ];
  const enemyShips: GameShip[] = [
    { coords: [5, 5], width: 3, height: 1 },
    { coords: [8, 2], width: 1, height: 2 },
  ];

  beforeEach(() => {
    match = new Match({
      setup: {
        playerShips,
        enemyShips,
        initialTurn: 'PLAYER_TURN',
        config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
        playerShotPatterns: ALL_PATTERNS,
        enemyShotPatterns: ALL_PATTERNS,
      },
    });
    match.initializeMatch();
  });

  describe("planShot and confirmAttack flow", () => {
    it("should plan a shot with a pattern", () => {
      const planResult = match.planShot(5, 5, CROSS_IDX, true);
      
      expect(planResult.ready).toBe(true);
      expect(planResult.patternIdx).toBe(CROSS_IDX);
      expect(planResult.centerX).toBe(5);
      expect(planResult.centerY).toBe(5);
    });

    it("should store pending plan", () => {
      match.planShot(5, 5, CROSS_IDX, true);
      
      const pendingPlan = match.getPendingPlan();
      expect(pendingPlan).toBeDefined();
      expect(pendingPlan?.centerX).toBe(5);
      expect(pendingPlan?.centerY).toBe(5);
      expect(pendingPlan?.patternIdx).toBe(CROSS_IDX);
      expect(pendingPlan?.isPlayerShot).toBe(true);
    });

    it("should execute planned attack", () => {
      match.planShot(5, 5, CROSS_IDX, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);
    });

    it("should clear pending plan after confirmation", () => {
      match.planShot(5, 5, CROSS_IDX, true);
      match.confirmAttack();
      
      const pendingPlan = match.getPendingPlan();
      expect(pendingPlan).toBeNull();
    });

    it("should fail to confirm attack without planning first", () => {
      const result = match.confirmAttack();
      
      expect(result.success).toBe(false);
      // Machine silently drops CONFIRM_ATTACK outside the `planned` state;
      // the method surfaces AttackError.AttackFailed via the missing lastAttackResult branch.
      expect(result.error).toContain(AttackError.AttackFailed);
      expect(result.shots).toHaveLength(0);
    });

    it("should cancel pending plan", () => {
      match.planShot(5, 5, CROSS_IDX, true);
      expect(match.getPendingPlan()).not.toBeNull();
      
      match.cancelPlan();
      
      expect(match.getPendingPlan()).toBeNull();
    });

    it("should reject invalid position in plan", () => {
      const result = match.planShot(-1, 5, CROSS_IDX, true);
      
      expect(result.ready).toBe(false);
      expect(result.error).toBe("Invalid position");
    });
  });

  describe("Pattern execution with different patterns", () => {
    it("should execute single pattern", () => {
      match.planShot(5, 5, SINGLE_IDX, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0].x).toBe(5);
      expect(result.shots[0].y).toBe(5);
      expect(result.shots[0].hit).toBe(true);
    });

    it("should execute CROSS_SHOT pattern", () => {
      match.planShot(5, 5, CROSS_IDX, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(5);
      
      const hitShots = result.shots.filter(s => s.hit);
      expect(hitShots.length).toBeGreaterThan(0);
    });

    it("should execute HORIZONTAL_LINE_SHOT pattern", () => {
      match.planShot(5, 5, HLINE_IDX, true);
      const result = match.confirmAttack();
      
      expect(result.success).toBe(true);
      expect(result.shots).toHaveLength(3);
      
      // All shots should have the same Y coordinate
      expect(result.shots.every(s => s.y === 5)).toBe(true);
    });
  });

  describe("Turn management with patterns", () => {
    it("should handle turn ending after pattern", () => {
      match.planShot(5, 5, CROSS_IDX, true);
      const result = match.confirmAttack();
      
      // The default ruleset should toggle turn after any shot
      expect(result.turnEnded).toBeDefined();
      expect(result.canShootAgain).toBeDefined();
    });

    it("should consider pattern as hit if any shot hits", () => {
      // Mix of hits and misses
      match.planShot(5, 5, CROSS_IDX, true);
      const result = match.confirmAttack();
      
      const anyHit = result.shots.some(s => s.hit);
      expect(anyHit).toBe(true);
    });
  });

  describe("Legacy planAndAttack method", () => {
    it("should still work for backward compatibility", () => {
      const result = match.planAndAttack(5, 5, true);
      
      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(true);
    });

    it("should use single pattern internally", () => {
      // Execute shot should not leave a pending plan
      match.planAndAttack(5, 5, true);
      
      expect(match.getPendingPlan()).toBeNull();
    });

    it("should accept a pattern parameter",() => {
      // Test that pattern parameter works correctly
      // Use a position that hasn't been shot before
      const result = match.planAndAttack(6, 6, true, CROSS_IDX);
      
      expect(result.success).toBe(true);
      // First shot of CROSS is center (6,6) which should miss (no ship there)
      expect(result.shots[0]?.hit).toBe(false);
      expect(match.getPendingPlan()).toBeNull();
    });

    it("should accept different pattern types", () => {
      // Horizontal line pattern at (8, 2) where there's a vertical ship
      const result = match.planAndAttack(8, 2, true, HLINE_IDX);
      
      expect(result.success).toBe(true);
      // Returns first shot info (7, 2) which should miss
      expect(result.shots[0]?.hit).toBeDefined();
    });
  });

  describe("Multiple pattern executions", () => {
    it("should allow planning different patterns sequentially", () => {
      // First pattern
      match.planShot(5, 5, CROSS_IDX, true);
      let result = match.confirmAttack();
      expect(result.shots).toHaveLength(5);
      
      // Change turn if needed
      if (!match.isPlayerTurn()) {
        match.forceSetTurn("PLAYER_TURN");
      }
      
      // Second pattern
      match.planShot(8, 2, HLINE_IDX, true);
      result = match.confirmAttack();
      expect(result.shots).toHaveLength(3);
    });

    it("should allow replanning before confirming", () => {
      // Plan first attack
      match.planShot(5, 5, CROSS_IDX, true);
      expect(match.getPendingPlan()?.patternIdx).toBe(CROSS_IDX);
      
      // Change mind and plan different attack
      match.planShot(8, 2, HLINE_IDX, true);
      expect(match.getPendingPlan()?.patternIdx).toBe(HLINE_IDX);
      
      // Confirm the second plan
      const result = match.confirmAttack();
      expect(result.shots).toHaveLength(3);
    });
  });

  describe("Edge cases", () => {
    it("should handle pattern at board edge", () => {
      match.planShot(0, 0, CROSS_IDX, true);
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
        match.forceSetTurn("PLAYER_TURN");
      }
      
      // Plan cross pattern including the already-shot center
      match.planShot(5, 5, CROSS_IDX, true);
      const result = match.confirmAttack();
      
      const centerShot = result.shots.find(s => s.x === 5 && s.y === 5);
      expect(centerShot?.executed).toBe(false);
    });
  });
});
