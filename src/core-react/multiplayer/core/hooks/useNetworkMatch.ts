/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react";
import {
  GameInitializer,
  Match,
  SINGLE_SHOT,
  getRuleSetByName,
  type GameConfig,
  type GameEngineState,
  type MatchCallbacks,
  type MatchQueryAPI,
  type PlayerRole,
  type ShotPattern,
  type GameItem,
} from "../../../../core/engine";
import { ITEM_TEMPLATES } from "../../../../core/constants/items";

import type { GameRoom } from "../types/game/room";
import { roomService } from "../services/room/realtime";

export interface UseNetworkMatchProps extends Partial<MatchCallbacks> {
  room: GameRoom | null;
  playerRole: PlayerRole;
}

const rehydrateItems = (items: GameItem[]): GameItem[] =>
  items.map((item) => {
    const template = item.templateId
      ? ITEM_TEMPLATES[item.templateId]
      : undefined;
    if (!template) return item;
    return {
      ...item,
      ...(template.onCollect && { onCollect: template.onCollect }),
      ...(template.onUse && { onUse: template.onUse }),
    };
  });

const useNetworkMatch = ({
  room,
  playerRole,
  ...callbacks
}: UseNetworkMatchProps) => {
  const [gameState, setGameState] = useState<GameEngineState | null>(null);
  const match = useRef<Match | null>(null);

  useEffect(() => {
    if (!room || !room.initialState) return;

    const config: Partial<GameConfig> = room.gameConfig || {};
    const ruleSetName = room.ruleSet || "ClassicRuleSet";

    const playerShips =
      playerRole === "host"
        ? room.initialState.playerShips || []
        : room.initialState.enemyShips || [];

    const enemyShips =
      playerRole === "host"
        ? room.initialState.enemyShips || []
        : room.initialState.playerShips || [];

    const playerItems =
      playerRole === "host"
        ? room.initialState.playerItems || []
        : room.initialState.enemyItems || [];

    const enemyItems =
      playerRole === "host"
        ? room.initialState.enemyItems || []
        : room.initialState.playerItems || [];

    const ruleSet = getRuleSetByName(ruleSetName);
    const initialTurn = room.initialTurn === playerRole ? "player" : "enemy";

    const initializer = new GameInitializer({
      ...config,
      initialTurn,
      ruleSet,
    });

    const gameSetup = initializer.appendGameSetup({
      playerShips,
      enemyShips,
      playerItems: rehydrateItems(playerItems),
      enemyItems: rehydrateItems(enemyItems),
    });

    const newMatch = new Match({
      setup: gameSetup,
      ...callbacks,
      onStateChange: (state) => {
        setGameState(state);
        callbacks?.onStateChange?.(state);
      },
      onGameOver: (result) => {
        callbacks?.onGameOver?.(result);
        roomService.endGame(room.id).catch((error) => {
          console.error("Error ending game:", error);
        });
      },
      onTurnChange: (currentTurn) => {
        callbacks?.onTurnChange?.(currentTurn);
        roomService
          .updateCurrentTurn(
            room.id,
            currentTurn === "PLAYER_TURN"
              ? playerRole
              : playerRole === "host"
                ? "guest"
                : "host",
          )
          .catch((error) => {
            console.error("Error updating current turn:", error);
          });
      },
    });

    newMatch.initializeMatch();
    match.current = newMatch;
    setGameState(newMatch.getState());
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id || !match.current) return;

    const unsubscribe = roomService.subscribeToMatchEvents(
      room.id,
      (event) => {
        if (event.senderId === playerRole) return;

        if (event.type === "ATTACK") {
          match.current?.planAndAttack(event.x, event.y, false, event.pattern);
        } else if (event.type === "USE_ITEM") {
          match.current?.useItem(event.itemId, false);
        }
      },
    );

    return unsubscribe;
  }, [room?.id, match.current]);

  const executeShot = async (
    x: number,
    y: number,
    pattern: ShotPattern = SINGLE_SHOT,
  ) => {
    if (!match.current || !room || !gameState) return;
    if (!gameState.isPlayerTurn) return;
    if (gameState.isGameOver) return;

    const result = match.current.planAndAttack(x, y, true, pattern);
    if (!result.success) return;

    try {
      await roomService.pushMatchEvent(room.id, {
        type: "ATTACK",
        senderId: playerRole,
        x,
        y,
        pattern,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error pushing attack event:", error);
    }
  };

  const useItem = async (itemId: number) => {
    if (!match.current || !room || !gameState) return;
    if (!gameState.isPlayerTurn) return;
    if (gameState.isGameOver) return;

    const used = match.current.useItem(itemId, true);
    if (!used) return;

    try {
      await roomService.pushMatchEvent(room.id, {
        type: "USE_ITEM",
        senderId: playerRole,
        itemId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error pushing use-item event:", error);
    }
  };

  const playerBoard = match.current?.getPlayerBoard();
  const enemyBoard = match.current?.getEnemyBoard();

  return {
    gameState,
    playerBoard,
    useItem,
    enemyBoard,
    executeShot,
    match: match.current as MatchQueryAPI | null,
  };
};

export default useNetworkMatch;
