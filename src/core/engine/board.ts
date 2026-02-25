import { getShipCellsFromShip, getObstacleCellsFromObstacle } from "../tools/ship/calculations";
import type { GameEngineState } from "./logic";
import type { Board, Cell } from "../types/common";
import type { BoardLayer, BoardViewConfig } from "../types/config";
import { DefaultBoardView } from "../constants/views";

/** Fast membership test for a layer list. */
const has = (layers: BoardLayer[], layer: BoardLayer): boolean =>
  layers.includes(layer);

/** Allocate a blank board of the given dimensions. */
function emptyBoard(width: number, height: number): Board {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Cell => ({ state: "EMPTY" })),
  );
}

/**
 * Builds the **player's own board** for UI rendering.
 *
 * Which layers are painted is controlled by `view.playerSide`.
 * Layers are applied in order: ships → items → obstacles → shots.
 * Shot cells always win over the earlier passes.
 *
 * | Layer             | What it renders                                                        |
 * |-------------------|------------------------------------------------------------------------|
 * | `playerShips`     | Player ship cells → `SHIP`                                            |
 * | `playerItems`     | Items on the player board → `ITEM` / `COLLECTED`                      |
 * | `playerObstacles` | Player obstacle cells → `OBSTACLE`                                    |
 * | `enemyShots`      | Every enemy shot → `HIT` / `MISS` / `OBSTACLE`                        |
 * | `enemyShips`      | Enemy ship cells → `SHIP` (debug/spectator)                           |
 * | `enemyItems`      | Enemy items → `ITEM` / `COLLECTED` (debug/spectator)                  |
 * | `enemyObstacles`  | Enemy obstacle cells → `OBSTACLE` (debug/spectator)                   |
 * | `playerShots`     | Player shots on own board → `HIT` / `MISS` / `OBSTACLE` / `COLLECTED` (debug) |
 * | `collectedItems`  | Qualifies `playerItems` / `enemyItems` to show collected state        |
 *
 * @param state   - Current engine snapshot (`engine.getState()`).
 * @param view    - Optional visual config; falls back to {@link DefaultBoardView}.
 * @returns A 2-D grid of {@link Cell} objects indexed as `board[y][x]`.
 */
export function buildPlayerBoard(
  state: GameEngineState,
  view?: BoardViewConfig,
): Board {
  const layers = view?.playerSide ?? DefaultBoardView.playerSide;
  const width  = view?.width  ?? state.boardWidth;
  const height = view?.height ?? state.boardHeight;

  const board = emptyBoard(width, height);

  if (has(layers, "playerShips")) {
    for (const ship of state.playerShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          board[y][x] = { state: "SHIP" };
        }
      }
    }
  }

  if (has(layers, "playerItems")) {
    const collectedByEnemy = new Set(state.enemyCollectedItems);
    const showCollected = has(layers, "collectedItems");
    state.playerItems.forEach((item, itemId) => {
      const [startX, y] = item.coords;
      for (let i = 0; i < item.part; i++) {
        const cx = startX + i;
        if (cx >= 0 && cx < width && y >= 0 && y < height) {
          board[y][cx] = {
            state:
              showCollected && collectedByEnemy.has(itemId)
                ? "COLLECTED"
                : "ITEM",
          };
        }
      }
    });
  }

  if (has(layers, "playerObstacles")) {
    for (const obstacle of (state.playerObstacles ?? [])) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (x >= 0 && x < width && y >= 0 && y < height && board[y][x].state === "EMPTY") {
          board[y][x] = { state: "OBSTACLE" };
        }
      }
    }
  }

  if (has(layers, "enemyShips")) {
    for (const ship of state.enemyShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          board[y][x] = { state: "SHIP" };
        }
      }
    }
  }

  if (has(layers, "enemyItems")) {
    const collectedSet = new Set(state.playerCollectedItems);
    const showCollected = has(layers, "collectedItems");
    state.enemyItems.forEach((item, itemId) => {
      const [startX, y] = item.coords;
      for (let i = 0; i < item.part; i++) {
        const cx = startX + i;
        if (cx >= 0 && cx < width && y >= 0 && y < height) {
          board[y][cx] = {
            state:
              showCollected && collectedSet.has(itemId) ? "COLLECTED" : "ITEM",
          };
        }
      }
    });
  }

  if (has(layers, "enemyObstacles")) {
    for (const obstacle of (state.enemyObstacles ?? [])) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (x >= 0 && x < width && y >= 0 && y < height && board[y][x].state === "EMPTY") {
          board[y][x] = { state: "OBSTACLE" };
        }
      }
    }
  }

  if (has(layers, "enemyShots")) {
    for (const shot of state.enemyShots) {
      if (shot.x >= 0 && shot.x < width && shot.y >= 0 && shot.y < height) {
        const existingState = board[shot.y][shot.x].state;
        const cellState = shot.collected
          ? "MISS"
          : shot.hit
            ? "HIT"
            : shot.obstacleHit || existingState === "OBSTACLE"
              ? "OBSTACLE"
              : "MISS";
        board[shot.y][shot.x] = { state: cellState, shot };
      }
    }
  }

  if (has(layers, "playerShots")) {
    for (const shot of state.playerShots) {
      if (shot.x >= 0 && shot.x < width && shot.y >= 0 && shot.y < height) {
        const existingState = board[shot.y][shot.x].state;
        const cellState = shot.collected
          ? "COLLECTED"
          : shot.hit
            ? "HIT"
            : shot.obstacleHit || existingState === "OBSTACLE"
              ? "OBSTACLE"
              : existingState === "COLLECTED"
                ? "COLLECTED"
                : "MISS";
        board[shot.y][shot.x] = { state: cellState, shot };
      }
    }
  }

  return board;
}

