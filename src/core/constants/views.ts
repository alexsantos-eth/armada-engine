import type { BoardViewConfig } from "../types/config";

export const BOARD_DEFAULT_WIDTH = 5;
export const BOARD_DEFAULT_HEIGHT = 5;

export const StandardBoardView: BoardViewConfig = {
  title: "StandardBoardView",
  description: "Normal gameplay: own board fully visible, enemy ships hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["playerShips", "playerObstacles", "enemyShots"],
  enemySide: ["enemyItems", "enemyObstacles", "playerShots", "collectedItems"],
};

export const FogOfWarBoardView: BoardViewConfig = {
  title: "FogOfWarBoardView",
  description:
    "Only shot outcomes visible — ships, items and obstacles are hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["enemyShots"],
  enemySide: ["playerShots"],
};

export const DebugBoardView: BoardViewConfig = {
  title: "DebugBoardView",
  description:
    "All layers visible on both sides, including enemy ships (dev/test only)",
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
  title: "SpectatorBoardView",
  description:
    "Full visibility of all layers on both sides (replay / observer mode)",
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

export const DefaultBoardView = StandardBoardView;

export const getBoardViewByName = (title: string): BoardViewConfig => {
  switch (title) {
    case StandardBoardView.title:
      return StandardBoardView;
    case FogOfWarBoardView.title:
      return FogOfWarBoardView;
    case DebugBoardView.title:
      return DebugBoardView;
    case SpectatorBoardView.title:
      return SpectatorBoardView;
    default:
      return DefaultBoardView;
  }
};

export const withView = (
  overrides: Partial<BoardViewConfig>,
  base: BoardViewConfig = DefaultBoardView,
): BoardViewConfig => ({ ...base, ...overrides });
