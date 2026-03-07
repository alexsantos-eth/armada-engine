import type {
  TurnDecision,
  GameOverDecision,
  MatchRuleSet,
} from "../../../types/rulesets";
import type { ShotPatternResult } from "../../../types/shots";
import type { GameEngineState } from "../../../types/engine";

/**
 * Test mode ruleset - simplified rules for testing
 */

export const TestRuleSet = Object.freeze({
  id: "test",
  title: "TestRuleSet",
  description: "Simple rules for testing",

  decideTurn(attackResult: ShotPatternResult, currentState: GameEngineState): TurnDecision {
    if (currentState.isGameOver) {
      return {
        shouldEndTurn: true,
        shouldToggleTurn: false,
        canShootAgain: false,
        reason: "Game over",
      };
    }

    const anyHit = attackResult.shots.some((shot) => shot.hit && shot.executed);

    if (anyHit) {
      return {
        shouldEndTurn: false,
        shouldToggleTurn: false,
        canShootAgain: true,
        reason: "Hit - shoot again",
      };
    } else {
      return {
        shouldEndTurn: true,
        shouldToggleTurn: true,
        canShootAgain: false,
        reason: "Miss - turn ends",
      };
    }
  },

  checkGameOver(state: GameEngineState): GameOverDecision {
    if (state.areAllPlayerShipsDestroyed && state.areAllEnemyShipsDestroyed) {
      return {
        isGameOver: true,
        winner: null,
      };
    }

    if (state.areAllPlayerShipsDestroyed) {
      return {
        isGameOver: true,
        winner: "enemy",
      };
    }

    if (state.areAllEnemyShipsDestroyed) {
      return {
        isGameOver: true,
        winner: "player",
      };
    }

    return {
      isGameOver: false,
      winner: null,
    };
  },
} satisfies MatchRuleSet);
