import { toMatchState } from "../logic";
import type { GameEngine } from "../logic";
import type { MatchCallbacks } from "./types";
import type {
  GameItem,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
  Shot,
  Winner,
} from "../../types/common";

// ---------------------------------------------------------------------------
// Payload types — one per game cycle kind
// ---------------------------------------------------------------------------

export type AttackCyclePayload = {
  kind: "attack";
  result: ShotPatternResult;
  isPlayerShot: boolean;
  centerX: number;
  centerY: number;
  pattern: ShotPattern;
  currentTurn: GameTurn;
  /**
   * True only when the ruleset's `decideTurn` toggled the turn.
   * Collect-phase toggles (from `onCollect` handlers) intentionally do NOT
   * emit `onTurnChange` — preserving the original behaviour.
   */
  rulesetToggledTurn: boolean;
  winner: Winner | null;
};

export type ItemUseCyclePayload = {
  kind: "itemUse";
  itemId: number;
  isPlayerShot: boolean;
  item: GameItem;
  currentTurn: GameTurn;
  /** True if either the item handler or the ruleset toggled the turn. */
  turnToggled: boolean;
  winner: Winner | null;
};

export type MatchLifecyclePayload =
  | { kind: "matchStart"; currentTurn: GameTurn }
  | { kind: "reset"; currentTurn: GameTurn };

export type CallbackPayload =
  | AttackCyclePayload
  | ItemUseCyclePayload
  | MatchLifecyclePayload;

// ---------------------------------------------------------------------------
// CallbackCoordinator
// ---------------------------------------------------------------------------

/**
 * Single point of truth for all match-level callbacks.
 *
 * Called **once** at the end of each game cycle instead of being scattered
 * across `executeAttack`, `runCollectHandlers`, `resolveTurn`, `useItem`,
 * `resolveItemUse`, `initializeEngine`, and `resetEngine`.
 *
 * Adding a new callback now means editing this one function rather than
 * hunting across multiple XState actions.
 *
 * Callback firing order per cycle:
 *  attack  → onItemCollected* → onShot → onTurnChange? → onGameOver? → onStateChange
 *  itemUse → onItemUse? → onTurnChange? → onGameOver? → onStateChange
 *  matchStart → onMatchStart → onStateChange
 *  reset   → onStateChange
 */
export function fireMatchCallbacks(
  callbacks: MatchCallbacks | undefined,
  engine: GameEngine,
  payload: CallbackPayload,
): void {
  if (!callbacks) return;

  switch (payload.kind) {
    case "matchStart": {
      callbacks.onMatchStart?.();
      callbacks.onStateChange?.(
        toMatchState(engine.getState(), payload.currentTurn),
      );
      break;
    }

    case "reset": {
      callbacks.onStateChange?.(
        toMatchState(engine.getState(), payload.currentTurn),
      );
      break;
    }

    case "attack": {
      const {
        result,
        isPlayerShot,
        centerX,
        centerY,
        pattern,
        currentTurn,
        rulesetToggledTurn,
        winner,
      } = payload;

      const engineState = engine.getState();

      // onItemCollected — fires after onCollect handlers have already run
      // (both are synchronous within the same XState transition, so external
      // subscribers still observe them atomically).
      if (callbacks.onItemCollected) {
        const notifyItems = isPlayerShot
          ? engineState.enemyItems
          : engineState.playerItems;
        for (const shot of result.shots) {
          if (shot.itemFullyCollected && shot.itemId !== undefined) {
            const item = notifyItems[shot.itemId];
            if (item) {
              callbacks.onItemCollected(shot as Shot, item, isPlayerShot);
            }
          }
        }
      }

      // onShot — synthesised center shot summarising the pattern result.
      if (callbacks.onShot) {
        const centerShot: Shot = {
          x: centerX,
          y: centerY,
          hit: result.shots.some((s) => s.hit && s.executed),
          shipId: result.shots.find((s) => s.hit && s.executed)?.shipId,
          patternId: pattern.id,
          patternCenterX: centerX,
          patternCenterY: centerY,
        };
        callbacks.onShot(centerShot, isPlayerShot);
      }

      // onTurnChange — only for ruleset-driven toggles (not collect-phase toggles).
      if (rulesetToggledTurn) {
        callbacks.onTurnChange?.(currentTurn);
      }

      if (winner) {
        callbacks.onGameOver?.(winner);
      }

      callbacks.onStateChange?.(toMatchState(engine.getState(), currentTurn));
      break;
    }

    case "itemUse": {
      const { itemId, isPlayerShot, item, currentTurn, turnToggled, winner } =
        payload;

      // onItemUse — only for player-initiated uses (matches original behaviour).
      if (isPlayerShot) {
        callbacks.onItemUse?.(itemId, isPlayerShot, item);
      }

      if (turnToggled) {
        callbacks.onTurnChange?.(currentTurn);
      }

      if (winner) {
        callbacks.onGameOver?.(winner);
      }

      callbacks.onStateChange?.(toMatchState(engine.getState(), currentTurn));
      break;
    }
  }
}
