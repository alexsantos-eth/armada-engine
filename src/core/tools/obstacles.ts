import type { GameShip, GameItem, GameObstacle } from "../types/entities";
import type { GameConfig } from "../types/config";
import type { GameMode } from "../types/modes";
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
  gameMode: GameMode,
): GameObstacle | null {
  const maxAttempts = gameMode.constants.OBSTACLES.MAX_PLACEMENT_ATTEMPTS;
  const { width, height } = template;

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
  gameMode: GameMode,
): GameObstacle[] {
  const obstacles: GameObstacle[] = [];
  const boardWidth = config.boardView?.width ?? gameMode.boardView.width;
  const boardHeight = config.boardView?.height ?? gameMode.boardView.height;
  const counts = config.obstacleCounts ?? gameMode.defaultCounts.obstacleCounts;
  const obstacleTemplates = Object.fromEntries(
    gameMode.obstacles.map(obstacle => [obstacle.id, obstacle])
  );

  for (const [name, count] of Object.entries(counts)) {
    const template = obstacleTemplates[name];
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
        gameMode,
      );

      if (obstacle) {
        obstacles.push(obstacle);
      }
    }
  }

  return obstacles;
}
