import { getShipCellsFromShip } from "../tools/ships";
import { getObstacleCellsFromObstacle } from "../tools/obstacles";
import type { GameEngineState } from "./logic";
import type { Board, Cell } from "../types/board";
import type { BoardLayer, BoardViewConfig } from "../types/config";
import { DEFAULT_GAME_MODE } from "../modes";

const has = (layers: BoardLayer[], layer: BoardLayer): boolean =>
  layers.includes(layer);

function emptyBoard(width: number, height: number): Board {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Cell => ({ state: "EMPTY" })),
  );
}

const toBoardRow = (height: number, y: number): number => height - 1 - y;

const getBoardCell = (
  board: Board,
  width: number,
  height: number,
  x: number,
  y: number,
): Cell | null => {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return board[toBoardRow(height, y)][x];
};

const setBoardCell = (
  board: Board,
  width: number,
  height: number,
  x: number,
  y: number,
  cell: Cell,
): boolean => {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  board[toBoardRow(height, y)][x] = cell;
  return true;
};

export function buildPlayerBoard(
  state: GameEngineState,
  view?: BoardViewConfig,
): Board {
  const layers = view?.playerSide ?? DEFAULT_GAME_MODE.boardView.playerSide;
  const width = view?.width ?? state.boardWidth;
  const height = view?.height ?? state.boardHeight;

  const board = emptyBoard(width, height);

  if (has(layers, "playerShips")) {
    for (const ship of state.playerShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        setBoardCell(board, width, height, x, y, { state: "SHIP" });
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
        setBoardCell(board, width, height, cx, y, {
          state:
            showCollected && collectedByEnemy.has(itemId)
              ? "COLLECTED"
              : "ITEM",
        });
      }
    });
  }

  if (has(layers, "playerObstacles")) {
    for (const obstacle of state.playerObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        const existingCell = getBoardCell(board, width, height, x, y);
        if (existingCell?.state === "EMPTY") {
          setBoardCell(board, width, height, x, y, { state: "OBSTACLE" });
        }
      }
    }
  }

  if (has(layers, "enemyShips")) {
    for (const ship of state.enemyShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        setBoardCell(board, width, height, x, y, { state: "SHIP" });
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
        setBoardCell(board, width, height, cx, y, {
          state:
            showCollected && collectedSet.has(itemId) ? "COLLECTED" : "ITEM",
        });
      }
    });
  }

  if (has(layers, "enemyObstacles")) {
    for (const obstacle of state.enemyObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        const existingCell = getBoardCell(board, width, height, x, y);
        if (existingCell?.state === "EMPTY") {
          setBoardCell(board, width, height, x, y, { state: "OBSTACLE" });
        }
      }
    }
  }

  if (has(layers, "enemyShots")) {
    for (const shot of state.enemyShots) {
      const existingCell = getBoardCell(board, width, height, shot.x, shot.y);
      if (!existingCell) continue;

      const cellState = shot.collected
        ? "MISS"
        : shot.hit
          ? "HIT"
          : shot.obstacleHit || existingCell.state === "OBSTACLE"
            ? "OBSTACLE"
            : "MISS";

      setBoardCell(board, width, height, shot.x, shot.y, {
        state: cellState,
        shot,
      });
    }
  }

  if (has(layers, "playerShots")) {
    for (const shot of state.playerShots) {
      const existingCell = getBoardCell(board, width, height, shot.x, shot.y);
      if (!existingCell) continue;

      const cellState = shot.collected
        ? "COLLECTED"
        : shot.hit
          ? "HIT"
          : shot.obstacleHit || existingCell.state === "OBSTACLE"
            ? "OBSTACLE"
            : existingCell.state === "COLLECTED"
              ? "COLLECTED"
              : "MISS";

      setBoardCell(board, width, height, shot.x, shot.y, {
        state: cellState,
        shot,
      });
    }
  }

  return board;
}

export function buildEnemyBoard(
  state: GameEngineState,
  view?: BoardViewConfig,
): Board {
  const layers = view?.enemySide ?? DEFAULT_GAME_MODE.boardView.enemySide;
  const width = view?.width ?? state.boardWidth;
  const height = view?.height ?? state.boardHeight;

  const board = emptyBoard(width, height);

  if (has(layers, "enemyShips")) {
    for (const ship of state.enemyShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        setBoardCell(board, width, height, x, y, { state: "SHIP" });
      }
    }
  }

  if (has(layers, "enemyObstacles")) {
    for (const obstacle of state.enemyObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        setBoardCell(board, width, height, x, y, { state: "OBSTACLE" });
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
        setBoardCell(board, width, height, cx, y, {
          state:
            showCollected && collectedSet.has(itemId) ? "COLLECTED" : "ITEM",
        });
      }
    });
  }

  if (has(layers, "playerShips")) {
    for (const ship of state.playerShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        setBoardCell(board, width, height, x, y, { state: "SHIP" });
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
        setBoardCell(board, width, height, cx, y, {
          state:
            showCollected && collectedByEnemy.has(itemId)
              ? "COLLECTED"
              : "ITEM",
        });
      }
    });
  }

  if (has(layers, "playerObstacles")) {
    for (const obstacle of state.playerObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        const existingCell = getBoardCell(board, width, height, x, y);
        if (existingCell?.state === "EMPTY") {
          setBoardCell(board, width, height, x, y, { state: "OBSTACLE" });
        }
      }
    }
  }

  if (has(layers, "playerShots")) {
    for (const shot of state.playerShots) {
      const existingCell = getBoardCell(board, width, height, shot.x, shot.y);
      if (!existingCell) continue;

      const cellState = shot.collected
        ? "COLLECTED"
        : shot.hit
          ? "HIT"
          : shot.obstacleHit || existingCell.state === "OBSTACLE"
            ? "OBSTACLE"
            : existingCell.state === "COLLECTED"
              ? "COLLECTED"
              : "MISS";

      setBoardCell(board, width, height, shot.x, shot.y, {
        state: cellState,
        shot,
      });
    }
  }

  if (has(layers, "enemyShots")) {
    for (const shot of state.enemyShots) {
      const existingCell = getBoardCell(board, width, height, shot.x, shot.y);
      if (!existingCell) continue;

      const cellState = shot.collected
        ? "MISS"
        : shot.hit
          ? "HIT"
          : shot.obstacleHit || existingCell.state === "OBSTACLE"
            ? "OBSTACLE"
            : "MISS";

      setBoardCell(board, width, height, shot.x, shot.y, {
        state: cellState,
        shot,
      });
    }
  }

  return board;
}
