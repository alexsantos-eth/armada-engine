import { getShipCellsFromShip } from "../tools/ships";
import { getObstacleCellsFromObstacle } from "../tools/obstacles";
import type { GameEngineState } from "./logic";
import type { Board, Cell } from "../types/board";
import type { BoardLayer, BoardViewConfig } from "../types/config";
import { DefaultBoardView } from "../constants/views";

const has = (layers: BoardLayer[], layer: BoardLayer): boolean =>
  layers.includes(layer);

function emptyBoard(width: number, height: number): Board {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Cell => ({ state: "EMPTY" })),
  );
}

export function buildPlayerBoard(
  state: GameEngineState,
  view?: BoardViewConfig,
): Board {
  const layers = view?.playerSide ?? DefaultBoardView.playerSide;
  const width = view?.width ?? state.boardWidth;
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
    for (const obstacle of state.playerObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (
          x >= 0 &&
          x < width &&
          y >= 0 &&
          y < height &&
          board[y][x].state === "EMPTY"
        ) {
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
    for (const obstacle of state.enemyObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (
          x >= 0 &&
          x < width &&
          y >= 0 &&
          y < height &&
          board[y][x].state === "EMPTY"
        ) {
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

export function buildEnemyBoard(
  state: GameEngineState,
  view?: BoardViewConfig,
): Board {
  const layers = view?.enemySide ?? DefaultBoardView.enemySide;
  const width = view?.width ?? state.boardWidth;
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
    for (const obstacle of state.enemyObstacles ?? []) {
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
    for (const obstacle of state.playerObstacles ?? []) {
      for (const [x, y] of getObstacleCellsFromObstacle(obstacle)) {
        if (
          x >= 0 &&
          x < width &&
          y >= 0 &&
          y < height &&
          board[y][x].state === "EMPTY"
        ) {
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
