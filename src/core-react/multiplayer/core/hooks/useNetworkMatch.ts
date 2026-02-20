import { useEffect, useRef, useState, useMemo } from "react";
import {
  AlternatingTurnsRuleSet,
  ClassicRuleSet,
  Match,
  type GameConfig,
  type GameEngineState,
  type MatchCallbacks,
  SINGLE_SHOT,
} from "../../../../core/engine";
import { getShipCellsFromShip } from "../../../../core/tools/ship/calculations";
import type {
  Board,
  PlayerRole,
  Shot,
  ShotPattern,
} from "../../../../core/types/common";
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
          roomService.updateCurrentPhase(room.id, phase).catch((error) => {
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

      const patternGroups = new Map<string, Shot[]>();
      const singleShots: Shot[] = [];

      for (const shot of newOpponentShots) {
        if (
          shot.patternId &&
          shot.patternCenterX !== undefined &&
          shot.patternCenterY !== undefined
        ) {
          const groupKey = `${shot.patternId}-${shot.patternCenterX}-${shot.patternCenterY}`;
          if (!patternGroups.has(groupKey)) {
            patternGroups.set(groupKey, []);
          }
          patternGroups.get(groupKey)!.push(shot);
        } else {
          singleShots.push(shot);
        }
      }

      for (const [, shots] of patternGroups) {
        if (shots.length === 0) continue;

        const firstShot = shots[0];
        const pattern: ShotPattern = {
          id: firstShot.patternId!,
          name: firstShot.patternId!,
          offsets: shots.map((s) => ({
            dx: s.x - firstShot.patternCenterX!,
            dy: s.y - firstShot.patternCenterY!,
          })),
        };

        match.current.planShot(
          firstShot.patternCenterX!,
          firstShot.patternCenterY!,
          pattern,
          false,
        );
        match.current.confirmAttack();
      }

      for (const shot of singleShots) {
        match.current.planAndAttack(shot.x, shot.y, false, SINGLE_SHOT);
      }

      isSyncingRef.current = false;
    }
  }, [room?.hostShots, room?.guestShots, gameState]);

  const executeShot = async (
    x: number,
    y: number,
    pattern: ShotPattern = SINGLE_SHOT,
  ) => {
    if (!match.current || !room || !gameState) return;
    if (!gameState.isPlayerTurn) return;
    if (gameState.isGameOver) return;
    if (room.currentTurn !== playerRole) return;

    const planResult = match.current.planShot(x, y, pattern, true);
    if (!planResult.ready) return;

    const result = match.current.confirmAttack();
    if (!result.success) return;

    const currentPlayerShots = gameState.playerShots || [];

    const newShots: Shot[] = result.shots
      .filter((s) => s.executed)
      .map((s) => ({
        x: s.x,
        y: s.y,
        hit: s.hit || false,
        ...(s.shipId !== undefined && s.shipId >= 0 && { shipId: s.shipId }),
        patternId: pattern.id,
        patternCenterX: x,
        patternCenterY: y,
      }));

    const updatedShots = [...currentPlayerShots, ...newShots];

    const cleanShots = (shots: Shot[]) =>
      shots.map((shot) => {
        const cleaned: Shot = { x: shot.x, y: shot.y, hit: shot.hit };
        if (shot.shipId !== undefined) {
          cleaned.shipId = shot.shipId;
        }
        if (shot.patternId !== undefined) {
          cleaned.patternId = shot.patternId;
          cleaned.patternCenterX = shot.patternCenterX;
          cleaned.patternCenterY = shot.patternCenterY;
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
