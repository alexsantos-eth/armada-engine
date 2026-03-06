export type {
  ItemUseTurnDecision,
  TurnDecision,
  GameOverDecision,
  MatchRuleSet,
} from "../types/rulesets";
import { createEntitySet } from "../tools/constants";
import type {
  TurnDecision,
  GameOverDecision,
  MatchRuleSet,
} from "../types/rulesets";
import type { ShotPatternResult } from "../types/shots";
import type { GameEngineState } from "../types/engine";

export const ClassicRuleSet: MatchRuleSet = {
  id: "classic",
  title: "ClassicRuleSet",
  description: "Traditional battleship rules with hit continuation",

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
    const anyShipDestroyed = attackResult.shots.some(
      (shot) => shot.shipDestroyed && shot.executed,
    );

    if (anyHit) {
      if (anyShipDestroyed) {
        return {
          shouldEndTurn: true,
          shouldToggleTurn: true,
          canShootAgain: false,
          reason: "Ship destroyed - turn ends",
        };
      } else {
        return {
          shouldEndTurn: false,
          shouldToggleTurn: false,
          canShootAgain: true,
          reason: "Hit - shoot again",
        };
      }
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
    if (state.areAllPlayerShipsDestroyed) {
      return {
        isGameOver: true,
        winner: "enemy",
      };
    } else if (state.areAllEnemyShipsDestroyed) {
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
};

export const RulesetSet  = createEntitySet<MatchRuleSet>([
  ClassicRuleSet,
], ClassicRuleSet.title);

export const RULESETS = RulesetSet.map;
export const getRuleSet = RulesetSet.getById;
export const DEFAULT_RULESET = RulesetSet.default;