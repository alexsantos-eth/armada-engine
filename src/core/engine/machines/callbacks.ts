import { toMatchState } from "../logic";
import type { IGameEngineReader } from "../logic";
import type { Shot } from "../../types/shots";
import type {
  AttackCyclePayload,
  ItemUseCyclePayload,
  MatchLifecyclePayload,
  CallbackPayload,
  MatchCallbacks
} from "../../types/callbacks";

export type {
  AttackCyclePayload,
  ItemUseCyclePayload,
  MatchLifecyclePayload,
  CallbackPayload,
};

export function fireMatchCallbacks(
  callbacks: MatchCallbacks | undefined,
  engine: IGameEngineReader,
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
        currentTurn,
        rulesetToggledTurn,
        winner,
      } = payload;

      const engineState = engine.getState();

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

      if (callbacks.onShot) {
        const executedShot = result.shots.find((s) => s.executed);
        const centerShot: Shot = {
          x: centerX,
          y: centerY,
          hit: result.shots.some((s) => s.hit && s.executed),
          shipId: result.shots.find((s) => s.hit && s.executed)?.shipId,
          patternId: executedShot?.patternId ?? 0,
          patternCenterX: centerX,
          patternCenterY: centerY,
        };
        callbacks.onShot(centerShot, isPlayerShot);
      }

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
      const {
        itemId,
        isPlayerShot,
        item,
        currentTurn,
        turnToggled,
        winner,
        shipId,
      } = payload;

      if (isPlayerShot) {
        callbacks.onItemUse?.(itemId, isPlayerShot, item, shipId);
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
