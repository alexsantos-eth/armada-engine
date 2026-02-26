import type { GameItem, GameShip, GameObstacle, GameEntity } from "./entities";

/**
 * An item template — extends `GameItem` with display metadata and a
 * `defaultCount` that controls how many of this variant appear per board
 * in a default game. Add new variants in `constants/items.ts` and the
 * rest of the engine picks them up automatically.
 */
export interface ItemTemplate extends GameItem, GameObject {}

/**
 * A ship template — extends `GameShip` with display metadata and a
 * `defaultCount` for how many of this variant appear in a default game.
 * Add new variants in `constants/ships.ts` and the engine picks them up
 * automatically.
 */
export interface ShipTemplate extends GameShip, GameObject {}

/**
 * An obstacle template — extends `GameObstacle` with display metadata and
 * a `defaultCount` for how many of this variant are placed per board in a
 * default game. Add new variants in `constants/obstacles.ts`.
 */
export interface ObstacleTemplate extends GameObstacle, GameObject {}

/**
 * A game object template — extends `GameEntity` with a `defaultCount` for how many of this variant are placed per board in a default game. This is a
 * base type for all templates (ships, items, obstacles) and is used in some
 * contexts where we want to treat them uniformly.
 * Add new variants in the relevant constants file (`constants/ships.ts`,
 * `constants/items.ts`, `constants/obstacles.ts`).
 */
export interface GameObject extends GameEntity {
  /** How many of this variant are placed per board in a default game. */
  defaultCount: number;
}