import { describe, expect, it } from "vitest";
import { buildPlayerBoard, buildEnemyBoard } from "./board";
import type { GameEngineState } from "../types/engine";
import type { BoardViewConfig } from "../types/config";
import type { GameShip, GameItem, GameObstacle } from "../types/entities";
import type { Shot } from "../types/shots";
import type { Cell } from "../types/board";

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

function createMockState(): GameEngineState {
  return {
    boardWidth: 10,
    boardHeight: 10,
    playerShips: [{ coords: [1, 1], width: 2, height: 1, shipId: 0 }] as GameShip[],
    enemyShips: [{ coords: [8, 8], width: 1, height: 1, shipId: 0 }] as GameShip[],
    playerItems: [{ coords: [3, 3], part: 2, itemId: 0 }] as GameItem[],
    enemyItems: [{ coords: [6, 6], part: 1, itemId: 0 }] as GameItem[],
    playerObstacles: [{ coords: [0, 0], width: 1, height: 1, obstacleId: 0 }] as GameObstacle[],
    enemyObstacles: [{ coords: [9, 9], width: 1, height: 1, obstacleId: 0 }] as GameObstacle[],
    playerCollectedItems: [0],
    enemyCollectedItems: [],
    playerUsedItems: [],
    enemyUsedItems: [],
    playerShots: [
      { x: 8, y: 8, hit: true, shipId: 0 },
      { x: 9, y: 9, hit: false, obstacleHit: true, obstacleId: 0 },
      { x: 6, y: 6, hit: false, collected: true, itemId: 0, itemFullyCollected: true },
      { x: 7, y: 7, hit: false }, // Miss
    ] as Shot[],
    enemyShots: [
      { x: 1, y: 1, hit: true, shipId: 0 },
      { x: 0, y: 0, hit: false, obstacleHit: true, obstacleId: 0 },
      { x: 3, y: 3, hit: false, collected: true, itemId: 0 },
      { x: 2, y: 2, hit: false }, // Miss
    ] as Shot[],
    playerShotPatterns: [],
    enemyShotPatterns: [],
    isGameOver: false,
    winner: null,
    shotCount: 8,
    areAllPlayerShipsDestroyed: false,
    areAllEnemyShipsDestroyed: false,
  };
}

// Convert top-left (x, y) to board array index (row is from bottom)
function getCell(board: Cell[][], x: number, y: number, height: number = 10) {
  return board[height - 1 - y][x];
}

