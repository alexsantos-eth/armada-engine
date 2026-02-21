import type { GameEngineState } from "./logic";
import type { ShotPatternResult, Winner } from "../types/common";

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
}

/**
 * Default/Classic Battleship Rules
 * - Hit (ship not destroyed): shoot again
 * - Ship destroyed: turn ends
 * - Miss: turn ends
 * - Game over: all enemy ships destroyed
 */
export const ClassicRuleSet: MatchRuleSet = {
  name: "Classic",
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
  name: "Alternating",
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
 * Export default ruleset (Classic)
 */
export const DefaultRuleSet = ClassicRuleSet;