/**
 * Builds the **enemy board** for UI rendering (the board the player attacks).
 *
 * Which layers are painted is controlled by `view.enemySide`.
 * Layers are applied in order: ships → obstacles → items → shots.
 * Shot cells always win over earlier passes.
 *
 * | Layer            | What it renders                                                         |
 * |------------------|-------------------------------------------------------------------------|
 * | `enemyShips`     | Enemy ship cells → `SHIP` (hidden in standard play)                    |
 * | `enemyObstacles` | Enemy obstacle cells → `OBSTACLE`                                       |
 * | `enemyItems`     | Enemy items → `ITEM`; `COLLECTED` when `collectedItems` ∈ layers        |
 * | `collectedItems` | Qualifies `enemyItems` / `playerItems` to show collected state          |
 * | `playerShots`    | Every player shot → `HIT` / `MISS` / `OBSTACLE` / `COLLECTED`          |
 * | `playerShips`    | Player ship cells → `SHIP` (debug/spectator)                           |
 * | `playerItems`    | Player items → `ITEM` / `COLLECTED` (debug/spectator)                  |
 * | `playerObstacles`| Player obstacle cells → `OBSTACLE` (debug/spectator)                   |
 * | `enemyShots`     | Enemy shots on enemy board → `HIT` / `MISS` / `OBSTACLE` (debug)       |
 *
 * @param state   - Current engine snapshot (`engine.getState()`).
 * @param view    - Optional visual config; falls back to {@link DefaultBoardView}.
 * @returns A 2-D grid of {@link Cell} objects indexed as `board[y][x]`.
 */
export function buildEnemyBoard(
  state: GameEngineState,
  view?: BoardViewConfig,
): Board {
  const layers = view?.enemySide ?? DefaultBoardView.enemySide;
  const width  = view?.width  ?? state.boardWidth;
  const height = view?.height ?? state.boardHeight;

  const board = emptyBoard(width, height);

  if (has(layers, "enemyShips")) {
    for (const ship of state.enemyShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          board[y][x] = { state: "SHIP" };
        }
      }
    }
  }

  if (has(layers, "enemyObstacles")) {
    for (const obstacle of (state.enemyObstacles ?? [])) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          board[y][x] = { state: "OBSTACLE" };
        }
      }
    }
  }

  if (has(layers, "enemyItems")) {
    const collectedSet = new Set(state.playerCollectedItems);
    const showCollected = has(layers, "collectedItems");
    state.enemyItems.forEach((item, itemId) => {
      const [startX, y] = item.coords;
      for (let i = 0; i < item.part; i++) {
        const cx = startX + i;
        if (cx >= 0 && cx < width && y >= 0 && y < height) {
          board[y][cx] = {
            state:
              showCollected && collectedSet.has(itemId) ? "COLLECTED" : "ITEM",
          };
        }
      }
    });
  }

  if (has(layers, "playerShips")) {
    for (const ship of state.playerShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          board[y][x] = { state: "SHIP" };
        }
      }
    }
  }

  if (has(layers, "playerItems")) {
    const collectedByEnemy = new Set(state.enemyCollectedItems);
    const showCollected = has(layers, "collectedItems");
    state.playerItems.forEach((item, itemId) => {
      const [startX, y] = item.coords;
      for (let i = 0; i < item.part; i++) {
        const cx = startX + i;
        if (cx >= 0 && cx < width && y >= 0 && y < height) {
          board[y][cx] = {
            state:
              showCollected && collectedByEnemy.has(itemId)
                ? "COLLECTED"
                : "ITEM",
          };
        }
      }
    });
  }

  if (has(layers, "playerObstacles")) {
    for (const obstacle of (state.playerObstacles ?? [])) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (x >= 0 && x < width && y >= 0 && y < height && board[y][x].state === "EMPTY") {
          board[y][x] = { state: "OBSTACLE" };
        }
      }
    }
  }

  if (has(layers, "playerShots")) {
    for (const shot of state.playerShots) {
      if (shot.x >= 0 && shot.x < width && shot.y >= 0 && shot.y < height) {
        const existingState = board[shot.y][shot.x].state;
        const cellState = shot.collected
          ? "COLLECTED"
          : shot.hit
            ? "HIT"
            : shot.obstacleHit || existingState === "OBSTACLE"
              ? "OBSTACLE"
              : existingState === "COLLECTED"
                ? "COLLECTED"
                : "MISS";
        board[shot.y][shot.x] = { state: cellState, shot };
      }
    }
  }

  if (has(layers, "enemyShots")) {
    for (const shot of state.enemyShots) {
      if (shot.x >= 0 && shot.x < width && shot.y >= 0 && shot.y < height) {
        const existingState = board[shot.y][shot.x].state;
        const cellState = shot.collected
          ? "MISS"
          : shot.hit
            ? "HIT"
            : shot.obstacleHit || existingState === "OBSTACLE"
              ? "OBSTACLE"
              : "MISS";
        board[shot.y][shot.x] = { state: cellState, shot };
      }
    }
  }

  return board;
}

