import type { IGameEngine } from "./logic";
import { resolvePerspective } from "./perspective";
import { findFreeShipPosition } from "../tools/ships";
import { generateItem } from "../tools/items";
import { generateObstacle } from "../tools/obstacles";
import type {
  GameItem,
  GameObstacle,
  GameShip,
  ItemActionContext,
  ShipActionContext,
  Shot,
  BoardLayer,
} from "../types/common";
import type { GameTurn } from "../types/common";

function buildContext(
  engine: IGameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  shot: Shot | undefined,
  swapPerspective: boolean,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (ruleSet: unknown) => void,
  captureBoardViewPlayerSide?: (layers: BoardLayer[]) => void,
  captureBoardViewEnemySide?: (layers: BoardLayer[]) => void,
): ItemActionContext {
  const state = engine.getState();
  const swap = swapPerspective && !isPlayerShot;
  const p = resolvePerspective(state, engine, swap);

  return {
    item,
    isPlayerShot,
    shot,
    currentTurn,
    playerShips: p.ownShips,
    enemyShips: p.opponentShips,
    playerItems: p.ownItems,
    enemyItems: p.opponentItems,
    playerCollectedItems: p.ownCollectedItems,
    enemyCollectedItems: p.opponentCollectedItems,
    playerShots: p.ownShots,
    enemyShots: p.opponentShots,
    boardWidth: state.boardWidth,
    boardHeight: state.boardHeight,
    playerObstacles: p.ownObstacles,
    enemyObstacles: p.opponentObstacles,
    addPlayerShip: (width = 1, height = 1, preferred, onDestroy) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const currentState = engine.getState();
      const coords = findFreeShipPosition(
        width,
        height,
        fresh.ownShips,
        fresh.opponentShots,
        currentState.boardWidth,
        currentState.boardHeight,
        preferred,
      );
      if (!coords) return false;
      const newShip: GameShip = {
        coords,
        shipId: fresh.ownShips.length,
        width,
        height,
        onDestroy,
      };
      fresh.setOwnShips(fresh.ownShips.concat([newShip]));
      return true;
    },
    deletePlayerShip: (shipId) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.ownShips.filter((s) => s.shipId !== shipId);
      if (filtered.length === fresh.ownShips.length) return false;
      fresh.setOwnShips(filtered.map((s, idx) => ({ ...s, shipId: idx })));
      return true;
    },
    deleteAllPlayerShips: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOwnShips([]);
    },
    addEnemyShip: (width = 1, height = 1, preferred, onDestroy) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const currentState = engine.getState();
      const coords = findFreeShipPosition(
        width,
        height,
        fresh.opponentShips,
        fresh.ownShots,
        currentState.boardWidth,
        currentState.boardHeight,
        preferred,
      );
      if (!coords) return false;
      const newShip: GameShip = {
        coords,
        shipId: fresh.opponentShips.length,
        width,
        height,
        onDestroy,
      };
      fresh.setOpponentShips(fresh.opponentShips.concat([newShip]));
      return true;
    },
    deleteEnemyShip: (shipId) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.opponentShips.filter((s) => s.shipId !== shipId);
      if (filtered.length === fresh.opponentShips.length) return false;
      fresh.setOpponentShips(filtered.map((s, idx) => ({ ...s, shipId: idx })));
      return true;
    },
    deleteAllEnemyShips: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOpponentShips([]);
    },
    addPlayerItem: (template) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const currentState = engine.getState();
      const placed = generateItem(
        template,
        currentState.boardWidth,
        currentState.boardHeight,
        fresh.ownShips,
        fresh.ownItems,
        fresh.ownItems.length,
        template.templateId,
      );
      if (!placed) return false;
      fresh.setOwnItems(fresh.ownItems.concat([placed]));
      return true;
    },
    deletePlayerItem: (itemId) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.ownItems.filter((it) => it.itemId !== itemId);
      if (filtered.length === fresh.ownItems.length) return false;
      fresh.setOwnItems(filtered.map((it, idx) => ({ ...it, itemId: idx })));
      return true;
    },
    deleteAllPlayerItems: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOwnItems([]);
    },
    addEnemyItem: (template) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const currentState = engine.getState();
      const placed = generateItem(
        template,
        currentState.boardWidth,
        currentState.boardHeight,
        fresh.opponentShips,
        fresh.opponentItems,
        fresh.opponentItems.length,
        template.templateId,
      );
      if (!placed) return false;
      fresh.setOpponentItems(fresh.opponentItems.concat([placed]));
      return true;
    },
    deleteEnemyItem: (itemId) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.opponentItems.filter((it) => it.itemId !== itemId);
      if (filtered.length === fresh.opponentItems.length) return false;
      fresh.setOpponentItems(
        filtered.map((it, idx) => ({ ...it, itemId: idx })),
      );
      return true;
    },
    deleteAllEnemyItems: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOpponentItems([]);
    },
    addPlayerShot: (shot) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOwnShots(fresh.ownShots.concat([shot]));
    },
    deletePlayerShot: (x, y) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.ownShots.filter((s) => s.x !== x || s.y !== y);
      if (filtered.length === fresh.ownShots.length) return false;
      fresh.setOwnShots(filtered);
      return true;
    },
    deleteAllPlayerShots: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOwnShots([]);
    },
    addEnemyShot: (shot) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOpponentShots(fresh.opponentShots.concat([shot]));
    },
    deleteEnemyShot: (x, y) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.opponentShots.filter(
        (s) => s.x !== x || s.y !== y,
      );
      if (filtered.length === fresh.opponentShots.length) return false;
      fresh.setOpponentShots(filtered);
      return true;
    },
    deleteAllEnemyShots: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOpponentShots([]);
    },
    addPlayerObstacle: (template) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const currentState = engine.getState();
      const placed = generateObstacle(
        template as GameObstacle & { width: number; height: number },
        currentState.boardWidth,
        currentState.boardHeight,
        fresh.ownShips,
        fresh.ownItems,
        fresh.ownObstacles,
        fresh.ownObstacles.length,
      );
      if (!placed) return false;
      fresh.setOwnObstacles(fresh.ownObstacles.concat([placed]));
      return true;
    },
    deletePlayerObstacle: (obstacleId) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.ownObstacles.filter(
        (o) => o.obstacleId !== obstacleId,
      );
      if (filtered.length === fresh.ownObstacles.length) return false;
      fresh.setOwnObstacles(
        filtered.map((o, idx) => ({ ...o, obstacleId: idx })),
      );
      return true;
    },
    deleteAllPlayerObstacles: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOwnObstacles([]);
    },
    addEnemyObstacle: (template) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const currentState = engine.getState();
      const placed = generateObstacle(
        template as GameObstacle & { width: number; height: number },
        currentState.boardWidth,
        currentState.boardHeight,
        fresh.opponentShips,
        fresh.opponentItems,
        fresh.opponentObstacles,
        fresh.opponentObstacles.length,
      );
      if (!placed) return false;
      fresh.setOpponentObstacles(fresh.opponentObstacles.concat([placed]));
      return true;
    },
    deleteEnemyObstacle: (obstacleId) => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      const filtered = fresh.opponentObstacles.filter(
        (o) => o.obstacleId !== obstacleId,
      );
      if (filtered.length === fresh.opponentObstacles.length) return false;
      fresh.setOpponentObstacles(
        filtered.map((o, idx) => ({ ...o, obstacleId: idx })),
      );
      return true;
    },
    deleteAllEnemyObstacles: () => {
      const fresh = resolvePerspective(engine.getState(), engine, swap);
      fresh.setOpponentObstacles([]);
    },
    setBoardViewPlayerSide: (layers) => captureBoardViewPlayerSide?.(layers),
    setBoardViewEnemySide: (layers) => captureBoardViewEnemySide?.(layers),
    toggleTurn: () => onToggleTurn(),
    setRuleSet: (ruleSet: unknown) => captureRuleSet?.(ruleSet),
  };
}

