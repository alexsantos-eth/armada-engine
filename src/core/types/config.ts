import type { MatchRuleSet } from "../engine";

/**
 * All renderable data layers that can appear on either side of the board.
 *
 * - `playerShips`     – the player's own ships
 * - `playerItems`     – items placed on the player's board
 * - `playerObstacles` – obstacles on the player's board
 * - `enemyShips`      – enemy ships (normally hidden)
 * - `enemyItems`      – items placed on the enemy's board
 * - `enemyObstacles`  – obstacles on the enemy's board
 * - `playerShots`     – shots fired by the player (shown on the enemy board)
 * - `enemyShots`      – shots fired by the enemy (shown on the player board)
 * - `collectedItems`  – items that have been fully collected
 */
export type BoardLayer =
  | "playerShips"
  | "playerItems"
  | "playerObstacles"
  | "enemyShips"
  | "enemyItems"
  | "enemyObstacles"
  | "playerShots"
  | "enemyShots"
  | "collectedItems";

/**
 * Visual / display configuration for the game board.
 *
 * Separates presentation concerns (what to render and at what size) from the
 * game-logic config ({@link GameConfig}).
 *
 * `width` and `height` are optional: when omitted the consumer should fall
 * back to the game's `boardWidth` / `boardHeight`.
 *
 * Named presets are provided in `boardviews.ts` and follow the same
 * convention as {@link MatchRuleSet}: a `name`, a `description`, and a
 * `getBoardViewByName` registry function.
 */
export interface BoardViewConfig {
  /**
   * Unique identifier for this view configuration.
   * Used by `getBoardViewByName` to look up a preset by name.
   */
  name: string;
  /** Human-readable description of what this view configuration shows. */
  description: string;
  /** Number of columns on the board. Single source of truth for board width. */
  width: number;
  /** Number of rows on the board. Single source of truth for board height. */
  height: number;
  /**
   * Layers rendered on the **player's own board** (the side where the enemy shoots).
   * @example ["playerShips", "playerItems", "playerObstacles", "enemyShots"]
   */
  playerSide: BoardLayer[];
  /**
   * Layers rendered on the **enemy's board** (the side the player attacks).
   * @example ["playerShots", "enemyItems", "enemyObstacles", "collectedItems"]
   */
  enemySide: BoardLayer[];
}

export interface GameConfig {
  /**
   * Visual display configuration for the board.
   * Carries board dimensions (`width`, `height`) and the layer visibility
   * for each side.  Use {@link StandardBoardView}
   */
  boardView: BoardViewConfig;

  shipCounts: Record<string, number>;

  /**
   * Number of each item variant to place per board.
   * Keys match `ItemTemplate.id` values in `ITEM_TEMPLATES`.
   * Omit or set to `{}` to play without items.
   */
  itemCounts: Record<string, number>;

  /**
   * Number of each obstacle variant to place per board.
   * Keys match `ObstacleTemplate.id` values in `OBSTACLE_TEMPLATES`.
   * Omit or set to `{}` to play without obstacles.
   */
  obstacleCounts: Record<string, number>;

  ruleSet?: MatchRuleSet;
}
