import { GameEngine } from "./logic";
import type { GameItem, ItemActionContext, Shot } from "../types/common";

/**
 * Builds the `ItemActionContext` passed to `onCollect` and `onUse` handlers.
 * Shared by the `useItem` machine action and the `onItemCollected` callback
 * wired in `Match`.
 *
 * This is a pure helper — it has no dependency on XState and is deliberately
 * kept in its own module to avoid coupling the machine file to item-context
 * construction logic.
 *
 * @param swapPerspective - When `true` and `isPlayerShot` is `false`, all
 *   player↔enemy setters and readers are swapped so that item handlers
 *   are always written from the **collector's / activator's perspective**.
 *   This means `ctx.setPlayerShips` always refers to "my ships" and
 *   `ctx.setEnemyShots` always refers to "opponent's shots", regardless
 *   of which side actually fired the shot.
 * @param captureRuleSet - Called when the handler invokes `ctx.setRuleSet()`.
 *   The machine action captures the value in its own context instead of
 *   writing it into the engine, keeping `GameEngine` free of machine-flow state.
 */
export function buildItemActionContext(
  engine: GameEngine,
  item: GameItem,
  isPlayerShot: boolean,
  shot: Shot | undefined,
  swapPerspective = false,
  captureRuleSet?: (ruleSet: unknown) => void,
): ItemActionContext {
  const state = engine.getState();
  const swap = swapPerspective && !isPlayerShot;
  return {
    item,
    isPlayerShot,
    shot,
    currentTurn: state.currentTurn,
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
    toggleTurn: () => engine.toggleTurn(),
    setRuleSet: (ruleSet: unknown) => captureRuleSet?.(ruleSet),
  };
}
