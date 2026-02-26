import type { GameItem } from "./common";
import type { GameShip } from "./common";
import type { GameObstacle } from "./common";

/**
 * An item template — extends `GameItem` with display metadata and a
 * `defaultCount` that controls how many of this variant appear per board
 * in a default game. Add new variants in `constants/items.ts` and the
 * rest of the engine picks them up automatically.
 */
export interface ItemTemplate extends GameItem {
  /** Unique string identifier for the item variant. */
  id: string;
  /** Human-readable name. */
  title: string;
  /** Description of the item and any effect it grants when collected. */
  description?: string;
  /** How many of this variant are placed in a default game. */
  defaultCount: number;
}

/**
 * A ship template — extends `GameShip` with display metadata and a
 * `defaultCount` for how many of this variant appear in a default game.
 * Add new variants in `constants/ships.ts` and the engine picks them up
 * automatically.
 */
export interface ShipTemplate extends GameShip {
  /** Unique identifier for the ship variant. */
  id: string;
  /** Human-readable name. */
  title: string;
  /** Description of the ship variant. */
  description?: string;
  /** How many of this variant are placed in a default game. */
  defaultCount: number;
}

/**
 * An obstacle template — extends `GameObstacle` with display metadata and
 * a `defaultCount` for how many of this variant are placed per board in a
 * default game. Add new variants in `constants/obstacles.ts`.
 */
export interface ObstacleTemplate extends GameObstacle {
  /** Unique string identifier for the obstacle variant. */
  id: string;
  /** Human-readable name. */
  title: string;
  /** Description of the obstacle. */
  description?: string;
  /** How many of this variant are placed per board in a default game. */
  defaultCount: number;
}
