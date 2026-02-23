import { GameEngine } from "./logic";
import type { GameItem, ItemActionContext, Shot } from "../types/common";
import type { GameTurn } from "../types/common";

/**
 * Internal shared builder for `ItemActionContext`.
 *
 * @param swapPerspective - When `true` and `isPlayerShot` is `false`, all
 *   player↔enemy setters and readers are swapped so that item handlers
 *   are always written from the **collector's / activator's perspective**.
 */
function buildContext(
  engine: GameEngine,
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
  return {
    item,
    isPlayerShot,
    shot,
    currentTurn,
    playerShips: swap ? state.enemyShips : state.playerShips,
    enemyShips: swap ? state.playerShips : state.enemyShips,
    playerItems: swap ? state.enemyItems : state.playerItems,
    enemyItems: swap ? state.playerItems : state.enemyItems,
    playerCollectedItems: swap ? state.enemyCollectedItems : state.playerCollectedItems,
    enemyCollectedItems: swap ? state.playerCollectedItems : state.enemyCollectedItems,
    playerShots: swap ? state.enemyShots : state.playerShots,
    enemyShots: swap ? state.playerShots : state.enemyShots,
    setPlayerShips: swap
      ? (ships) => engine.setEnemyShips(ships)
      : (ships) => engine.setPlayerShips(ships),
    setEnemyShips: swap
      ? (ships) => engine.setPlayerShips(ships)
      : (ships) => engine.setEnemyShips(ships),
    setPlayerItems: swap
      ? (items) => engine.setEnemyItems(items)
      : (items) => engine.setPlayerItems(items),
    setEnemyItems: swap
      ? (items) => engine.setPlayerItems(items)
      : (items) => engine.setEnemyItems(items),
    setPlayerShots: swap
      ? (shots) => engine.setEnemyShots(shots)
      : (shots) => engine.setPlayerShots(shots),
    setEnemyShots: swap
      ? (shots) => engine.setPlayerShots(shots)
      : (shots) => engine.setEnemyShots(shots),
    toggleTurn: () => onToggleTurn(),
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
  engine: GameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  shot: Shot,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
): ItemActionContext {
  return buildContext(engine, item, isPlayerShot, shot, false, currentTurn, onToggleTurn, captureRuleSet);
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
  engine: GameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  currentTurn: GameTurn,
  onToggleTurn: () => void,
  captureRuleSet?: (rs: unknown) => void,
): ItemActionContext {
  return buildContext(engine, item, isPlayerShot, undefined, true, currentTurn, onToggleTurn, captureRuleSet);
}
