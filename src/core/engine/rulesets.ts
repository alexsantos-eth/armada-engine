import type { GameEngineState } from "./logic";
import type { ShotPatternResult, Winner } from "../types/common";

/**
 * Result returned by {@link MatchRuleSet.decideTurnOnItemUse}.
 */
export interface ItemUseTurnDecision {
  /** Whether to toggle the active turn after the item use. */
  shouldToggleTurn: boolean;
  reason: string;
}

/**
 * Turn decision result
 */
export interface TurnDecision {
  shouldEndTurn: boolean;
  shouldToggleTurn: boolean;
  canShootAgain: boolean;
  reason: string;
}

/**
 * Game over decision result
 */
export interface GameOverDecision {
  isGameOver: boolean;
  winner: Winner;
}

/**
 * Match Rule Set interface
 * Defines the rules for turn management and game over conditions
 */
export interface MatchRuleSet {
  name: string;
  description: string;

  /**
   * Decide turn outcome based on attack result
   * @param attackResult - Result from attack phase
   * @param currentState - Current game state
   * @returns Turn decision
   */
  decideTurn(
    attackResult: ShotPatternResult,
    currentState: GameEngineState,
  ): TurnDecision;

  /**
   * Check if game should be over
   * @param state - Current game state
   * @returns Game over decision
   */
  checkGameOver(state: GameEngineState): GameOverDecision;

  /**
   * Called after an item's `onUse` handler has executed (and only when the
   * item itself did **not** already toggle the turn).
   *
   * Return `{ shouldToggleTurn: true }` to forfeit the current player's
   * remaining turn as a cost for using the item.  When not defined
   * (the default for all built-in rulesets), item use never affects the turn.
   *
   * @param isPlayerUse - `true` when the player used the item; `false` for the enemy.
   * @param state - Game state immediately after the `onUse` handler ran.
   */
  decideTurnOnItemUse?(
    isPlayerUse: boolean,
    state: GameEngineState,
  ): ItemUseTurnDecision;
}

/**
 * Default/Classic Battleship Rules
 * - Hit (ship not destroyed): shoot again
 * - Ship destroyed: turn ends
 * - Miss: turn ends
 * - Game over: all enemy ships destroyed
 */
export const ClassicRuleSet: MatchRuleSet = {
  name: "ClassicRuleSet",
  description: "Traditional battleship rules with hit continuation",

  decideTurn(attackResult, currentState): TurnDecision {
    // Priority 1: Game is already over
    if (currentState.isGameOver) {
      return {
        shouldEndTurn: true,
        shouldToggleTurn: false,
        canShootAgain: false,
        reason: "Game over",
      };
    }

    // Evaluate pattern result: check if any shot hit or destroyed a ship
    const anyHit = attackResult.shots.some((shot) => shot.hit && shot.executed);
    const anyShipDestroyed = attackResult.shots.some(
      (shot) => shot.shipDestroyed && shot.executed,
    );

    // Priority 2: Evaluate based on shot result
    if (anyHit) {
      if (anyShipDestroyed) {
        // Ship destroyed - turn ends, switch player
        return {
          shouldEndTurn: true,
          shouldToggleTurn: true,
          canShootAgain: false,
          reason: "Ship destroyed - turn ends",
        };
      } else {
        // Hit but ship not destroyed - can shoot again
        return {
          shouldEndTurn: false,
          shouldToggleTurn: false,
          canShootAgain: true,
          reason: "Hit - shoot again",
        };
      }
    } else {
      // Miss - turn ends, switch player
      return {
        shouldEndTurn: true,
        shouldToggleTurn: true,
        canShootAgain: false,
        reason: "Miss - turn ends",
      };
    }
  },

  checkGameOver(state): GameOverDecision {
    // Game over when all ships of one player are destroyed
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

/**
 * Alternating Turns Rule Set
 * - Every shot ends the turn, regardless of hit or miss
 * - Game over: all enemy ships destroyed
 */
export const AlternatingTurnsRuleSet: MatchRuleSet = {
  name: "AlternatingTurnsRuleSet",
  description: "Every shot ends turn, no hit continuation",

  decideTurn(attackResult, currentState): TurnDecision {
    if (currentState.isGameOver) {
      return {
        shouldEndTurn: true,
        shouldToggleTurn: false,
        canShootAgain: false,
        reason: "Game over",
      };
    }

    // Check if any shot hit
    const anyHit = attackResult.shots.some((shot) => shot.hit && shot.executed);

    // Every shot ends turn
    return {
      shouldEndTurn: true,
      shouldToggleTurn: true,
      canShootAgain: false,
      reason: anyHit ? "Hit - turn ends" : "Miss - turn ends",
    };
  },

  checkGameOver(state): GameOverDecision {
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


/**
 * Item Hit Rule Set
 * - Hit an item (collected): shoot again
 * - Hit a ship (not destroyed): shoot again
 * - Ship destroyed: turn ends
 * - Miss: turn ends
 * - Game over: all enemy ships destroyed
 */
export const ItemHitRuleSet: MatchRuleSet = {
  name: "ItemHitRuleSet",
  description:
    "Repeat turn on any item collection or ship hit; turn ends on ship destruction or miss",

  decideTurn(attackResult, currentState): TurnDecision {
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

    // Item collected → repeat turn regardless of other results
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

  checkGameOver(state): GameOverDecision {
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

/**
 * Lose Turn On Use Rule Set
 * - Classic ship-hit rules (hit → shoot again, ship destroyed → turn ends, miss → turn ends)
 * - Using an item (`onUse`) **costs the current player their turn**; the opponent goes next.
 *   The turn switch only happens when the item itself did not already toggle the turn.
 * - Game over: all enemy ships destroyed
 */
export const LoseTurnOnUseRuleSet: MatchRuleSet = {
  name: "LoseTurnOnUseRuleSet",
  description:
    "Classic rules, but activating an item (onUse) ends your turn immediately",

  decideTurn: ClassicRuleSet.decideTurn,
  checkGameOver: ClassicRuleSet.checkGameOver,

  decideTurnOnItemUse(_isPlayerUse, _state): ItemUseTurnDecision {
    return {
      shouldToggleTurn: true,
      reason: "Item used - turn forfeited",
    };
  },
};

export const getRuleSetByName = (name: string): MatchRuleSet => {
  switch (name) {
    case ClassicRuleSet.name:
      return ClassicRuleSet;
    case AlternatingTurnsRuleSet.name:
      return AlternatingTurnsRuleSet;
    case ItemHitRuleSet.name:
      return ItemHitRuleSet;
    case LoseTurnOnUseRuleSet.name:
      return LoseTurnOnUseRuleSet;
    default:
      throw new Error(`Unknown ruleset name: ${name}`);
  }
}

/**
 * Export default ruleset (Classic)
 */
export const DefaultRuleSet = LoseTurnOnUseRuleSet;
