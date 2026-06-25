import { describe, expect, it } from "vitest";
import { TestRuleSet } from "./rulesets";
import type { GameEngineState } from "../../../types/engine";
import type { ShotPatternResult } from "../../../types/shots";

describe("TestRuleSet", () => {
  describe("decideTurn", () => {
    it("should end turn if game is over", () => {
      const state = { isGameOver: true } as GameEngineState;
      const attackResult = { shots: [] } as unknown as ShotPatternResult;
      
      const decision = TestRuleSet.decideTurn(attackResult, state);
      expect(decision.shouldEndTurn).toBe(true);
      expect(decision.shouldToggleTurn).toBe(false);
      expect(decision.canShootAgain).toBe(false);
    });

    it("should allow shooting again if there is a hit", () => {
      const state = { isGameOver: false } as GameEngineState;
      const attackResult = {
        shots: [{ hit: true, executed: true }]
      } as ShotPatternResult;

      const decision = TestRuleSet.decideTurn(attackResult, state);
      expect(decision.shouldEndTurn).toBe(false);
      expect(decision.shouldToggleTurn).toBe(false);
      expect(decision.canShootAgain).toBe(true);
    });

    it("should end and toggle turn on miss", () => {
      const state = { isGameOver: false } as GameEngineState;
      const attackResult = {
        shots: [{ hit: false, executed: true }]
      } as ShotPatternResult;

      const decision = TestRuleSet.decideTurn(attackResult, state);
      expect(decision.shouldEndTurn).toBe(true);
      expect(decision.shouldToggleTurn).toBe(true);
      expect(decision.canShootAgain).toBe(false);
    });
  });

  describe("checkGameOver", () => {
    it("should be draw if both destroyed", () => {
      const state = {
        areAllPlayerShipsDestroyed: true,
        areAllEnemyShipsDestroyed: true
      } as GameEngineState;

      const result = TestRuleSet.checkGameOver(state);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBeNull();
    });

    it("should be enemy win if player destroyed", () => {
      const state = {
        areAllPlayerShipsDestroyed: true,
        areAllEnemyShipsDestroyed: false
      } as GameEngineState;

      const result = TestRuleSet.checkGameOver(state);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("enemy");
    });

    it("should be player win if enemy destroyed", () => {
      const state = {
        areAllPlayerShipsDestroyed: false,
        areAllEnemyShipsDestroyed: true
      } as GameEngineState;

      const result = TestRuleSet.checkGameOver(state);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("player");
    });

    it("should not be game over if neither destroyed", () => {
      const state = {
        areAllPlayerShipsDestroyed: false,
        areAllEnemyShipsDestroyed: false
      } as GameEngineState;

      const result = TestRuleSet.checkGameOver(state);
      expect(result.isGameOver).toBe(false);
    });
  });
});
