import type { BoardViewConfig } from "../../../types/config";
import { createEntitySet } from "../../../tools/constants";

export const BOARD_DEFAULT_WIDTH = 7;
export const BOARD_DEFAULT_HEIGHT = 7;

export const StandardBoardView = Object.freeze({
  id: "standard",
  title: "StandardBoardView",
  description: "Normal gameplay: own board fully visible, enemy ships hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["playerShips", "enemyShots"] as const,
  enemySide: ["enemyObstacles", "playerShots", "collectedItems"] as const,
} satisfies BoardViewConfig);

export const DebugBoardView = Object.freeze({
  id: "debug",
  title: "DebugBoardView",
  description: "Debug view: all entities visible on both sides",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: [
    "playerShips",
    "enemyShots",
    "enemyObstacles",
    "collectedItems",
  ] as const,
  enemySide: [
    "enemyObstacles",
    "playerShots",
    "collectedItems",
    "playerShips",
  ] as const,
} satisfies BoardViewConfig);

export const BoardViewSet = createEntitySet<BoardViewConfig>(
  [StandardBoardView, DebugBoardView],
  StandardBoardView.title,
);

export const BOARD_VIEWS = BoardViewSet.map;
export const getBoardView = BoardViewSet.getById;
export const DEFAULT_BOARD_VIEW = BoardViewSet.default;

export const withView = (
  overrides: Partial<BoardViewConfig>,
  base: BoardViewConfig = DEFAULT_BOARD_VIEW,
): BoardViewConfig => ({ ...base, ...overrides });
