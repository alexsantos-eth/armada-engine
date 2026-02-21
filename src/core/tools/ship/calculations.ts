import { GAME_CONSTANTS } from "../../constants/game";
import { SHIP_TEMPLATES } from "../../constants/ships";
import type { GameShip } from "../../types/common";
import type { GameConfig } from "../../types/config";

/**
 * Generate all cells occupied by a 2D rectangular ship.
 * @param x - Top-left X coordinate
 * @param y - Top-left Y coordinate
 * @param width - Number of columns (≥ 1)
 * @param height - Number of rows (≥ 1)
 */
export function getShip2DCells(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number][] {
  const cells: [number, number][] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells.push([x + col, y + row]);
    }
  }
  return cells;
}

export function getShipCellsFromShip(ship: GameShip): [number, number][] {
  const [x, y] = ship.coords;
  return getShip2DCells(x, y, ship.width, ship.height);
}

/**
 * Total number of cells occupied by a ship (width × height).
 */
export function getShipSize(ship: GameShip): number {
  return ship.width * ship.height;
}

export function isValidShipPlacement(
  ship: GameShip,
  existingShips: GameShip[],
  boardWidth: number,
  boardHeight: number,
): boolean {
  const shipCells = getShipCellsFromShip(ship);

  for (const [x, y] of shipCells) {
    if (x < 0 || x >= boardWidth || y < 0 || y >= boardHeight) {
      return false;
    }
  }

  for (const existingShip of existingShips) {
    const existingCells = getShipCellsFromShip(existingShip);

    for (const [shipX, shipY] of shipCells) {
      for (const [existingX, existingY] of existingCells) {
        const distance = Math.max(
          Math.abs(shipX - existingX),
          Math.abs(shipY - existingY),
        );
        if (distance < GAME_CONSTANTS.SHIPS.MIN_DISTANCE) {
          return false;
        }
      }
    }
  }

  return true;
}

export function generateShip(
  template: GameShip,
  boardWidth: number,
  boardHeight: number,
  existingShips: GameShip[],
): GameShip | null {
  const maxAttempts = GAME_CONSTANTS.SHIPS.MAX_PLACEMENT_ATTEMPTS;

  const quadrantPreferences = getQuadrantPreferences(
    template.width * template.height,
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rotate =
      template.width !== template.height &&
      Math.random() <
        GAME_CONSTANTS.GAME_LOGIC.SHIP_GENERATION.ORIENTATION_RANDOM_THRESHOLD;

    const width  = rotate ? template.height : template.width;
    const height = rotate ? template.width  : template.height;
  
    const shipSize = Math.max(width, height);
    const orientation = width >= height ? "horizontal" : "vertical";

    let coords: [number, number];

    if (Math.random() < 0.7 && existingShips.length > 0) {
      coords = generatePositionInPreferredQuadrant(
        shipSize,
        orientation,
        quadrantPreferences,
        boardWidth,
        boardHeight,
      );
    } else {
      coords = generateRandomPosition(
        shipSize,
        orientation,
        boardWidth,
        boardHeight,
      );
    }

    const ship: GameShip = {
      coords,
      width,
      height,
      shipId: existingShips.length,
    };

    if (isValidShipPlacement(ship, existingShips, boardWidth, boardHeight)) {
      return ship;
    }
  }

  return null;
}

export function getQuadrantPreferences(totalCells: number): number[][] {
  if (totalCells <= 2) return [[0, 1], [2, 3]];
  if (totalCells === 3) return [[1, 2], [0, 3]];
  if (totalCells === 4) return [[0, 2], [1, 3]];
  return [[0, 1, 2, 3]]; 
}

export function generatePositionInPreferredQuadrant(
  shipSize: number,
  orientation: "horizontal" | "vertical",
  quadrantPreferences: number[][],
  boardWidth: number,
  boardHeight: number,
): [number, number] {
  const targetQuadrant =
    quadrantPreferences[Math.floor(Math.random() * quadrantPreferences.length)];
  const quadrant =
    targetQuadrant[Math.floor(Math.random() * targetQuadrant.length)];

  const quadrantSize = Math.floor(
    Math.max(boardWidth, boardHeight) /
      GAME_CONSTANTS.GAME_LOGIC.SHIP_GENERATION.QUADRANT_SIZE_DIVISOR,
  );
  const xMin = Math.floor((quadrant % 2) * quadrantSize);
  const yMin = Math.floor(Math.floor(quadrant / 2) * quadrantSize);
  const xMax = Math.floor(xMin + quadrantSize - 1);
  const yMax = Math.floor(yMin + quadrantSize - 1);

  let x: number, y: number;

  if (orientation === "horizontal") {
    x =
      Math.floor(
        Math.random() * (Math.min(xMax, boardWidth - shipSize) - xMin + 1),
      ) + xMin;
    y = Math.floor(Math.random() * (yMax - yMin + 1)) + yMin;
  } else {
    x = Math.floor(Math.random() * (xMax - xMin + 1)) + xMin;
    y =
      Math.floor(
        Math.random() * (Math.min(yMax, boardHeight - shipSize) - yMin + 1),
      ) + yMin;
  }

  return [Math.floor(x), Math.floor(y)];
}

export function generateRandomPosition(
  shipSize: number,
  orientation: "horizontal" | "vertical",
  boardWidth: number,
  boardHeight: number,
): [number, number] {
  let x: number, y: number;

  if (orientation === "horizontal") {
    x = Math.floor(Math.random() * (boardWidth - shipSize + 1));
    y = Math.floor(Math.random() * boardHeight);
  } else {
    x = Math.floor(Math.random() * boardWidth);
    y = Math.floor(Math.random() * (boardHeight - shipSize + 1));
  }

  return [Math.floor(x), Math.floor(y)];
}

/**
 * Generate a random valid position for a 2D rectangular ship.
 * @param width - Number of columns
 * @param height - Number of rows
 * @returns Placed GameShip or null if no valid position found within max attempts
 */
export function generateShip2D(
  width: number,
  height: number,
  boardWidth: number,
  boardHeight: number,
  existingShips: GameShip[],
): GameShip | null {
  const maxAttempts = GAME_CONSTANTS.SHIPS.MAX_PLACEMENT_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.floor(Math.random() * (boardWidth - width + 1));
    const y = Math.floor(Math.random() * (boardHeight - height + 1));

    const ship: GameShip = {
      coords: [x, y],
      width,
      height,
      shipId: existingShips.length,
    };

    if (isValidShipPlacement(ship, existingShips, boardWidth, boardHeight)) {
      return ship;
    }
  }

  return null;
}

export function generateShips(config: Partial<GameConfig>): GameShip[] {
  const ships: GameShip[] = [];
  const templateNames = Object.keys(SHIP_TEMPLATES) as (keyof typeof SHIP_TEMPLATES)[];

  for (const name of templateNames) {
    const count = config.shipCounts?.[name] ?? 0;
    const template = SHIP_TEMPLATES[name];

    for (let i = 0; i < count; i++) {
      const ship = generateShip(
        template,
        config.boardWidth ?? GAME_CONSTANTS.BOARD.DEFAULT_WIDTH,
        config.boardHeight ?? GAME_CONSTANTS.BOARD.DEFAULT_HEIGHT,
        ships,
      );

      if (ship) {
        ships.push(ship);
      }
    }
  }

  return ships;
}
