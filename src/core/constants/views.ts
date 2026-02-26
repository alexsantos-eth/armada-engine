import type { BoardViewConfig } from "../types/config";
import { createEntitySet } from "../tools/constants";

export const BOARD_DEFAULT_WIDTH = 5;
export const BOARD_DEFAULT_HEIGHT = 5;

export const StandardBoardView: BoardViewConfig = {
  id: "standard",
  title: "StandardBoardView",
  description: "Normal gameplay: own board fully visible, enemy ships hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["playerShips", "playerObstacles", "enemyShots"],
  enemySide: ["enemyItems", "enemyObstacles", "playerShots", "collectedItems"],
};

export const FogOfWarBoardView: BoardViewConfig = {
  id: "fog-of-war",
  title: "FogOfWarBoardView",
  description:
    "Only shot outcomes visible — ships, items and obstacles are hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["enemyShots"],
  enemySide: ["playerShots"],
};

export const DebugBoardView: BoardViewConfig = {
  id: "debug",
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
  id: "spectator",
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

export const BoardViewSet = createEntitySet<BoardViewConfig>([
  StandardBoardView,
  FogOfWarBoardView,
  DebugBoardView,
  SpectatorBoardView,
], StandardBoardView.title);

export const BOARD_VIEWS = BoardViewSet.map;
export const getBoardView = BoardViewSet.getById;
export const DEFAULT_BOARD_VIEW = BoardViewSet.default;

export const withView = (
  overrides: Partial<BoardViewConfig>,
  base: BoardViewConfig = DEFAULT_BOARD_VIEW,
): BoardViewConfig => ({ ...base, ...overrides });
