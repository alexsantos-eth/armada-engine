import { GAME_CONSTANTS } from "../constants/game";
import { OBSTACLE_TEMPLATES } from "../constants/obstacles";
import type { GameShip, GameItem, GameObstacle } from "../types/entities";
import type { GameConfig } from "../types/config";
import { BOARD_DEFAULT_HEIGHT, BOARD_DEFAULT_WIDTH } from "../constants/views";
import { getShip2DCells, getShipCellsFromShip } from "./ships";
import { getItemCells } from "./items";

export function getObstacleCellsFromObstacle(
  obstacle: GameObstacle,
): [number, number][] {
  const [x, y] = obstacle.coords;
  return getShip2DCells(x, y, obstacle.width, obstacle.height);
}

export function generateObstacle(
  template: GameObstacle & { width: number; height: number },
  boardWidth: number,
  boardHeight: number,
  existingShips: GameShip[],
  existingItems: GameItem[],
  existingObstacles: GameObstacle[],
  obstacleId: number,
): GameObstacle | null {
  const maxAttempts = GAME_CONSTANTS.OBSTACLES.MAX_PLACEMENT_ATTEMPTS;
  const { width, height } = template;

  // Build a set of all occupied cells (ships + items + existing obstacles).
  const occupied = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  for (const ship of existingShips) {
    for (const [sx, sy] of getShipCellsFromShip(ship)) {
      occupied.add(key(sx, sy));
    }
  }
  for (const item of existingItems) {
    for (const [ix, iy] of getItemCells(item)) {
      occupied.add(key(ix, iy));
    }
  }
  for (const obs of existingObstacles) {
    for (const [ox, oy] of getObstacleCellsFromObstacle(obs)) {
      occupied.add(key(ox, oy));
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const maxX = boardWidth - width;
    const maxY = boardHeight - height;
    if (maxX < 0 || maxY < 0) return null;

    const x = Math.floor(Math.random() * (maxX + 1));
    const y = Math.floor(Math.random() * (maxY + 1));

    let valid = true;
    outer: for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if (occupied.has(key(x + col, y + row))) {
          valid = false;
          break outer;
        }
      }
    }

    if (valid) {
      return { coords: [x, y], width, height, obstacleId };
    }
  }

  return null;
}

export function generateObstacles(
  config: Partial<GameConfig>,
  existingShips: GameShip[],
  existingItems: GameItem[],
): GameObstacle[] {
  const obstacles: GameObstacle[] = [];
  const boardWidth = config.boardView?.width ?? BOARD_DEFAULT_WIDTH;
  const boardHeight = config.boardView?.height ?? BOARD_DEFAULT_HEIGHT;
  const counts =
    config.obstacleCounts ?? GAME_CONSTANTS.OBSTACLES.DEFAULT_COUNTS;

  for (const [name, count] of Object.entries(counts)) {
    const template = OBSTACLE_TEMPLATES[name];
    if (!template) continue;

    for (let i = 0; i < count; i++) {
      const obstacle = generateObstacle(
        template,
        boardWidth,
        boardHeight,
        existingShips,
        existingItems,
        obstacles,
        obstacles.length,
      );

      if (obstacle) {
        obstacles.push(obstacle);
      }
    }
  }

  return obstacles;
}
