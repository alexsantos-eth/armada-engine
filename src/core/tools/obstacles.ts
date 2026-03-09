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

/**
 * Generates a position along the border of the board.
 * Creates more interesting irregular shapes on non-square boards.
 * 
 * @param width - Width of the obstacle
 * @param height - Height of the obstacle
 * @param boardWidth - Width of the game board
 * @param boardHeight - Height of the game board
 * @returns Coordinates [x, y] positioned on one of the four board edges
 */
export function generateBorderPosition(
  width: number,
  height: number,
  boardWidth: number,
  boardHeight: number,
): [number, number] {
  const maxX = boardWidth - width;
  const maxY = boardHeight - height;

  const border = Math.floor(Math.random() * 4);

  let x: number, y: number;

  switch (border) {
    case 0: 
      x = Math.floor(Math.random() * (maxX + 1));
      y = 0;
      break;
    case 1: 
      x = maxX;
      y = Math.floor(Math.random() * (maxY + 1));
      break;
    case 2: 
      x = Math.floor(Math.random() * (maxX + 1));
      y = maxY;
      break;
    case 3:
    default:
      x = 0;
      y = Math.floor(Math.random() * (maxY + 1));
      break;
  }

  return [x, y];
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

    const useBorderPlacement = Math.random() < 0.8;
    
    let x: number, y: number;
    if (useBorderPlacement) {
      [x, y] = generateBorderPosition(width, height, boardWidth, boardHeight);
    } else {
      x = Math.floor(Math.random() * (maxX + 1));
      y = Math.floor(Math.random() * (maxY + 1));
    }

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

  const borders: Array<[number, number]> = [];
  
  for (let x = 0; x <= boardWidth - width; x++) {
    borders.push([x, 0]); // Bottom
    borders.push([x, boardHeight - height]); 
  }
  
  for (let y = 1; y < boardHeight - height; y++) {
    borders.push([0, y]);
    borders.push([boardWidth - width, y]); 
  }
  
  for (let i = borders.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [borders[i], borders[j]] = [borders[j], borders[i]];
  }
  
  for (const [x, y] of borders) {
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