describe("Board Projection", () => {
  describe("buildPlayerBoard", () => {
    it("should build a board with all layers enabled", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      const view: BoardViewConfig = {
        id: "test",
        title: "Test",
        description: "",
        width: 10,
        height: 10,
        playerSide: [
          "playerShips", "playerItems", "playerObstacles",
          "enemyShips", "enemyItems", "enemyObstacles",
          "playerShots", "enemyShots", "collectedItems"
        ],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);

      // Player Ships (unhit portions)
      expect(getCell(board, 2, 1).state).toBe("SHIP");

      // Player Items (Not collected by enemy)
      expect(getCell(board, 4, 3).state).toBe("ITEM");

      // Player Obstacles
      expect(getCell(board, 0, 0).state).toBe("OBSTACLE");

      // Enemy Ships (if there were unhit portions, they'd be here)

      // Enemy Items (Collected by player)
      expect(getCell(board, 6, 6).state).toBe("COLLECTED");

      // Enemy Obstacles
      expect(getCell(board, 9, 9).state).toBe("OBSTACLE");

      // Player Shots
      expect(getCell(board, 8, 8).state).toBe("HIT");
      expect(getCell(board, 9, 9).state).toBe("OBSTACLE");
      expect(getCell(board, 6, 6).state).toBe("COLLECTED");
      expect(getCell(board, 7, 7).state).toBe("MISS");

      // Enemy Shots
      expect(getCell(board, 1, 1).state).toBe("HIT");
      expect(getCell(board, 0, 0).state).toBe("OBSTACLE");
      expect(getCell(board, 3, 3).state).toBe("MISS"); // collected by enemy implies MISS for enemy shot UI on player board
      expect(getCell(board, 2, 2).state).toBe("MISS");
    });

    it("should hide collected items if collectedItems layer is missing", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      const view: BoardViewConfig = {
        id: "test",
        title: "Test",
        description: "",
        width: 10,
        height: 10,
        playerSide: ["enemyItems"],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(getCell(board, 6, 6).state).toBe("ITEM"); // Would be COLLECTED if layer was present
    });

    it("should prevent obstacles from overwriting existing cells", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      // Put player obstacle on top of player ship
      state.playerObstacles = [{ coords: [1, 1], width: 1, height: 1, obstacleId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerShips", "playerObstacles"], enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(getCell(board, 1, 1).state).toBe("SHIP"); // Ship was written first
    });

    it("should handle out of bounds shots gracefully", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerShots = [{ x: 99, y: 99, hit: false }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerShots"], enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(board.length).toBe(10);
    });

    it("should fallback to default game mode layers and state dimensions if view config not fully provided", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      // Only pass empty view to force fallback to DEFAULT_GAME_MODE playerSide and state dims
      const board = buildPlayerBoard(state);
      expect(board.length).toBe(10);
      expect(board[0].length).toBe(10);
    });
  });

  describe("buildEnemyBoard", () => {
    it("should build a board with all enemy layers enabled", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyCollectedItems = [0]; // Enemy collected player item 0
      state.playerCollectedItems = [];

      const view: BoardViewConfig = {
        id: "test",
        title: "Test",
        description: "",
        width: 10,
        height: 10,
        playerSide: [],
        enemySide: [
          "enemyShips", "enemyItems", "enemyObstacles",
          "playerShips", "playerItems", "playerObstacles",
          "playerShots", "enemyShots", "collectedItems"
        ]
      };

      const board = buildEnemyBoard(state, view);

      // Enemy Ships (unhit portions)

      // Enemy Obstacles
      expect(getCell(board, 9, 9).state).toBe("OBSTACLE");

      // Enemy Items (Not collected by player) - covered by other tests since 6,6 is shot

      // Player Ships (unhit portions)

      // Player Items (Collected by enemy)
      expect(getCell(board, 3, 3).state).toBe("COLLECTED");
      expect(getCell(board, 4, 3).state).toBe("COLLECTED");

      // Player Obstacles
      expect(getCell(board, 0, 0).state).toBe("OBSTACLE");

      // Player Shots (enemy perspective)
      expect(getCell(board, 8, 8).state).toBe("HIT");
      expect(getCell(board, 9, 9).state).toBe("OBSTACLE");
      expect(getCell(board, 6, 6).state).toBe("MISS"); // Overwrites item with MISS on enemy board

      // Enemy Shots (enemy perspective)
      expect(getCell(board, 1, 1).state).toBe("HIT");
      expect(getCell(board, 0, 0).state).toBe("OBSTACLE");
      expect(getCell(board, 3, 3).state).toBe("COLLECTED");
    });

    it("should fallback to default game mode layers and state dimensions if view config not provided", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      const board = buildEnemyBoard(state);
      expect(board.length).toBe(10);
      expect(board[0].length).toBe(10);
    });

    it("should prevent obstacles from overwriting existing cells", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyObstacles = [{ coords: [8, 8], width: 1, height: 1, obstacleId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [], enemySide: ["enemyShips", "enemyObstacles"]
      };

      const board = buildEnemyBoard(state, view);
      expect(getCell(board, 8, 8).state).toBe("SHIP");
    });

    it("should prevent player obstacles from overwriting existing cells", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerObstacles = [{ coords: [1, 1], width: 1, height: 1, obstacleId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [], enemySide: ["playerShips", "playerObstacles"]
      };

      const board = buildEnemyBoard(state, view);
      expect(getCell(board, 1, 1).state).toBe("SHIP");
    });
    it("should handle undefined obstacle lists", () => {
      const { playerObstacles, enemyObstacles, ...rest } = createMockState();
      const state = rest as unknown as GameEngineState;

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerObstacles", "enemyObstacles"],
        enemySide: ["playerObstacles", "enemyObstacles"]
      };

      const playerBoard = buildPlayerBoard(state, view);
      const enemyBoard = buildEnemyBoard(state, view);
      expect(playerBoard).toBeDefined();
      expect(enemyBoard).toBeDefined();
    });

    it("should map PLAYER shot to COLLECTED if hitting already COLLECTED cell on player board", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyCollectedItems = [0];
      state.playerItems = [{ coords: [3, 3], part: 1, itemId: 0 }];

      state.playerShots = [{ x: 3, y: 3, hit: false }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerItems", "collectedItems", "playerShots"],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(getCell(board, 3, 3).state).toBe("COLLECTED");
    });

    it("should map ENEMY shot to COLLECTED if hitting already COLLECTED cell on enemy board", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerCollectedItems = [0];
      state.enemyItems = [{ coords: [6, 6], part: 1, itemId: 0 }];

      state.enemyShots = [{ x: 6, y: 6, hit: false }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [],
        enemySide: ["enemyItems", "collectedItems", "enemyShots"]
      };

      const board = buildEnemyBoard(state, view);
      expect(getCell(board, 6, 6).state).toBe("COLLECTED");
    });

    it("should render ITEM if not collected on player board", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyCollectedItems = [];
      state.playerItems = [{ coords: [3, 3], part: 1, itemId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerItems", "collectedItems"],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(getCell(board, 3, 3).state).toBe("ITEM");
    });

    it("should render ITEM if not collected on enemy board (enemyItems)", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerCollectedItems = [];
      state.enemyItems = [{ coords: [6, 6], part: 1, itemId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [],
        enemySide: ["enemyItems", "collectedItems"]
      };

      const board = buildEnemyBoard(state, view);
      expect(getCell(board, 6, 6).state).toBe("ITEM");
    });

    it("should render ITEM if not collected on enemy board (playerItems)", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyCollectedItems = [];
      state.playerItems = [{ coords: [3, 3], part: 1, itemId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [],
        enemySide: ["playerItems", "collectedItems"]
      };

      const board = buildEnemyBoard(state, view);
      expect(getCell(board, 3, 3).state).toBe("ITEM");
    });

    it("should handle out of bounds shots on enemy board (playerShots)", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerShots = [{ x: 99, y: 99, hit: false }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [],
        enemySide: ["playerShots"]
      };

      const board = buildEnemyBoard(state, view);
      expect(board.length).toBe(10);
    });

    it("should handle out of bounds shots on enemy board (enemyShots)", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyShots = [{ x: 99, y: 99, hit: false }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: [],
        enemySide: ["enemyShots"]
      };

      const board = buildEnemyBoard(state, view);
      expect(board.length).toBe(10);
    });

    it("should ignore out of bounds items/ships (setBoardCell return false)", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerShips = [{ coords: [-1, -1], width: 1, height: 1, shipId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerShips"],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(board).toBeDefined();
    });

    it("should prevent enemy obstacles from overwriting existing cells on player board", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.playerShips = [{ coords: [1, 1], width: 1, height: 1, shipId: 0 }];
      state.enemyObstacles = [{ coords: [1, 1], width: 1, height: 1, obstacleId: 0 }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["playerShips", "enemyObstacles"],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(getCell(board, 1, 1).state).toBe("SHIP"); // Should not be OBSTACLE
    });

    it("should handle out of bounds enemyShots on player board", () => {
      const state = createMockState() as Mutable<GameEngineState>;
      state.enemyShots = [{ x: 99, y: 99, hit: false }];

      const view: BoardViewConfig = {
        id: "test", title: "Test", description: "", width: 10, height: 10,
        playerSide: ["enemyShots"],
        enemySide: []
      };

      const board = buildPlayerBoard(state, view);
      expect(board.length).toBe(10);
    });
  });
});
