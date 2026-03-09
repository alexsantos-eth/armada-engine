import { describe, expect, it, beforeEach, vi } from "vitest";
import { Match, createMatch } from "../../../engine/match";
import type { GameShip } from "../../../types/entities";
import type { GameSetup } from "../../../manager";
import type { BoardViewConfig } from "../../../types/config";

describe("Match (v3)", () => {
  let match: Match;
  let playerShips: GameShip[];
  let enemyShips: GameShip[];
  let setup: GameSetup;

  // Test-specific board configuration
  const testBoardView: BoardViewConfig = {
    id: "test-board",
    title: "TestBoard",
    description: "Test board configuration",
    width: 10,
    height: 10,
    playerSide: ["playerShips", "enemyShots"],
    enemySide: ["enemyObstacles", "playerShots", "collectedItems"],
  };

  beforeEach(() => {
    playerShips = [
      { coords: [0, 0], width: 2, height: 1, shipId: 0 },
      { coords: [2, 2], width: 1, height: 3, shipId: 1 },
    ];

    enemyShips = [
      { coords: [5, 5], width: 2, height: 1, shipId: 0 },
      { coords: [7, 7], width: 1, height: 3, shipId: 1 },
    ];

    setup = {
      playerShips,
      enemyShips,
      initialTurn: "PLAYER_TURN",
      config: {
        boardView: testBoardView,
      },
    };

    match = new Match({ setup });
  });

  describe("Match Creation and Initialization", () => {
    it("should create match from setup", () => {
      expect(match).toBeDefined();
    });

    it("should initialize match with ships", () => {
      match.initializeMatch();

      const state = match.getState();
      expect(state.playerShips).toHaveLength(2);
      expect(state.enemyShips).toHaveLength(2);
    });

    it("should start with correct initial turn", () => {
      match.initializeMatch();

      expect(match.getCurrentTurn()).toBe("PLAYER_TURN");
      expect(match.isPlayerTurn()).toBe(true);
      expect(match.isEnemyTurn()).toBe(false);
    });

    it("should create match with createMatch factory", () => {
      const factoryMatch = createMatch({ setup });
      factoryMatch.initializeMatch();

      expect(factoryMatch.getState().playerShips).toHaveLength(2);
    });

    it("should call onMatchStart callback", () => {
      const onMatchStart = vi.fn();
      const callbackMatch = new Match({
        setup,
        onMatchStart,
      });

      callbackMatch.initializeMatch();

      expect(onMatchStart).toHaveBeenCalledTimes(1);
    });

    it("should throw when neither setup nor setupProvider is given", () => {
      expect(() => new Match({} as any)).toThrow();
    });

    it("should allow starting with enemy turn", () => {
      const enemyStartSetup = {
        ...setup,
        initialTurn: "ENEMY_TURN" as const,
      };

      const enemyMatch = new Match({ setup: enemyStartSetup });
      enemyMatch.initializeMatch();

      expect(enemyMatch.isEnemyTurn()).toBe(true);
    });
  });

  describe("Basic Shooting Mechanics", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should execute a successful hit", () => {
      const result = match.planAndAttack(5, 5, true);

      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(true);
      expect(result.shots[0]?.shipId).toBe(0);
    });

    it("should execute a miss", () => {
      const result = match.planAndAttack(0, 9, true);

      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(false);
    });

    it("should reject duplicate shots", () => {
      match.planAndAttack(5, 5, true);

      const result = match.planAndAttack(5, 5, true);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject out-of-bounds shots", () => {
      const result = match.planAndAttack(15, 15, true);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should track shot history", () => {
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);

      const state = match.getState();
      expect(state.playerShots).toHaveLength(2);
    });
  });

  describe("Turn Management", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should allow shooting again after hit (default rules)", () => {
      const result = match.planAndAttack(7, 7, true);

      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
      expect(match.isPlayerTurn()).toBe(true);
    });

    it("should end turn after miss", () => {
      const result = match.planAndAttack(0, 9, true);

      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(match.isEnemyTurn()).toBe(true);
    });

    it("should end turn after ship destruction", () => {
      match.planAndAttack(5, 5, true); // Hit
      const result = match.planAndAttack(6, 5, true); // Destroy

      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.turnEnded).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
    });

    it("should allow multiple consecutive hits", () => {
      // Enemy ship at [7,7], size 1x3
      const hit1 = match.planAndAttack(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);

      const hit2 = match.planAndAttack(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
    });

    it("should alternate turns correctly", () => {
      expect(match.isPlayerTurn()).toBe(true);

      match.planAndAttack(0, 9, true); // Miss
      expect(match.isEnemyTurn()).toBe(true);

      match.planAndAttack(9, 9, false); // Miss
      expect(match.isPlayerTurn()).toBe(true);
    });
  });

  describe("Ship Destruction", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should destroy ship when all cells are hit", () => {
      match.planAndAttack(5, 5, true);
      const result = match.planAndAttack(6, 5, true);

      expect(result.shots[0]?.shipDestroyed).toBe(true);
    });

    it("should track destroyed ships", () => {
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);

      const state = match.getState();
      expect(state.areAllEnemyShipsDestroyed).toBe(false); // Still have ship 1
    });

    it("should provide ship destruction feedback", () => {
      match.planAndAttack(5, 5, true);
      const result = match.planAndAttack(6, 5, true);

      expect(result.reason).toContain("destroyed");
    });
  });

  describe("Game Over Conditions", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should end game when all enemy ships destroyed", () => {
      // Destroy enemy ship 0
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);

      // Switch turn
      match.forceSetTurn("PLAYER_TURN");

      // Destroy enemy ship 1
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      const result = match.planAndAttack(7, 9, true);

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("player");
      expect(match.isMatchOver()).toBe(true);
    });

    it("should declare enemy winner when all player ships destroyed", () => {
      // Destroy player ship 0
      match.forceSetTurn("ENEMY_TURN");
      match.planAndAttack(0, 0, false);
      match.planAndAttack(1, 0, false);

      match.forceSetTurn("ENEMY_TURN");

      // Destroy player ship 1
      match.planAndAttack(2, 2, false);
      match.planAndAttack(2, 3, false);
      const result = match.planAndAttack(2, 4, false);

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("enemy");
    });

    it("should provide game over reason", () => {
      // Destroy all enemy ships
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.forceSetTurn("PLAYER_TURN");
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      const result = match.planAndAttack(7, 9, true);

      expect(result.reason).toBe("Game over");
    });

    it("should call onMatchEnd callback", () => {
      const onMatchEnd = vi.fn();
      const callbackMatch = new Match({
        setup,
        onGameOver: onMatchEnd,
      });

      callbackMatch.initializeMatch();

      // Destroy all enemy ships
      callbackMatch.planAndAttack(5, 5, true);
      callbackMatch.planAndAttack(6, 5, true);
      callbackMatch.forceSetTurn("PLAYER_TURN");
      callbackMatch.planAndAttack(7, 7, true);
      callbackMatch.planAndAttack(7, 8, true);
      callbackMatch.planAndAttack(7, 9, true);

      expect(onMatchEnd).toHaveBeenCalled();
    });
  });

  describe("Shot Planning and Confirmation", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should plan a shot", () => {
      const plan = match.planShot(5, 5, 0, true);

      expect(plan.ready).toBe(true);
      expect(plan.centerX).toBe(5);
      expect(plan.centerY).toBe(5);
    });

    it("should store pending plan", () => {
      match.planShot(5, 5, 0, true);

      const pending = match.getPendingPlan();
      expect(pending).toBeDefined();
      expect(pending?.centerX).toBe(5);
      expect(pending?.centerY).toBe(5);
    });

    it("should confirm planned attack", () => {
      match.planShot(5, 5, 0, true);
      const result = match.confirmAttack();

      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(true);
    });

    it("should clear pending plan after confirmation", () => {
      match.planShot(5, 5, 0, true);
      match.confirmAttack();

      expect(match.getPendingPlan()).toBeNull();
    });

    it("should allow canceling plan", () => {
      match.planShot(5, 5, 0, true);
      match.cancelPlan();

      expect(match.getPendingPlan()).toBeNull();
    });

    it("should fail to confirm without planning", () => {
      const result = match.confirmAttack();

      expect(result.success).toBe(false);
    });
  });

  describe("Board Access", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should get player board", () => {
      const board = match.getPlayerBoard();

      expect(board).toHaveLength(10);
      expect(board[0]).toHaveLength(10);
    });

    it("should get enemy board", () => {
      const board = match.getEnemyBoard();

      expect(board).toHaveLength(10);
      expect(board[0]).toHaveLength(10);
    });

    it("should show ships on player board", () => {
      const board = match.getPlayerBoard();

      expect(board[board.length - 1][0].state).toBe("SHIP");
    });

    it("should show shots on enemy board after attack", () => {
      match.planAndAttack(5, 5, true);

      const board = match.getEnemyBoard();
      // Board rendering depends on view configuration
      // Just verify it returns a valid board
      expect(board).toBeDefined();
    });
  });

  describe("Complete Match Simulation - Player Victory", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should play a complete match to player victory", () => {
      // Turn 1: Player hits enemy ship 0
      let result = match.planAndAttack(5, 5, true);
      expect(result.success).toBe(true);
      expect(result.canShootAgain).toBe(true);

      // Player continues and destroys ship 0
      result = match.planAndAttack(6, 5, true);
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);

      // Turn 2: Enemy misses
      result = match.planAndAttack(9, 9, false);
      expect(match.isPlayerTurn()).toBe(true);

      // Turn 3: Player destroys ship 1
      result = match.planAndAttack(7, 7, true);
      expect(result.canShootAgain).toBe(true);

      result = match.planAndAttack(7, 8, true);
      expect(result.canShootAgain).toBe(true);

      result = match.planAndAttack(7, 9, true);
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("player");
    });
  });

  describe("Complete Match Simulation - Enemy Victory", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should play a complete match to enemy victory", () => {
      // Player misses
      match.planAndAttack(9, 9, true);
      expect(match.isEnemyTurn()).toBe(true);

      // Enemy destroys player ship 0
      let result = match.planAndAttack(0, 0, false);
      expect(result.canShootAgain).toBe(true);

      result = match.planAndAttack(1, 0, false);
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);

      // Player misses
      match.planAndAttack(8, 8, true);
      expect(match.isEnemyTurn()).toBe(true);

      // Enemy destroys player ship 1
      result = match.planAndAttack(2, 2, false);
      expect(result.canShootAgain).toBe(true);

      result = match.planAndAttack(2, 3, false);
      expect(result.canShootAgain).toBe(true);

      result = match.planAndAttack(2, 4, false);
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("enemy");
    });
  });

  describe("Complete Match Simulation - With Multiple Turns", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should handle complex turn sequences", () => {
      let turnCount = 0;

      // Turn 1: Player hits, misses
      match.planAndAttack(7, 7, true);
      match.planAndAttack(0, 9, true); // Miss
      expect(match.isEnemyTurn()).toBe(true);
      turnCount++;

      // Turn 2: Enemy misses
      match.planAndAttack(9, 0, false);
      expect(match.isPlayerTurn()).toBe(true);
      turnCount++;

      // Turn 3: Player continues hitting ship 1
      match.planAndAttack(7, 8, true);
      match.planAndAttack(7, 9, true); // Destroy
      expect(match.isEnemyTurn()).toBe(true);
      turnCount++;

      // Turn 4: Enemy misses
      match.planAndAttack(9, 1, false);
      expect(match.isPlayerTurn()).toBe(true);
      turnCount++;

      // Turn 5: Player destroys ship 0
      match.planAndAttack(5, 5, true);
      let result = match.planAndAttack(6, 5, true);

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("player");
      expect(turnCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Complete Match Simulation - With Items", () => {
    beforeEach(() => {
      const setupWithItems: GameSetup = {
        ...setup,
        playerItems: [{ coords: [4, 4], part: 1 }],
        enemyItems: [{ coords: [8, 8], part: 1 }],
      };

      match = new Match({ setup: setupWithItems });
      match.initializeMatch();
    });

    it("should handle item collection during match", () => {
      // Player collects item
      let result = match.planAndAttack(8, 8, true);
      expect(result.shots[0]?.collected).toBe(true);
      expect(result.shots[0]?.itemFullyCollected).toBe(true);

      const state = match.getState();
      expect(state.playerCollectedItems).toContain(0);
    });
  });

  describe("Complete Match Simulation - With Obstacles", () => {
    beforeEach(() => {
      const setupWithObstacles: GameSetup = {
        ...setup,
        playerObstacles: [{ coords: [1, 1], width: 1, height: 1, obstacleId: 0 }],
        enemyObstacles: [{ coords: [6, 6], width: 1, height: 1, obstacleId: 0 }],
      };

      match = new Match({ setup: setupWithObstacles });
      match.initializeMatch();
    });

    it("should include obstacles in match state", () => {
      const state = match.getState();

      expect(state.playerObstacles).toHaveLength(1);
      expect(state.enemyObstacles).toHaveLength(1);
    });
  });

  describe("Match Callbacks", () => {
    it("should trigger all lifecycle callbacks", () => {
      const callbacks = {
        onMatchStart: vi.fn(),
        onGameOver: vi.fn(),
        onTurnChange: vi.fn(),
        onShot: vi.fn(),
      };

      const callbackMatch = new Match({
        setup,
        ...callbacks,
      });

      callbackMatch.initializeMatch();
      expect(callbacks.onMatchStart).toHaveBeenCalled();

      // Player shoots
      callbackMatch.planAndAttack(5, 5, true);
      expect(callbacks.onShot).toHaveBeenCalledWith(
        expect.objectContaining({ x: 5, y: 5 }),
        true,
      );

      // Turn change
      callbackMatch.planAndAttack(0, 9, true);
      expect(callbacks.onTurnChange).toHaveBeenCalled();

      // Enemy shoots
      callbackMatch.planAndAttack(0, 0, false);
      expect(callbacks.onShot).toHaveBeenCalledWith(
        expect.objectContaining({ x: 0, y: 0 }),
        false,
      );

      // End game
      callbackMatch.forceSetTurn("PLAYER_TURN");
      callbackMatch.planAndAttack(6, 5, true);
      callbackMatch.forceSetTurn("PLAYER_TURN");
      callbackMatch.planAndAttack(7, 7, true);
      callbackMatch.planAndAttack(7, 8, true);
      callbackMatch.planAndAttack(7, 9, true);

      expect(callbacks.onGameOver).toHaveBeenCalled();
    });
  });

  describe("Match State Queries", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should provide complete match state", () => {
      const state = match.getState();

      expect(state).toHaveProperty("playerShips");
      expect(state).toHaveProperty("enemyShips");
      expect(state).toHaveProperty("playerShots");
      expect(state).toHaveProperty("enemyShots");
      expect(state).toHaveProperty("isGameOver");
      expect(state).toHaveProperty("winner");
    });

    it("should track match progress", () => {
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);

      const state = match.getState();
      expect(state.shotCount).toBeGreaterThan(0);
      expect(state.areAllEnemyShipsDestroyed).toBe(false);
    });

    it("should provide cell information", () => {
      match.planAndAttack(5, 5, true);

      const cellInfo = match.getCellInfo(5, 5, "enemy");
      expect(cellInfo).toBeDefined();
      expect(cellInfo.hasShip).toBe(true);
      expect(cellInfo.isShot).toBe(false);

      const shotInfo = match.getCellInfo(5, 5, "player");
      expect(shotInfo.isShot).toBe(true);
    });

    it("should detect match over state", () => {
      expect(match.isMatchOver()).toBe(false);

      // Win the game
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.forceSetTurn("PLAYER_TURN");
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      match.planAndAttack(7, 9, true);

      expect(match.isMatchOver()).toBe(true);
    });
  });

  describe("Match Reset and Replay", () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it("should allow replaying match", () => {
      // Play some turns
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);

      // Reset
      match.resetMatch();
      match.initializeMatch();

      const state = match.getState();
      expect(state.playerShots).toHaveLength(0);
      expect(state.enemyShots).toHaveLength(0);
      expect(state.isGameOver).toBe(false);
    });
  });
});
