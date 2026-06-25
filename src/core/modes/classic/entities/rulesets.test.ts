import { describe, expect, it } from "vitest";
import { ClassicRuleSet } from "./rulesets";
import type { GameEngineState } from "../../../types/engine";
import type { ShotPatternResult, ShotPatternShot } from "../../../types/shots";

const createMockShotResult = (shots: Partial<ShotPatternShot>[]): ShotPatternResult => ({
  success: true,
  isGameOver: false,
  winner: null,
  shots: shots.map((s) => ({
    x: 0,
    y: 0,
    hit: false,
    executed: true,
    ...s,
  })),
});

describe("ClassicRuleSet", () => {
  describe("decideTurn", () => {
    it("should return game over decision when game is already over", () => {
      const state = { isGameOver: true } as GameEngineState;
      const decision = ClassicRuleSet.decideTurn(createMockShotResult([]), state);
      expect(decision).toEqual({
        shouldEndTurn: true,
        shouldToggleTurn: false,
        canShootAgain: false,
        reason: "Game over",
      });
    });

    it("should return miss decision when no shots hit", () => {
      const state = { isGameOver: false } as GameEngineState;
      const decision = ClassicRuleSet.decideTurn(
        createMockShotResult([{ hit: false, executed: true }]),
        state
      );
      expect(decision).toEqual({
        shouldEndTurn: true,
        shouldToggleTurn: true,
        canShootAgain: false,
        reason: "Miss - turn ends",
      });
    });

    it("should return hit decision when a shot hits but no ship is destroyed", () => {
      const state = { isGameOver: false } as GameEngineState;
      const decision = ClassicRuleSet.decideTurn(
        createMockShotResult([{ hit: true, executed: true, shipDestroyed: false }]),
        state
      );
      expect(decision).toEqual({
        shouldEndTurn: false,
        shouldToggleTurn: false,
        canShootAgain: true,
        reason: "Hit - shoot again",
      });
    });

    it("should return ship destroyed decision when a shot hits and destroys a ship", () => {
      const state = { isGameOver: false } as GameEngineState;
      const decision = ClassicRuleSet.decideTurn(
        createMockShotResult([{ hit: true, executed: true, shipDestroyed: true }]),
        state
      );
      expect(decision).toEqual({
        shouldEndTurn: true,
        shouldToggleTurn: true,
        canShootAgain: false,
        reason: "Ship destroyed - turn ends",
      });
    });
  });

  describe("checkGameOver", () => {
    it("should return player lost when all player ships are destroyed", () => {
      const state = { areAllPlayerShipsDestroyed: true, areAllEnemyShipsDestroyed: false } as GameEngineState;
      const decision = ClassicRuleSet.checkGameOver(state);
      expect(decision).toEqual({
        isGameOver: true,
        winner: "enemy",
      });
    });

    it("should return player won when all enemy ships are destroyed", () => {
      const state = { areAllPlayerShipsDestroyed: false, areAllEnemyShipsDestroyed: true } as GameEngineState;
      const decision = ClassicRuleSet.checkGameOver(state);
      expect(decision).toEqual({
        isGameOver: true,
        winner: "player",
      });
    });

    it("should return not game over when neither player nor enemy ships are all destroyed", () => {
      const state = { areAllPlayerShipsDestroyed: false, areAllEnemyShipsDestroyed: false } as GameEngineState;
      const decision = ClassicRuleSet.checkGameOver(state);
      expect(decision).toEqual({
        isGameOver: false,
        winner: null,
      });
    });
  });
});
