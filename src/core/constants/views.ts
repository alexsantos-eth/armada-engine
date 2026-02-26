import type { BoardViewConfig } from "../types/config";

export const BOARD_DEFAULT_WIDTH = 5;
export const BOARD_DEFAULT_HEIGHT = 5;

export const StandardBoardView: BoardViewConfig = {
  name: "StandardBoardView",
  description: "Normal gameplay: own board fully visible, enemy ships hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["playerShips", "playerObstacles", "enemyShots"],
  enemySide: ["enemyItems", "enemyObstacles", "playerShots", "collectedItems"],
};

export const FogOfWarBoardView: BoardViewConfig = {
  name: "FogOfWarBoardView",
  description: "Only shot outcomes visible — ships, items and obstacles are hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["enemyShots"],
  enemySide: ["playerShots"],
};

export const DebugBoardView: BoardViewConfig = {
  name: "DebugBoardView",
  description: "All layers visible on both sides, including enemy ships (dev/test only)",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
  enemySide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
};

export const SpectatorBoardView: BoardViewConfig = {
  name: "SpectatorBoardView",
  description: "Full visibility of all layers on both sides (replay / observer mode)",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
  enemySide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
};

export const getBoardViewByName = (name: string): BoardViewConfig => {
  switch (name) {
    case StandardBoardView.name:
      return StandardBoardView;
    case FogOfWarBoardView.name:
      return FogOfWarBoardView;
    case DebugBoardView.name:
      return DebugBoardView;
    case SpectatorBoardView.name:
      return SpectatorBoardView;
    default:
      throw new Error(`Unknown board view name: "${name}"`);
  }
};

export const DefaultBoardView = StandardBoardView;

export const withView = (
  overrides: Partial<BoardViewConfig>,
  base: BoardViewConfig = DefaultBoardView,
): BoardViewConfig => ({ ...base, ...overrides });
