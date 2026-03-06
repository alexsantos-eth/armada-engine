export type {
  ItemUseTurnDecision,
  TurnDecision,
  GameOverDecision,
  MatchRuleSet,
} from "../types/rulesets";
import { createEntitySet } from "../tools/constants";
import type {
  ItemUseTurnDecision,
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

export const AlternatingTurnsRuleSet: MatchRuleSet = {
  id: "alternating-turns",
  title: "AlternatingTurnsRuleSet",
  description: "Every shot ends turn, no hit continuation",

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

    return {
      shouldEndTurn: true,
      shouldToggleTurn: true,
      canShootAgain: false,
      reason: anyHit ? "Hit - turn ends" : "Miss - turn ends",
    };
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

export const ItemHitRuleSet: MatchRuleSet = {
  id: "item-hit",
  title: "ItemHitRuleSet",
  description:
    "Repeat turn on any item collection or ship hit; turn ends on ship destruction or miss",

  decideTurn(attackResult: ShotPatternResult, currentState: GameEngineState): TurnDecision {
    if (currentState.isGameOver) {
      return {
        shouldEndTurn: true,
        shouldToggleTurn: false,
        canShootAgain: false,
        reason: "Game over",
      };
    }

    const anyItemCollected = attackResult.shots.some(
      (shot) => shot.collected && shot.executed,
    );
    const anyHit = attackResult.shots.some((shot) => shot.hit && shot.executed);
    const anyShipDestroyed = attackResult.shots.some(
      (shot) => shot.shipDestroyed && shot.executed,
    );

    if (anyItemCollected) {
      return {
        shouldEndTurn: false,
        shouldToggleTurn: false,
        canShootAgain: true,
        reason: "Item collected - shoot again",
      };
    }

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
    }

    return {
      shouldEndTurn: true,
      shouldToggleTurn: true,
      canShootAgain: false,
      reason: "Miss - turn ends",
    };
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

export const LoseTurnOnUseRuleSet: MatchRuleSet = {
  id: "lose-turn-on-use",
  title: "LoseTurnOnUseRuleSet",
  description:
    "Classic rules, but activating an item (onUse) ends your turn immediately",

  decideTurn: ClassicRuleSet.decideTurn,
  checkGameOver: ClassicRuleSet.checkGameOver,

  decideTurnOnItemUse(_isPlayerUse: boolean, _state: GameEngineState): ItemUseTurnDecision {
    return {
      shouldToggleTurn: true,
      reason: "Item used - turn forfeited",
    };
  },
};

export const RulesetSet  = createEntitySet<MatchRuleSet>([
  ClassicRuleSet,
  AlternatingTurnsRuleSet,
  ItemHitRuleSet,
  LoseTurnOnUseRuleSet,
], ClassicRuleSet.title);

export const RULESETS = RulesetSet.map;
export const getRuleSet = RulesetSet.getById;
export const DEFAULT_RULESET = RulesetSet.default;