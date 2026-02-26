import type { MatchRuleSet } from "./rulesets";
import type { BoardLayer } from "./board";
import type { GameEntity } from "./entities";
export type { BoardLayer } from "./board";

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
export interface BoardViewConfig extends Omit<GameEntity, "id"> {
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

  /**
   * Number of each ship variant to place per board at game start.
   * Keys match `ShipTemplate.id` values in `SHIP_TEMPLATES`.
   * Omit individual keys to exclude that variant; set to `{}` to play with no ships.
   */
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

  /**
   * IDs of shot patterns available to **both** players.
   * References keys from `SHOT_PATTERNS` in `constants/shots.ts`.
   * Omit to fall back to `GAME_CONSTANTS.SHOTS.DEFAULT_PATTERN_IDS` (single-shot only).
   * Use separate `playerShotPatternIds` / `enemyShotPatternIds` (on `GameSetup`)
   * when asymmetric loadouts are required.
   *
   * @example ["single", "cross", "horizontal-line"]
   */
  shotPatternIds?: string[];

  /**
   * Turn and game-over rules to apply for this configuration.
   * Defaults to `ClassicRuleSet` (alternating turns, first to sink all ships wins)
   * when omitted. Pass a custom `MatchRuleSet` to override the default behaviour.
   */
  ruleSet?: MatchRuleSet;
}
