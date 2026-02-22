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

  initialTurn: PlayerName | "random";
}
