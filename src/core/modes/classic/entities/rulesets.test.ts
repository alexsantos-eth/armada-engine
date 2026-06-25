import { describe, expect, it } from "vitest";
import { ClassicRuleSet } from "./rulesets";
import type { GameEngineState } from "../../../types/engine";

describe("ClassicRuleSet", () => {
  describe("decideTurn", () => {
    it("should return game over decision when game is already over", () => {
      const state = { isGameOver: true } as GameEngineState;
      const decision = ClassicRuleSet.decideTurn({ shots: [] }, state);
      expect(decision).toEqual({
        shouldEndTurn: true,
        shouldToggleTurn: false,
        canShootAgain: false,
        reason: "Game over",
      });
    });
  });
});
