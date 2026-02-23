import { useEffect, useRef, useState } from "react";
import {
  GameInitializer,
  Match,
  SINGLE_SHOT,
  getRuleSetByName,
  type GameConfig,
  type GameEngineState,
  type MatchCallbacks,
  type PlayerRole,
  type Shot,
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

const cleanShots = (shots: Shot[]): Shot[] =>
  shots.map((shot) => {
    const cleaned: Shot = { x: shot.x, y: shot.y, hit: shot.hit };
    if (shot.shipId !== undefined) cleaned.shipId = shot.shipId;
    if (shot.patternId !== undefined) {
      cleaned.patternId = shot.patternId;
      cleaned.patternCenterX = shot.patternCenterX;
      cleaned.patternCenterY = shot.patternCenterY;
    }
    return cleaned;
  });

const rehydrateItems = (items: GameItem[]): GameItem[] =>
  items.map((item) => {
    const template = item.templateId ? ITEM_TEMPLATES[item.templateId] : undefined;
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
  const isSyncingRef = useRef(false);
  const appliedOpponentShotsRef = useRef(0);
  const appliedEnemyItemUsesRef = useRef(0);

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
    });

    newMatch.initializeMatch();

    match.current = newMatch;
    appliedOpponentShotsRef.current = 0;
    appliedEnemyItemUsesRef.current = 0;
    setGameState(newMatch.getState());
  }, [room?.id]);

  useEffect(() => {
    if (!room || !match.current || !gameState) return;

    const opponentShots: Shot[] =
      playerRole === "host" ? room.guestShots || [] : room.hostShots || [];

    const newOpponentShots = opponentShots.slice(appliedOpponentShotsRef.current);

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

      appliedOpponentShotsRef.current = opponentShots.length;
      isSyncingRef.current = false;
    }
  }, [room?.hostShots, room?.guestShots]);

  useEffect(() => {
    if (!room || !match.current) return;

    const opponentItemUses: { itemId: number }[] =
      playerRole === "host"
        ? room.guestItemUses || []
        : room.hostItemUses || [];

    const newItemUses = opponentItemUses.slice(appliedEnemyItemUsesRef.current);

    if (newItemUses.length > 0) {
      for (const { itemId } of newItemUses) {
        match.current.useItem(itemId, false);
      }
      appliedEnemyItemUsesRef.current = opponentItemUses.length;
    }
  }, [room?.hostItemUses, room?.guestItemUses]);

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

  const useItem = async (itemId: number) => {
    if (!match.current || !room || !gameState) return;
    if (!gameState.isPlayerTurn) return;
    if (gameState.isGameOver) return;
    if (room.currentTurn !== playerRole) return;

    const used = match.current.useItem(itemId, true);
    if (!used) return;

    const newState = match.current.getState();

    const currentItemUses =
      playerRole === "host"
        ? room.hostItemUses || []
        : room.guestItemUses || [];

    const updatedItemUses = [...currentItemUses, { itemId }];

    try {
      const itemUsesUpdate =
        playerRole === "host"
          ? {
              hostItemUses: updatedItemUses,
              guestItemUses: room.guestItemUses || [],
            }
          : {
              hostItemUses: room.hostItemUses || [],
              guestItemUses: updatedItemUses,
            };

      await roomService.updateGameStateItemUses(room.id, itemUsesUpdate);

      const shotsUpdate =
        playerRole === "host"
          ? {
              hostShots: cleanShots(newState.playerShots),
              guestShots: cleanShots(newState.enemyShots),
            }
          : {
              hostShots: cleanShots(newState.enemyShots),
              guestShots: cleanShots(newState.playerShots),
            };

      await roomService.updateGameStateShots(room.id, shotsUpdate);

      const opponentShotsAfter =
        playerRole === "host"
          ? shotsUpdate.guestShots
          : shotsUpdate.hostShots;
      appliedOpponentShotsRef.current = opponentShotsAfter.length;
    } catch (error) {
      console.error("Error updating item uses:", error);
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
    match: match.current,
  };
};

export default useNetworkMatch;
