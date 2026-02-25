import type { IGameEngine } from "./logic";
import { resolvePerspective } from "./perspective";
import { findFreeShipPosition } from "../tools/ship/calculations";
import type {
  GameItem,
  GameShip,
  ItemActionContext,
  Shot,
} from "../types/common";
import type { GameTurn } from "../types/common";

/**
 * Internal shared builder for `ItemActionContext`.
 *
 * All player↔enemy field mapping is delegated to {@link resolvePerspective}
 * (perspective.ts). Adding a new game resource to the context only requires
 * updating `SidePerspective` and `resolvePerspective` — this function does
 * not need to change (OCP).
 *
 * @param swapPerspective - When `true` and `isPlayerShot` is `false`, all
 *   player↔enemy setters and readers are swapped so that item handlers
 *   are always written from the **collector's / activator's perspective**.
 */
function buildContext(
  engine: IGameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  shot: Shot | undefined,
  swapPerspective: boolean,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (ruleSet: unknown) => void,
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
    setPlayerShips: p.setOwnShips,
    setEnemyShips: p.setOpponentShips,
    setPlayerItems: p.setOwnItems,
    setEnemyItems: p.setOpponentItems,
    setPlayerShots: p.setOwnShots,
    setEnemyShots: p.setOpponentShots,
    toggleTurn: () => onToggleTurn(),
    addShip: (width = 1, height = 1, preferred) => {
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
      };
      fresh.setOwnShips(fresh.ownShips.concat([newShip]));
      return true;
    },
    setRuleSet: (ruleSet: unknown) => captureRuleSet?.(ruleSet),
  };
}

/**
 * Builds an `ItemActionContext` for the `executeAttack` action (`onCollect` handlers).
 *
 * Perspective is always the **shooter's** — `ctx.playerShips` refers to the
 * side that fired the shot, `ctx.enemyShips` refers to the opponent.
 * The triggered `shot` is included in the context.
 *
 * @param captureRuleSet - Called when the handler invokes `ctx.setRuleSet()`.
 *   The machine action captures the value in its own context instead of
 *   writing it into the engine, keeping `GameEngine` free of machine-flow state.
 */
export function buildCollectContext(
  engine: IGameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  shot: Shot,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
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
  );
}

/**
 * Builds an `ItemActionContext` for the `useItem` action (`onUse` handlers).
 *
 * Perspective is always the **activator's** — regardless of which side owns
 * the item, `ctx.playerShips` always means "my ships" and
 * `ctx.enemyShips` always means "opponent's ships".
 * No shot is associated (items can be used outside of a shot cycle).
 *
 * @param captureRuleSet - Called when the handler invokes `ctx.setRuleSet()`.
 */
export function buildUseContext(
  engine: IGameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
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
  );
}
