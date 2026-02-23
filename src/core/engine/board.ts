import { getShipCellsFromShip } from "../tools/ship/calculations";
import type { GameEngineState } from "./logic";
import type { Board, Cell } from "../types/common";

/**
 * Builds the **player's own board** for UI rendering.
 *
 * Shows the player's ships and marks every cell the enemy has fired upon
 * (HIT / MISS). Ships that were hit on a collected-item cell are shown as
 * MISS so item cells don't bleed through.
 *
 * Extracted from `GameEngine` so the engine has no presentation concerns.
 * Consumes a plain {@link GameEngineState} snapshot — no live engine reference
 * is needed.
 *
 * @param state - Current engine snapshot (from `engine.getState()`).
 * @returns A 2-D grid of {@link Cell} objects, indexed as `board[y][x]`.
 */
export function buildPlayerBoard(state: GameEngineState): Board {
  const { boardWidth, boardHeight, playerShips, enemyShots } = state;

  const board: Board = Array.from({ length: boardHeight }, () =>
    Array.from({ length: boardWidth }, (): Cell => ({ state: "EMPTY" })),
  );

  for (const ship of playerShips) {
    for (const [x, y] of getShipCellsFromShip(ship)) {
      if (x >= 0 && x < boardWidth && y >= 0 && y < boardHeight) {
        board[y][x] = { state: "SHIP" };
      }
    }
  }

  for (const shot of enemyShots) {
    if (
      shot.x >= 0 &&
      shot.x < boardWidth &&
      shot.y >= 0 &&
      shot.y < boardHeight
    ) {
      const cellState = shot.collected ? "MISS" : shot.hit ? "HIT" : "MISS";
      board[shot.y][shot.x] = { state: cellState, shot };
    }
  }

  return board;
}

/**
 * Builds the **enemy board** for UI rendering (the board the player attacks).
 *
 * Enemy ships are hidden — only item cells and shots fired by the player are
 * shown. Collected items are marked as COLLECTED.
 *
 * Extracted from `GameEngine` so the engine has no presentation concerns.
 * Consumes a plain {@link GameEngineState} snapshot — no live engine reference
 * is needed.
 *
 * @param state - Current engine snapshot (from `engine.getState()`).
 * @returns A 2-D grid of {@link Cell} objects, indexed as `board[y][x]`.
 */
export function buildEnemyBoard(state: GameEngineState): Board {
  const {
    boardWidth,
    boardHeight,
    playerShots,
    enemyItems,
    playerCollectedItems,
  } = state;

  const board: Board = Array.from({ length: boardHeight }, () =>
    Array.from({ length: boardWidth }, (): Cell => ({ state: "EMPTY" })),
  );

  const collectedSet = new Set(playerCollectedItems);
  enemyItems.forEach((item, itemId) => {
    const [startX, y] = item.coords;
    for (let i = 0; i < item.part; i++) {
      const cx = startX + i;
      if (cx >= 0 && cx < boardWidth && y >= 0 && y < boardHeight) {
        board[y][cx] = {
          state: collectedSet.has(itemId) ? "COLLECTED" : "ITEM",
        };
      }
    }
  });

  for (const shot of playerShots) {
    if (
      shot.x >= 0 &&
      shot.x < boardWidth &&
      shot.y >= 0 &&
      shot.y < boardHeight
    ) {
      const cellState = shot.collected
        ? "COLLECTED"
        : shot.hit
          ? "HIT"
          : "MISS";
      board[shot.y][shot.x] = { state: cellState, shot };
    }
  }

  return board;
}
