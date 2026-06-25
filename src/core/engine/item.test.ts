import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildCollectContext, buildUseContext, buildDestroyContext } from "./item";
import { GameEngine } from "./logic";
import type { GameShip, GameItem, GameObstacle } from "../types/entities";
import type { Shot } from "../types/shots";
import type { BoardViewConfig } from "../types/config";
import * as itemsTools from "../tools/items";
import * as obstaclesTools from "../tools/obstacles";
import * as shipsTools from "../tools/ships";

const testBoardView: BoardViewConfig = {
  id: "test-board",
  title: "TestBoard",
  description: "Test board configuration",
  width: 10,
  height: 10,
  playerSide: ["playerShips", "enemyShots"],
  enemySide: ["enemyObstacles", "playerShots", "collectedItems"],
};

describe("Item Context Builders", () => {
  let engine: GameEngine;
  let playerShips: GameShip[];
  let enemyShips: GameShip[];
  let playerItems: GameItem[];
  let enemyItems: GameItem[];

  beforeEach(() => {
    engine = new GameEngine({ boardView: testBoardView });

    playerShips = [
      { coords: [0, 0], width: 2, height: 1, shipId: 0 },
    ];
    enemyShips = [
      { coords: [5, 5], width: 2, height: 1, shipId: 0 },
    ];
    playerItems = [
      { coords: [3, 3], part: 1, itemId: 0 },
    ];
    enemyItems = [
      { coords: [7, 7], part: 1, itemId: 0 },
    ];

    engine.initializeGame(playerShips, enemyShips, playerItems, enemyItems);
  });

  describe("buildCollectContext", () => {
    it("should return a valid ItemActionContext", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const toggleTurn = vi.fn();

      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", toggleTurn);

      expect(ctx.item).toBe(item);
      expect(ctx.isPlayerShot).toBe(true);
      expect(ctx.shot).toBe(shot);
      expect(ctx.currentTurn).toBe("PLAYER_TURN");
      expect(ctx.boardWidth).toBe(10);
      expect(ctx.boardHeight).toBe(10);
    });

    it("should expose player ships and enemy ships", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      expect(ctx.playerShips).toHaveLength(1);
      expect(ctx.enemyShips).toHaveLength(1);
    });

    it("should expose items for both sides", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      expect(ctx.playerItems).toHaveLength(1);
      expect(ctx.enemyItems).toHaveLength(1);
    });

    it("should expose shots for both sides", () => {
      engine.executeShotPattern(5, 5, 0, true);
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      expect(ctx.playerShots).toHaveLength(1);
      expect(ctx.enemyShots).toHaveLength(0);
    });

    it("should call toggleTurn when toggleTurn is invoked", () => {
      const toggleTurn = vi.fn();
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", toggleTurn);

      ctx.toggleTurn();
      expect(toggleTurn).toHaveBeenCalledTimes(1);
    });

    it("should call captureRuleSet when setRuleSet is invoked", () => {
      const captureRuleSet = vi.fn();
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(
        engine, item, true, shot, "PLAYER_TURN", vi.fn(),
        captureRuleSet,
      );

      const fakeRuleSet = { id: "test" };
      ctx.setRuleSet(fakeRuleSet);
      expect(captureRuleSet).toHaveBeenCalledWith(fakeRuleSet);
    });

    it("should call captureBoardViewPlayerSide callback", () => {
      const captureBoardViewPlayerSide = vi.fn();
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(
        engine, item, true, shot, "PLAYER_TURN", vi.fn(),
        undefined, captureBoardViewPlayerSide,
      );

      ctx.setBoardViewPlayerSide(["playerShips"]);
      expect(captureBoardViewPlayerSide).toHaveBeenCalledWith(["playerShips"]);
    });

    it("should call captureBoardViewEnemySide callback", () => {
      const captureBoardViewEnemySide = vi.fn();
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(
        engine, item, true, shot, "PLAYER_TURN", vi.fn(),
        undefined, undefined, captureBoardViewEnemySide,
      );

      ctx.setBoardViewEnemySide(["playerShots"]);
      expect(captureBoardViewEnemySide).toHaveBeenCalledWith(["playerShots"]);
    });
  });

  describe("buildUseContext", () => {
    it("should return context without shot (undefined)", () => {
      const item = enemyItems[0];
      const ctx = buildUseContext(engine, item, true, "PLAYER_TURN", vi.fn());

      expect(ctx.shot).toBeUndefined();
      expect(ctx.item).toBe(item);
      expect(ctx.isPlayerShot).toBe(true);
    });

    it("should swap perspective for enemy use", () => {
      const item = playerItems[0];
      const ctx = buildUseContext(engine, item, false, "ENEMY_TURN", vi.fn());

      // When isPlayerShot=false and swapPerspective=true,
      // own* maps to enemy*, opponent* maps to player*
      expect(ctx.isPlayerShot).toBe(false);
      expect(ctx.currentTurn).toBe("ENEMY_TURN");
    });

    it("should delegate toggleTurn", () => {
      const toggleTurn = vi.fn();
      const item = enemyItems[0];
      const ctx = buildUseContext(engine, item, true, "PLAYER_TURN", toggleTurn);

      ctx.toggleTurn();
      expect(toggleTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe("buildDestroyContext", () => {
    it("should return ShipActionContext with ship instead of item", () => {
      const ship = enemyShips[0];
      const shot: Shot = { x: 6, y: 5, hit: true, shipId: 0 };
      const ctx = buildDestroyContext(engine, ship, true, shot, "PLAYER_TURN", vi.fn());

      expect(ctx.ship).toBe(ship);
      expect((ctx as unknown as Record<string, unknown>).item).toBeUndefined();
      expect(ctx.isPlayerShot).toBe(true);
      expect(ctx.shot).toBe(shot);
    });

    it("should swap perspective for enemy destroy", () => {
      const ship = playerShips[0];
      const shot: Shot = { x: 1, y: 0, hit: true, shipId: 0 };
      const ctx = buildDestroyContext(engine, ship, false, shot, "ENEMY_TURN", vi.fn());

      expect(ctx.ship).toBe(ship);
      expect(ctx.isPlayerShot).toBe(false);
    });

    it("should delegate toggleTurn", () => {
      const toggleTurn = vi.fn();
      const ship = enemyShips[0];
      const shot: Shot = { x: 6, y: 5, hit: true, shipId: 0 };
      const ctx = buildDestroyContext(engine, ship, true, shot, "PLAYER_TURN", toggleTurn);

      ctx.toggleTurn();
      expect(toggleTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe("ItemActionContext mutation methods", () => {
    it("addPlayerShip should place a ship on own board", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.addPlayerShip(1, 1);
      expect(result).toBe(true);
      expect(engine.getPlayerShips().length).toBe(2);
    });

    it("addEnemyShip should place a ship on opponent board", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.addEnemyShip(1, 1);
      expect(result).toBe(true);
      expect(engine.getEnemyShips().length).toBe(2);
    });

    it("deletePlayerShip should remove a ship by id and reindex", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addPlayerShip(1, 1);
      expect(engine.getPlayerShips().length).toBe(2);

      const result = ctx.deletePlayerShip(0);
      expect(result).toBe(true);
      expect(engine.getPlayerShips().length).toBe(1);
      expect(engine.getPlayerShips()[0]?.shipId).toBe(0); // reindexed
    });

    it("deletePlayerShip should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerShip(99);
      expect(result).toBe(false);
    });

    it("deleteAllPlayerShips should clear all ships", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllPlayerShips();
      expect(engine.getPlayerShips().length).toBe(0);
    });

    it("addPlayerObstacle should place an obstacle on own board", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.addPlayerObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      expect(result).toBe(true);
      expect(engine.getPlayerObstacles().length).toBe(1);
    });

    it("deletePlayerObstacle should remove an obstacle by id and reindex", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addPlayerObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      ctx.addPlayerObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      expect(engine.getPlayerObstacles().length).toBe(2);
      
      const result = ctx.deletePlayerObstacle(0);
      expect(result).toBe(true);
      expect(engine.getPlayerObstacles().length).toBe(1);
      expect(engine.getPlayerObstacles()[0]?.obstacleId).toBe(0); // reindexed
    });

    it("deletePlayerObstacle should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerObstacle(99);
      expect(result).toBe(false);
    });

    it("deleteAllPlayerObstacles should clear all obstacles", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addPlayerObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      ctx.deleteAllPlayerObstacles();
      expect(engine.getPlayerObstacles().length).toBe(0);
    });

    it("addEnemyObstacle should place an obstacle on opponent board", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.addEnemyObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      expect(result).toBe(true);
      expect(engine.getEnemyObstacles().length).toBe(1);
    });

    it("deleteEnemyObstacle should remove an obstacle by id and reindex", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addEnemyObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      ctx.addEnemyObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      expect(engine.getEnemyObstacles().length).toBe(2);
      
      const result = ctx.deleteEnemyObstacle(0);
      expect(result).toBe(true);
      expect(engine.getEnemyObstacles().length).toBe(1);
      expect(engine.getEnemyObstacles()[0]?.obstacleId).toBe(0); // reindexed
    });

    it("deleteEnemyObstacle should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyObstacle(99);
      expect(result).toBe(false);
    });

    it("deleteAllEnemyObstacles should clear all obstacles", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addEnemyObstacle({ width: 1, height: 1 } as unknown as GameObstacle);
      ctx.deleteAllEnemyObstacles();
      expect(engine.getEnemyObstacles().length).toBe(0);
    });

    it("addPlayerItem should place an item on own board", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.addPlayerItem({ templateId: "test" } as unknown as GameItem);
      expect(result).toBe(true);
      expect(engine.getState().playerItems.length).toBe(2); // 1 exists originally
    });

    it("deletePlayerItem should remove an item by id and reindex", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());
      ctx.addPlayerItem({ templateId: "test" } as unknown as GameItem);
      ctx.addPlayerItem({ templateId: "test" } as unknown as GameItem);
      expect(engine.getState().playerItems.length).toBe(3);

      const result = ctx.deletePlayerItem(0);
      expect(result).toBe(true);
      expect(engine.getState().playerItems.length).toBe(2);
      expect(engine.getState().playerItems[0]?.itemId).toBe(0); // reindexed
    });

    it("deletePlayerItem should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerItem(99);
      expect(result).toBe(false);
    });

    it("deleteAllPlayerItems should clear all items", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllPlayerItems();
      expect(engine.getState().playerItems.length).toBe(0);
    });

    it("addEnemyItem should place an item on opponent board", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.addEnemyItem({ templateId: "test" } as unknown as GameItem);
      expect(result).toBe(true);
      expect(engine.getState().enemyItems.length).toBe(2);
    });

    it("deleteEnemyItem should remove an item by id and reindex", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());
      ctx.addEnemyItem({ templateId: "test" } as unknown as GameItem);
      ctx.addEnemyItem({ templateId: "test" } as unknown as GameItem);
      expect(engine.getState().enemyItems.length).toBe(3);
      
      const result = ctx.deleteEnemyItem(0);
      expect(result).toBe(true);
      expect(engine.getState().enemyItems.length).toBe(2);
      expect(engine.getState().enemyItems[0]?.itemId).toBe(0); // reindexed
    });

    it("deleteEnemyItem should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyItem(99);
      expect(result).toBe(false);
    });

    it("deleteAllEnemyItems should clear all items", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllEnemyItems();
      expect(engine.getState().enemyItems.length).toBe(0);
    });

    it("deleteEnemyShip should remove a ship by id and reindex", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addEnemyShip(1, 1);
      expect(engine.getEnemyShips().length).toBe(2);

      const result = ctx.deleteEnemyShip(0);
      expect(result).toBe(true);
      expect(engine.getEnemyShips().length).toBe(1);
      expect(engine.getEnemyShips()[0]?.shipId).toBe(0); // reindexed
    });

    it("deleteEnemyShip should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyShip(99);
      expect(result).toBe(false);
    });

    it("deleteAllEnemyShips should clear all ships", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllEnemyShips();
      expect(engine.getEnemyShips().length).toBe(0);
    });

    it("addPlayerShot should append to own shots", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addPlayerShot({ x: 9, y: 9, hit: false });
      expect(engine.getPlayerShots().length).toBe(1);
    });

    it("deletePlayerShot should remove shot at position", () => {
      engine.executeShotPattern(5, 5, 0, true);
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerShot(5, 5);
      expect(result).toBe(true);
      expect(engine.getPlayerShots().length).toBe(0);
    });

    it("deletePlayerShot should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerShot(99, 99);
      expect(result).toBe(false);
    });

    it("deleteAllPlayerShots should clear all shots", () => {
      engine.executeShotPattern(5, 5, 0, true);
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllPlayerShots();
      expect(engine.getPlayerShots().length).toBe(0);
    });

    it("addEnemyShot should append to opponent shots", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.addEnemyShot({ x: 9, y: 9, hit: false });
      expect(engine.getEnemyShots().length).toBe(1);
    });

    it("deleteEnemyShot should remove shot at position", () => {
      engine.executeShotPattern(0, 0, 0, false);
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyShot(0, 0);
      expect(result).toBe(true);
    });

    it("deleteEnemyShot should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyShot(99, 99);
      expect(result).toBe(false);
    });

    it("deleteAllEnemyShots should clear all enemy shots", () => {
      engine.executeShotPattern(0, 0, 0, false);
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllEnemyShots();
      expect(engine.getEnemyShots().length).toBe(0);
    });

    it("deletePlayerItem should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerItem(99);
      expect(result).toBe(false);
    });

    it("deleteAllPlayerItems should clear all items", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllPlayerItems();
      expect(engine.getState().playerItems.length).toBe(0);
    });

    it("deleteEnemyItem should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyItem(99);
      expect(result).toBe(false);
    });

    it("deleteAllEnemyItems should clear all enemy items", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllEnemyItems();
      expect(engine.getState().enemyItems.length).toBe(0);
    });
  });

  describe("Obstacle mutation methods", () => {
    let playerObstacles: GameObstacle[];
    let enemyObstacles: GameObstacle[];

    beforeEach(() => {
      playerObstacles = [{ coords: [4, 4], width: 1, height: 1, obstacleId: 0 }];
      enemyObstacles = [{ coords: [8, 8], width: 1, height: 1, obstacleId: 0 }];

      engine = new GameEngine({ boardView: testBoardView });
      engine.initializeGame(
        playerShips, enemyShips, playerItems, enemyItems,
        playerObstacles, enemyObstacles,
      );
    });

    it("deletePlayerObstacle should remove obstacle by id", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerObstacle(0);
      expect(result).toBe(true);
      expect(engine.getPlayerObstacles().length).toBe(0);
    });

    it("deletePlayerObstacle should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deletePlayerObstacle(99);
      expect(result).toBe(false);
    });

    it("deleteAllPlayerObstacles should clear all obstacles", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllPlayerObstacles();
      expect(engine.getPlayerObstacles().length).toBe(0);
    });

    it("deleteEnemyObstacle should remove obstacle by id", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyObstacle(0);
      expect(result).toBe(true);
      expect(engine.getEnemyObstacles().length).toBe(0);
    });

    it("deleteEnemyObstacle should return false if not found", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      const result = ctx.deleteEnemyObstacle(99);
      expect(result).toBe(false);
    });

    it("deleteAllEnemyObstacles should clear all enemy obstacles", () => {
      const item = enemyItems[0];
      const shot: Shot = { x: 7, y: 7, hit: false, collected: true };
      const ctx = buildCollectContext(engine, item, true, shot, "PLAYER_TURN", vi.fn());

      ctx.deleteAllEnemyObstacles();
      expect(engine.getEnemyObstacles().length).toBe(0);
    });

    describe("Item placement failures (!placed branches)", () => {
      let generateItemSpy: ReturnType<typeof vi.spyOn>;
      let generateObstacleSpy: ReturnType<typeof vi.spyOn>;
      let findFreeShipSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        generateItemSpy = vi.spyOn(itemsTools, "generateItem").mockReturnValue(undefined as unknown as GameItem);
        generateObstacleSpy = vi.spyOn(obstaclesTools, "generateObstacle").mockReturnValue(undefined as unknown as GameObstacle);
        findFreeShipSpy = vi.spyOn(shipsTools, "findFreeShipPosition").mockReturnValue(null as unknown as [number, number]);
      });

      afterEach(() => {
        generateItemSpy.mockRestore();
        generateObstacleSpy.mockRestore();
        findFreeShipSpy.mockRestore();
      });

      it("should return false when addPlayerShip fails to place", () => {
        const ctx = buildCollectContext(engine, enemyItems[0], true, undefined as unknown as Shot, "PLAYER_TURN", vi.fn());
        const result = ctx.addPlayerShip(1, 1);
        expect(result).toBe(false);
      });

      it("should return false when addEnemyShip fails to place", () => {
        const ctx = buildCollectContext(engine, enemyItems[0], true, undefined as unknown as Shot, "PLAYER_TURN", vi.fn());
        const result = ctx.addEnemyShip(1, 1);
        expect(result).toBe(false);
      });

      it("should return false when addPlayerItem fails to place", () => {
        const ctx = buildCollectContext(engine, enemyItems[0], true, undefined as unknown as Shot, "PLAYER_TURN", vi.fn());
        const result = ctx.addPlayerItem({ templateId: "test" } as unknown as GameItem);
        expect(result).toBe(false);
      });

      it("should return false when addEnemyItem fails to place", () => {
        const ctx = buildCollectContext(engine, enemyItems[0], true, undefined as unknown as Shot, "PLAYER_TURN", vi.fn());
        const result = ctx.addEnemyItem({ templateId: "test" } as unknown as GameItem);
        expect(result).toBe(false);
      });

      it("should return false when addPlayerObstacle fails to place", () => {
        const ctx = buildCollectContext(engine, enemyItems[0], true, undefined as unknown as Shot, "PLAYER_TURN", vi.fn());
        const result = ctx.addPlayerObstacle({} as unknown as GameObstacle);
        expect(result).toBe(false);
      });

      it("should return false when addEnemyObstacle fails to place", () => {
        const ctx = buildCollectContext(engine, enemyItems[0], true, undefined as unknown as Shot, "PLAYER_TURN", vi.fn());
        const result = ctx.addEnemyObstacle({} as unknown as GameObstacle);
        expect(result).toBe(false);
      });
    });
  });
});
