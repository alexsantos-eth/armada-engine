import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolvePerspective } from "./perspective";
import type { GameEngineState, IGameEngine } from "../types/engine";
import type { GameShip, GameItem, GameObstacle } from "../types/entities";
import type { Shot } from "../types/shots";

function createMockState(overrides?: Partial<GameEngineState>): GameEngineState {
  return {
    playerShips: [{ coords: [0, 0], width: 2, height: 1, shipId: 0 }],
    enemyShips: [{ coords: [5, 5], width: 1, height: 1, shipId: 0 }],
    playerShots: [{ x: 5, y: 5, hit: true }],
    enemyShots: [{ x: 0, y: 0, hit: true }],
    playerItems: [{ coords: [1, 1], part: 1, itemId: 0 }],
    enemyItems: [{ coords: [6, 6], part: 1, itemId: 0 }],
    playerCollectedItems: [0],
    enemyCollectedItems: [],
    playerUsedItems: [],
    enemyUsedItems: [],
    playerObstacles: [{ coords: [3, 3], width: 1, height: 1, obstacleId: 0 }],
    enemyObstacles: [{ coords: [8, 8], width: 1, height: 1, obstacleId: 0 }],
    playerShotPatterns: [],
    enemyShotPatterns: [],
    isGameOver: false,
    winner: null,
    boardWidth: 10,
    boardHeight: 10,
    shotCount: 2,
    areAllPlayerShipsDestroyed: false,
    areAllEnemyShipsDestroyed: false,
    ...overrides,
  };
}

function createMockEngine(): IGameEngine {
  return {
    getState: vi.fn(),
    getVersion: vi.fn(),
    isCellShot: vi.fn(),
    isShipDestroyed: vi.fn(),
    areAllShipsDestroyed: vi.fn(),
    isItemUsed: vi.fn(),
    getPlayerShips: vi.fn(),
    getEnemyShips: vi.fn(),
    getPlayerShots: vi.fn(),
    getEnemyShots: vi.fn(),
    getPlayerObstacles: vi.fn(),
    getEnemyObstacles: vi.fn(),
    getPlayerShotPatterns: vi.fn(),
    getEnemyShotPatterns: vi.fn(),
    getShotCount: vi.fn(),
    getWinner: vi.fn(),
    getBoardDimensions: vi.fn(),
    isValidPosition: vi.fn(),
    getShotAtPosition: vi.fn(),
    hasShipAtPosition: vi.fn(),
    hasObstacleAtPosition: vi.fn(),
    getGameMode: vi.fn(),
    initializeGame: vi.fn(),
    resetGame: vi.fn(),
    setBoardDimensions: vi.fn(),
    executeShotPattern: vi.fn(),
    setGameOver: vi.fn(),
    setPlayerShips: vi.fn(),
    setEnemyShips: vi.fn(),
    setPlayerItems: vi.fn(),
    setEnemyItems: vi.fn(),
    setPlayerShots: vi.fn(),
    setEnemyShots: vi.fn(),
    setPlayerObstacles: vi.fn(),
    setEnemyObstacles: vi.fn(),
    setPlayerShotPatterns: vi.fn(),
    setEnemyShotPatterns: vi.fn(),
    markItemUsed: vi.fn(),
  } as unknown as IGameEngine;
}

