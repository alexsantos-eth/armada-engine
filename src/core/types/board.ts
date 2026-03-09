import type { Shot } from "./shots";

/**
 * Exhaustive set of visual states a board cell can occupy throughout a match.
 *
 * Transitions follow the game's shot and collection mechanics:
 * - A cell begins as `"EMPTY"`, `"SHIP"`, `"ITEM"`, or `"OBSTACLE"` during placement.
 * - Firing upon a cell transitions it to `"HIT"` (ship present), `"MISS"` (water or obstacle),
 *   or `"COLLECTED"` (item part acquired).
 *
 * | Value         | Meaning                                                                 |
 * |---------------|-------------------------------------------------------------------------|
 * | `"EMPTY"`     | Water — untouched, no entity present.                                   |
 * | `"SHIP"`      | Occupied by a ship segment that has not been struck yet.                |
 * | `"HIT"`       | Ship segment that was successfully struck.                              |
 * | `"MISS"`      | Fired upon but no ship was present (water or obstacle bounce).          |
 * | `"ITEM"`      | Contains a collectible item part that has not been acquired yet.        |
 * | `"COLLECTED"` | Item part that was acquired by a shot landing on it.                    |
 * | `"OBSTACLE"`  | Indestructible obstacle cell; shots register as misses on impact.       |
 */
export type CellState = "EMPTY" | "SHIP" | "HIT" | "MISS" | "ITEM" | "COLLECTED" | "OBSTACLE";

/**
 * Named data layers composing a full board render.
 *
 * Each member identifies a distinct category of entities rendered on the board.
 * Consumer code (e.g. `useBoard`) uses these keys to request only the layers
 * relevant to the current perspective (player vs. enemy) and game phase.
 *
 * **Player-side layers** (rendered on the local player's board):
 * - `"playerShips"`     — the player's own ship placements.
 * - `"playerItems"`     — collectible items placed on the player's board.
 * - `"playerObstacles"` — immovable obstacles on the player's board.
 * - `"enemyShots"`      — incoming shots fired by the opponent, shown on the player's board.
 *
 * **Enemy-side layers** (rendered on the opponent's board):
 * - `"enemyShips"`      — opponent's ships, typically hidden until hit.
 * - `"enemyItems"`      — collectible items on the opponent's board.
 * - `"enemyObstacles"`  — immovable obstacles on the opponent's board.
 * - `"playerShots"`     — shots fired by the local player, shown on the enemy's board.
 *
 * **Cross-board layers:**
 * - `"collectedItems"`  — items that have been fully acquired by either side.
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
 * Rich representation of a single board cell, pairing its visual classification
 * with the complete metadata of the shot that produced that state.
 *
 * Cells without an associated shot (e.g. unvisited water, unharmed ships, or
 * placed items) carry only `state`; the `shot` field is absent until the cell
 * is fired upon.
 *
 * @example
 * // A cell hit by a pattern shot that sank a ship:
 * const cell: Cell = {
 *   state: "HIT",
 *   shot: { x: 3, y: 5, hit: true, shipId: 2, patternId: 1 },
 * };
 *
 * // An untouched water cell:
 * const empty: Cell = { state: "EMPTY" };
 */
export interface Cell {
  /**
   * Visual classification derived from the last game event that affected this cell.
   * Drives rendering decisions in the UI (color, icon, animation).
   */
  state: CellState;
  /**
   * Complete shot record for the event that last modified this cell.
   * Carries pattern metadata, collection flags, and obstacle-hit indicators
   * that allow the UI to render contextual feedback beyond a plain hit/miss.
   * Absent on cells whose `state` is `"EMPTY"`, `"SHIP"`, `"ITEM"`, or `"OBSTACLE"`.
   */
  shot?: Shot;
}

/**
 * Two-dimensional grid of {@link Cell} objects representing one side of the
 * game board (either the local player's or the opponent's).
 *
 * Coordinates use origin at bottom-left (`x` rightward, `y` upward).
 * The matrix is still indexed as `board[row][col]` from top row to bottom row,
 * so the row index for a coordinate is `row = (boardHeight - 1 - y)`.
 *
 * Prefer this type over a plain `CellState[][]` whenever the consumer needs
 * per-cell shot metadata — for example, to display pattern highlights, sunk-ship
 * overlays, or item-collection animations.
 *
 * @example
 * // Accessing the state of logical coordinate (x=2, y=4):
 * const row = board.length - 1 - 4;
 * const cell = board[row][2];
 * if (cell.state === "HIT" && cell.shot?.shipId !== undefined) {
 *   // render sunk-ship indicator
 * }
 */
export type Board = Cell[][];