export function buildCollectContext(
  engine: IGameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  shot: Shot,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
  captureBoardViewPlayerSide?: (layers: BoardLayer[]) => void,
  captureBoardViewEnemySide?: (layers: BoardLayer[]) => void,
): ItemActionContext {
  return buildContext(
    engine,
    item,
    isPlayerShot,
    shot,
    false,
    currentTurn,
    onToggleTurn,
    captureRuleSet,
    captureBoardViewPlayerSide,
    captureBoardViewEnemySide,
  );
}

export function buildUseContext(
  engine: IGameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
  captureBoardViewPlayerSide?: (layers: BoardLayer[]) => void,
  captureBoardViewEnemySide?: (layers: BoardLayer[]) => void,
): ItemActionContext {
  return buildContext(
    engine,
    item,
    isPlayerShot,
    undefined,
    true,
    currentTurn,
    onToggleTurn,
    captureRuleSet,
    captureBoardViewPlayerSide,
    captureBoardViewEnemySide,
  );
}

export function buildDestroyContext(
  engine: IGameEngine,
  ship: GameShip,
  isPlayerShot: boolean,
  shot: Shot,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
  captureBoardViewPlayerSide?: (layers: BoardLayer[]) => void,
  captureBoardViewEnemySide?: (layers: BoardLayer[]) => void,
): ShipActionContext {
  const dummyItem: GameItem = { coords: ship.coords, part: 1 };
  const { item: _item, ...rest } = buildContext(
    engine,
    dummyItem,
    isPlayerShot,
    shot,
    true,
    currentTurn,
    onToggleTurn,
    captureRuleSet,
    captureBoardViewPlayerSide,
    captureBoardViewEnemySide,
  );
  return { ...rest, ship };
}
