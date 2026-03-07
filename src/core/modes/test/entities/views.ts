import type { BoardViewConfig } from "../../../types/config";

/**
 * Test mode board view - configurable for tests
 */

export const TestBoardView = Object.freeze({
  id: "test",
  title: "TestBoardView",
  description: "Board view for testing",
  width: 5,
  height: 5,
  playerSide: ["playerShips", "enemyShots"] as const,
  enemySide: ["enemyObstacles", "playerShots", "collectedItems"] as const,
} satisfies BoardViewConfig);
