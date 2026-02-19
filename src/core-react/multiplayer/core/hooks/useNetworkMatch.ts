import { useEffect, useRef, useState, useMemo } from "react";
import {
  AlternatingTurnsRuleSet,
  ClassicRuleSet,
  Match,
  type GameConfig,
  type GameEngineState,
  type MatchCallbacks,
} from "../../../../core/engine";
import { getShipCellsFromShip } from "../../../../core/tools/ship/calculations";
import type { Board, PlayerRole, Shot } from "../../../../core/types/common";
import type { GameRoom } from "../types/game/room";
import { roomService } from "../services/room/realtime";

export interface UseNetworkMatchProps extends Partial<MatchCallbacks> {
  room: GameRoom | null;
  playerRole: PlayerRole;
}

const useNetworkMatch = ({
  room,
  playerRole,
  ...callbacks
}: UseNetworkMatchProps) => {
  const [gameState, setGameState] = useState<GameEngineState | null>(null);
  const match = useRef<Match | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!room || !room.initialState) return;

    const config: Partial<GameConfig> = room.gameConfig || {};
    const ruleSetName = room.ruleSet || "ClassicRuleSet";

    const ruleSet = {
      ClassicRuleSet,
      AlternatingTurnsRuleSet,
    }[ruleSetName];

    const newMatch = new Match(
      config,
      {
        ...callbacks,
        onStateChange: (state) => {
          setGameState(state);
          callbacks?.onStateChange?.(state);
        },
        onGameOver: (result) => {
          callbacks?.onGameOver?.(result);
          roomService
            .endGame(room.id)
            .catch((error) => {
              console.error("Error ending game:", error);
            })
            .catch((error) => {
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
        onPhaseChange: (phase) => {
          callbacks?.onPhaseChange?.(phase);
          roomService
            .updateCurrentPhase(room.id, phase)
            .catch((error) => {
              console.error("Error updating current phase:", error);
            });
        },
      },
      ruleSet,
    );

    const playerShips =
      playerRole === "host"
        ? room.initialState.playerShips || []
        : room.initialState.enemyShips || [];

    const enemyShips =
      playerRole === "host"
        ? room.initialState.enemyShips || []
        : room.initialState.playerShips || [];

    const initialTurn =
      room.initialTurn === playerRole ? "PLAYER_TURN" : "ENEMY_TURN";

    newMatch.initializeMatch(playerShips, enemyShips, initialTurn);

    match.current = newMatch;
    setGameState(newMatch.getState());
  }, [room?.id]);

  useEffect(() => {
    if (!room || !match.current || !gameState) return;

    const opponentShots: Shot[] =
      playerRole === "host" ? room.guestShots || [] : room.hostShots || [];

    const currentEnemyShots = gameState.enemyShots || [];
    const newOpponentShots = opponentShots.slice(currentEnemyShots.length);

    if (newOpponentShots.length > 0 && !isSyncingRef.current) {
      isSyncingRef.current = true;

      for (const shot of newOpponentShots) {
        match.current.executeShot(shot.x, shot.y, false);
      }

      isSyncingRef.current = false;
    }
  }, [room?.hostShots, room?.guestShots, gameState]);

  const executeShot = async (x: number, y: number) => {
    if (!match.current || !room || !gameState) return;
    if (!gameState.isPlayerTurn) return;
    if (gameState.isGameOver) return;
    if (room.currentTurn !== playerRole) return;

    const result = match.current.executeShot(x, y, true);

    if (!result.success) return;

    const currentPlayerShots = gameState.playerShots || [];
    const newShot: Shot = {
      x,
      y,
      hit: result.hit || false,
      ...(result.shipId !== undefined &&
        result.shipId >= 0 && { shipId: result.shipId }),
    };

    const updatedShots = [...currentPlayerShots, newShot];

    const cleanShots = (shots: Shot[]) =>
      shots.map((shot) => {
        const cleaned: Shot = { x: shot.x, y: shot.y, hit: shot.hit };
        if (shot.shipId !== undefined) {
          cleaned.shipId = shot.shipId;
        }
        return cleaned;
      });

    try {
      const shotsUpdate =
        playerRole === "host"
          ? {
              hostShots: cleanShots(updatedShots),
              guestShots: cleanShots(room.guestShots || []),
            }
          : {
              hostShots: cleanShots(room.hostShots || []),
              guestShots: cleanShots(updatedShots),
            };

      await roomService.updateGameStateShots(room.id, shotsUpdate);
    } catch (error) {
      console.error("Error updating shots:", error);
    }
  };

  const playerBoard = useMemo<Board | null>(() => {
    if (!gameState) return null;

    const board: Board = Array.from({ length: gameState.boardHeight }, () =>
      Array(gameState.boardWidth).fill("EMPTY"),
    );

    for (const ship of gameState.playerShips) {
      const cells = getShipCellsFromShip(ship);
      for (const [x, y] of cells) {
        if (
          x >= 0 &&
          x < gameState.boardWidth &&
          y >= 0 &&
          y < gameState.boardHeight
        ) {
          board[y][x] = "SHIP";
        }
      }
    }

    for (const shot of gameState.enemyShots) {
      if (
        shot.x >= 0 &&
        shot.x < gameState.boardWidth &&
        shot.y >= 0 &&
        shot.y < gameState.boardHeight
      ) {
        board[shot.y][shot.x] = shot.hit ? "HIT" : "MISS";
      }
    }

    return board;
  }, [gameState]);

  const enemyBoard = useMemo<Board | null>(() => {
    if (!gameState) return null;

    const board: Board = Array.from({ length: gameState.boardHeight }, () =>
      Array(gameState.boardWidth).fill("EMPTY"),
    );

    for (const shot of gameState.playerShots) {
      if (
        shot.x >= 0 &&
        shot.x < gameState.boardWidth &&
        shot.y >= 0 &&
        shot.y < gameState.boardHeight
      ) {
        board[shot.y][shot.x] = shot.hit ? "HIT" : "MISS";
      }
    }

    return board;
  }, [gameState]);

  return {
    gameState,
    playerBoard,
    enemyBoard,
    executeShot,
    match: match.current,
  };
};

export default useNetworkMatch;
