import type { GameItem, GameTurn, ShotPatternResult, Winner } from "./common";
import type { MatchCallbacks } from "./machines";

/**
 * Payload emitted at the end of a complete attack cycle
 * (plan → confirm → execute shots → run collect handlers → resolve turn).
 *
 * Consumed by `fireMatchCallbacks` to dispatch `onItemCollected`, `onShot`,
 * `onTurnChange`, `onGameOver`, and `onStateChange` in the correct order.
 */
export type AttackCyclePayload = {
  kind: "attack";
  result: ShotPatternResult;
  isPlayerShot: boolean;
  centerX: number;
  centerY: number;
  /** 0-based index into the attacker's `shotPatterns` array. */
  patternIdx: number;
  currentTurn: GameTurn;
  /**
   * `true` only when the ruleset's `decideTurn` toggled the turn.
   * Collect-phase toggles (from `onCollect` handlers) intentionally do NOT
   * emit `onTurnChange`, preserving the original behaviour.
   */
  rulesetToggledTurn: boolean;
  winner: Winner | null;
};

/**
 * Payload emitted after a `USE_ITEM` event has been fully resolved
 * (handler invoked, turns decided).
 */
export type ItemUseCyclePayload = {
  kind: "itemUse";
  itemId: number;
  isPlayerShot: boolean;
  item: GameItem;
  currentTurn: GameTurn;
  /** `true` if either the item handler or the ruleset toggled the turn. */
  turnToggled: boolean;
  winner: Winner | null;
  /** Optional ship the item was targeted at, forwarded from `match.useItem()`. */
  shipId?: number;
};

/**
 * Payload for match-level lifecycle events (`matchStart` and `reset`).
 */
export type MatchLifecyclePayload =
  | { kind: "matchStart"; currentTurn: GameTurn }
  | { kind: "reset"; currentTurn: GameTurn };

/**
 * Discriminated union of all payload shapes accepted by `fireMatchCallbacks`.
 *
 * Callback firing order per cycle:
 * - `attack`     → `onItemCollected*` → `onShot` → `onTurnChange?` → `onGameOver?` → `onStateChange`
 * - `itemUse`    → `onItemUse?` → `onTurnChange?` → `onGameOver?` → `onStateChange`
 * - `matchStart` → `onMatchStart` → `onStateChange`
 * - `reset`      → `onStateChange`
 */
export type CallbackPayload =
  | AttackCyclePayload
  | ItemUseCyclePayload
  | MatchLifecyclePayload;

export type { MatchCallbacks };
