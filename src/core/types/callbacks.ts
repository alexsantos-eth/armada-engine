import type { GameTurn, Winner } from "./game";
import type { ShotPatternResult } from "./shots";
import type { GameItem } from "./entities";
import type { MatchCallbacks } from "./machines";

/**
 * Payload emitted at the end of a complete attack cycle
 * (plan → confirm → execute shots → run collect handlers → resolve turn).
 *
 * Consumed by `fireMatchCallbacks` to dispatch `onItemCollected`, `onShot`,
 * `onTurnChange`, `onGameOver`, and `onStateChange` in the correct order.
 */
export type AttackCyclePayload = {
  /** Discriminant that identifies this payload as originating from an attack cycle. */
  kind: "attack";
  /** Aggregated outcome from the engine after all pattern shots were applied. */
  result: ShotPatternResult;
  /** `true` when the local player fired; `false` when the enemy fired. */
  isPlayerShot: boolean;
  /** Board column of the pattern's centre cell. */
  centerX: number;
  /** Board row of the pattern's centre cell. */
  centerY: number;
  /** 0-based index into the attacker's `shotPatterns` array. */
  patternIdx: number;
  /** Active turn at the end of the attack cycle (after any `onCollect` handler toggles). */
  currentTurn: GameTurn;
  /**
   * `true` only when the ruleset's `decideTurn` toggled the turn.
   * Collect-phase toggles (from `onCollect` handlers) intentionally do NOT
   * emit `onTurnChange`, preserving the original behaviour.
   */
  rulesetToggledTurn: boolean;
  /** Winning side if the game ended during this cycle; `null` while still in progress. */
  winner: Winner | null;
};

/**
 * Payload emitted after a `USE_ITEM` event has been fully resolved
 * (handler invoked, turns decided).
 */
export type ItemUseCyclePayload = {
  /** Discriminant that identifies this payload as originating from an item-use cycle. */
  kind: "itemUse";
  /** 0-based index of the activated item within the relevant side's items array. */
  itemId: number;
  /** `true` when the local player activated the item; `false` when the enemy did. */
  isPlayerShot: boolean;
  /** Full item definition at the moment of activation. */
  item: GameItem;
  /** Active turn at the end of the item-use cycle. */
  currentTurn: GameTurn;
  /** `true` if either the item handler or the ruleset toggled the turn. */
  turnToggled: boolean;
  /** Winning side if the game ended during this cycle; `null` while still in progress. */
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
