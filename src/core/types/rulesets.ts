import type { GameEngineState } from "./engine";
import type { GameEntity } from "./entities";
import type { Winner } from "./game";
import type { ShotPatternResult } from "./shots";

/**
 * Result returned by `MatchRuleSet.decideTurnOnItemUse`.
 *
 * Return `{ shouldToggleTurn: true }` to forfeit the current player's
 * remaining turn as a cost for using the item.
 */
export interface ItemUseTurnDecision {
  /** Whether to toggle the active turn after the item use. */
  shouldToggleTurn: boolean;
  /** Human-readable explanation of the decision, surfaced in `PlanAndAttackResult.reason` for debugging. */
  reason: string;
}

/**
 * Outcome of a single turn, returned by `MatchRuleSet.decideTurn`.
 *
 * Determines whether the current turn ends, whether the turn switches sides,
 * and whether the active player may fire again.
 */
export interface TurnDecision {
  /** Whether the current turn phase ends after this attack. */
  shouldEndTurn: boolean;
  /** Whether the active side should switch (player → enemy or vice versa). */
  shouldToggleTurn: boolean;
  /** Whether the same player may fire another shot. */
  canShootAgain: boolean;
  /** Human-readable reason for logging / debugging. */
  reason: string;
}

/**
 * Whether the game has ended and who won.
 * Returned by `MatchRuleSet.checkGameOver`.
 */
export interface GameOverDecision {
  isGameOver: boolean;
  winner: Winner;
}

/**
 * Defines the rules for turn management and game-over conditions.
 *
 * Implement this interface to create custom rulesets. Built-in presets
 * (`ClassicRuleSet`, `AlternatingTurnsRuleSet`, `ItemHitRuleSet`, etc.)
 * live in `engine/rulesets.ts`.
 *
 * Register custom rulesets with `registerRuleSet` so they are accessible
 * via `getRuleSetByName`.
 */
export interface MatchRuleSet extends GameEntity {
  /**
   * Decides the turn outcome after an attack cycle.
   *
   * Called once per attack, after all pattern shots have been resolved
   * and all `onCollect` handlers have run. The return value determines
   * whether the turn ends, toggles, or allows another shot.
   */
  decideTurn(
    attackResult: ShotPatternResult,
    currentState: GameEngineState,
  ): TurnDecision;

  /**
   * Checks whether the game should end given the current state.
   *
   * Called after every attack cycle, before any turn toggle is applied.
   * Return `{ isGameOver: true, winner }` to end the match.
   */
  checkGameOver(state: GameEngineState): GameOverDecision;

  /**
   * Called after an item's `onUse` handler has executed, but only when the
   * item handler itself did **not** toggle the turn.
   *
   * Return `{ shouldToggleTurn: true }` to forfeit the current player's
   * remaining turn as a cost for using the item. When this method is absent,
   * item use never affects the turn (default for all built-in rulesets).
   */
  decideTurnOnItemUse?(
    isPlayerUse: boolean,
    state: GameEngineState,
  ): ItemUseTurnDecision;
}
