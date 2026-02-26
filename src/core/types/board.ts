import type { Shot } from "./shots";

export type CellState = "EMPTY" | "SHIP" | "HIT" | "MISS" | "ITEM" | "COLLECTED" | "OBSTACLE";

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
 * A single cell in a rich board, combining the visual state with the full
 * shot metadata (when the cell has been fired upon).
 */
export interface Cell {
  /** Visual state of the cell (same as the flat Board). */
  state: CellState;
  /**
   * Full shot details when this cell was fired upon.
   * Undefined for cells that have not been shot yet (state "EMPTY", "SHIP", "ITEM").
   */
  shot?: Shot;
}

/**
 * A 2D board where every cell carries both its CellState and the underlying
 * Shot data. Useful for UIs that need to know *how* a cell was hit
 * (e.g. which pattern, which ship was sunk, whether an item was collected…).
 */
export type Board = Cell[][];