describe("resolvePerspective", () => {
  let state: GameEngineState;
  let engine: IGameEngine;

  beforeEach(() => {
    state = createMockState();
    engine = createMockEngine();
  });

  describe("swap=false (player perspective)", () => {
    it("should map own fields to player fields", () => {
      const p = resolvePerspective(state, engine, false);

      expect(p.ownShips).toBe(state.playerShips);
      expect(p.opponentShips).toBe(state.enemyShips);
      expect(p.ownItems).toBe(state.playerItems);
      expect(p.opponentItems).toBe(state.enemyItems);
      expect(p.ownCollectedItems).toBe(state.playerCollectedItems);
      expect(p.opponentCollectedItems).toBe(state.enemyCollectedItems);
      expect(p.ownShots).toBe(state.playerShots);
      expect(p.opponentShots).toBe(state.enemyShots);
    });

    it("should map own obstacles to player obstacles", () => {
      const p = resolvePerspective(state, engine, false);

      expect(p.ownObstacles).toEqual(state.playerObstacles);
      expect(p.opponentObstacles).toEqual(state.enemyObstacles);
    });

    it("should delegate setOwnShips to setPlayerShips", () => {
      const p = resolvePerspective(state, engine, false);
      const ships: GameShip[] = [{ coords: [1, 1], width: 1, height: 1, shipId: 0 }];
      p.setOwnShips(ships);
      expect(engine.setPlayerShips).toHaveBeenCalledWith(ships);
    });

    it("should delegate setOpponentShips to setEnemyShips", () => {
      const p = resolvePerspective(state, engine, false);
      const ships: GameShip[] = [];
      p.setOpponentShips(ships);
      expect(engine.setEnemyShips).toHaveBeenCalledWith(ships);
    });

    it("should delegate all setters to player/enemy engine methods", () => {
      const p = resolvePerspective(state, engine, false);

      const items: GameItem[] = [];
      p.setOwnItems(items);
      expect(engine.setPlayerItems).toHaveBeenCalledWith(items);

      p.setOpponentItems(items);
      expect(engine.setEnemyItems).toHaveBeenCalledWith(items);

      const shots: Shot[] = [];
      p.setOwnShots(shots);
      expect(engine.setPlayerShots).toHaveBeenCalledWith(shots);

      p.setOpponentShots(shots);
      expect(engine.setEnemyShots).toHaveBeenCalledWith(shots);

      const obstacles: GameObstacle[] = [];
      p.setOwnObstacles(obstacles);
      expect(engine.setPlayerObstacles).toHaveBeenCalledWith(obstacles);

      p.setOpponentObstacles(obstacles);
      expect(engine.setEnemyObstacles).toHaveBeenCalledWith(obstacles);
    });
  });

  describe("swap=true (enemy perspective)", () => {
    it("should map own fields to enemy fields", () => {
      const p = resolvePerspective(state, engine, true);

      expect(p.ownShips).toBe(state.enemyShips);
      expect(p.opponentShips).toBe(state.playerShips);
      expect(p.ownItems).toBe(state.enemyItems);
      expect(p.opponentItems).toBe(state.playerItems);
      expect(p.ownCollectedItems).toBe(state.enemyCollectedItems);
      expect(p.opponentCollectedItems).toBe(state.playerCollectedItems);
      expect(p.ownShots).toBe(state.enemyShots);
      expect(p.opponentShots).toBe(state.playerShots);
    });

    it("should map own obstacles to enemy obstacles", () => {
      const p = resolvePerspective(state, engine, true);

      expect(p.ownObstacles).toEqual(state.enemyObstacles);
      expect(p.opponentObstacles).toEqual(state.playerObstacles);
    });

    it("should delegate setOwnShips to setEnemyShips", () => {
      const p = resolvePerspective(state, engine, true);
      const ships: GameShip[] = [];
      p.setOwnShips(ships);
      expect(engine.setEnemyShips).toHaveBeenCalledWith(ships);
    });

    it("should delegate setOpponentShips to setPlayerShips", () => {
      const p = resolvePerspective(state, engine, true);
      const ships: GameShip[] = [];
      p.setOpponentShips(ships);
      expect(engine.setPlayerShips).toHaveBeenCalledWith(ships);
    });

    it("should delegate all setters to swapped engine methods", () => {
      const p = resolvePerspective(state, engine, true);

      const items: GameItem[] = [];
      p.setOwnItems(items);
      expect(engine.setEnemyItems).toHaveBeenCalledWith(items);

      p.setOpponentItems(items);
      expect(engine.setPlayerItems).toHaveBeenCalledWith(items);

      const shots: Shot[] = [];
      p.setOwnShots(shots);
      expect(engine.setEnemyShots).toHaveBeenCalledWith(shots);

      p.setOpponentShots(shots);
      expect(engine.setPlayerShots).toHaveBeenCalledWith(shots);

      const obstacles: GameObstacle[] = [];
      p.setOwnObstacles(obstacles);
      expect(engine.setEnemyObstacles).toHaveBeenCalledWith(obstacles);

      p.setOpponentObstacles(obstacles);
      expect(engine.setPlayerObstacles).toHaveBeenCalledWith(obstacles);
    });
  });

  describe("edge cases", () => {
    it("should default obstacles to empty array when undefined in state", () => {
      const stateNoObstacles = createMockState({
        playerObstacles: undefined as unknown as import("../types/entities").GameObstacle[],
        enemyObstacles: undefined as unknown as import("../types/entities").GameObstacle[],
      });

      const p = resolvePerspective(stateNoObstacles, engine, false);
      expect(p.ownObstacles).toEqual([]);
      expect(p.opponentObstacles).toEqual([]);
    });

    it("should default obstacles to empty array when undefined in swapped state", () => {
      const stateNoObstacles = createMockState({
        playerObstacles: undefined as unknown as import("../types/entities").GameObstacle[],
        enemyObstacles: undefined as unknown as import("../types/entities").GameObstacle[],
      });

      const p = resolvePerspective(stateNoObstacles, engine, true);
      expect(p.ownObstacles).toEqual([]);
      expect(p.opponentObstacles).toEqual([]);
    });
  });
});
