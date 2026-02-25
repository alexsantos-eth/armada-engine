import type { MatchRuleSet } from "../engine";
import type { PlayerName } from "./common";

export interface GameConfig {
  boardWidth: number;
  boardHeight: number;

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

  initialTurn: PlayerName | "random";
  ruleSet?: MatchRuleSet;
}
