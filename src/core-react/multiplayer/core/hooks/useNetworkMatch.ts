/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react";
import {
  GameInitializer,
  Match,
  getRuleSetByName,
  type GameConfig,
  type MatchState,
  type MatchCallbacks,
  type MatchQueryAPI,
  type PlayerRole,
  type GameItem,
  type Cell,
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
  const [gameState, setGameState] = useState<MatchState | null>(null);
  const [playerBoard, setPlayerBoard] = useState<Cell[][] | undefined>(undefined);
  const [enemyBoard, setEnemyBoard] = useState<Cell[][] | undefined>(undefined);
  const match = useRef<Match | null>(null);
  const matchRef = useRef<Match | null>(null);

  const updateState = (m: Match) => {
    setGameState(m.getState());
    setPlayerBoard(m.getPlayerBoard());
    setEnemyBoard(m.getEnemyBoard());
  };

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
      ruleSet,
    }, initialTurn);

    const gameSetup = initializer.appendGameSetup({
      playerShips,
      enemyShips,
      playerItems: rehydrateItems(playerItems),
      enemyItems: rehydrateItems(enemyItems),
    });

    const newMatch = new Match({
      setup: gameSetup,
      onMatchStart: () => {
        callbacks?.onMatchStart?.();
      },
      onStateChange: (state) => {
        setGameState(state);
        setPlayerBoard(newMatch.getPlayerBoard());
        setEnemyBoard(newMatch.getEnemyBoard());
        callbacks?.onStateChange?.(state);
      },
      onShot: (shot, isPlayerShot) => {
        callbacks?.onShot?.(shot, isPlayerShot);
        
        if (isPlayerShot) {
          const patterns = newMatch.getState().playerShotPatterns;
          const pattern = patterns[shot.patternId ?? 0] ?? 0;
          roomService
            .pushMatchEvent(room.id, {
              type: "ATTACK",
              senderId: playerRole,
              x: shot.x,
              y: shot.y,
              pattern,
              timestamp: Date.now(),
            })
            .catch((error) => {
              console.error("Error pushing attack event:", error);
            });
        }
      },
      onItemCollected: (shot, item, isPlayerShot) => {
        callbacks?.onItemCollected?.(shot, item, isPlayerShot);
      },
      onItemUse: (itemId, isPlayerShot, item) => {
        callbacks?.onItemUse?.(itemId, isPlayerShot, item);

        if (isPlayerShot) {
          roomService
            .pushMatchEvent(room.id, {
              type: "USE_ITEM",
              senderId: playerRole,
              itemId,
              timestamp: Date.now(),
            })
            .catch((error) => {
              console.error("Error pushing use-item event:", error);
            });
        }
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
      onGameOver: (winner) => {
        callbacks?.onGameOver?.(winner);
        roomService.endGame(room.id).catch((error) => {
          console.error("Error ending game:", error);
        });
      },
    });

    newMatch.initializeMatch();
    match.current = newMatch;
    matchRef.current = newMatch;
    updateState(newMatch);
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id) return;

    const subscribe = () => {
      if (!matchRef.current) return () => {};

      return roomService.subscribeToMatchEvents(
        room.id,
        (event) => {
          if (event.senderId === playerRole) return;

          const m = matchRef.current;
          if (!m) return;

          if (event.type === "ATTACK") {
            m.planAndAttack(event.x, event.y, false, 0);
          } else if (event.type === "USE_ITEM") {
            m.useItem(event.itemId, false);
          }
        },
      );
    };

    const unsubscribe = subscribe();
    return unsubscribe;
  }, [room?.id]);

  const executeShot = (
    x: number,
    y: number,
    patternIdx: number = 0,
  ) => {
    if (!match.current || !gameState) return;
    if (!gameState.isPlayerTurn || gameState.isGameOver) return;
    
    match.current.planAndAttack(x, y, true, patternIdx);
  };

  const useItem = (itemId: number) => {
    if (!match.current || !gameState) return;
    if (!gameState.isPlayerTurn || gameState.isGameOver) return;

    match.current.useItem(itemId, true);
  };

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
