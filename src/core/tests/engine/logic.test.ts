import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../engine/logic';
import { SINGLE_SHOT } from '../../constants/shots';
import type { GameShip, Shot } from '../../types/common';

describe('GameEngine', () => {
  let engine: GameEngine;
  let playerShips: GameShip[];
  let enemyShips: GameShip[];

  beforeEach(() => {
    engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
    
    // Standard test ships
    playerShips = [
      { coords: [0, 0], width: 2, height: 1, shipId: 0 },
      { coords: [2, 2], width: 1, height: 3, shipId: 1 },
    ];
    
    enemyShips = [
      { coords: [5, 5], width: 2, height: 1, shipId: 0 },
      { coords: [7, 7], width: 1, height: 3, shipId: 1 },
    ];
  });

  describe('Initialization', () => {
    it('should start with default values', () => {
      const state = engine.getState();
      expect(state.currentTurn).toBe('PLAYER_TURN');
      expect(state.isGameOver).toBe(false);
      expect(state.winner).toBe(null);
      expect(state.playerShips).toHaveLength(0);
      expect(state.enemyShips).toHaveLength(0);
      expect(state.shotCount).toBe(0);
    });

    it('should initialize game with ships', () => {
      engine.initializeGame(playerShips, enemyShips);
      
      const state = engine.getState();
      expect(state.playerShips).toHaveLength(2);
      expect(state.enemyShips).toHaveLength(2);
      expect(state.currentTurn).toBe('PLAYER_TURN');
    });

    it('should accept custom board dimensions', () => {
      const customEngine = new GameEngine({ boardWidth: 15, boardHeight: 12 });
      const dimensions = customEngine.getBoardDimensions();
      
      expect(dimensions.width).toBe(15);
      expect(dimensions.height).toBe(12);
    });
  });

  describe('Shot Execution', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should register a miss correctly', () => {
      const result = engine.executeShotPattern(9, 9, SINGLE_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots[0].hit).toBe(false);
      expect(result.shots[0].shipId).toBeUndefined();
      expect(result.shots[0].shipDestroyed).toBe(false);
    });

    it('should register a hit correctly', () => {
      // Enemy ship at [5,5] horizontal, size 2
      const result = engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      
      expect(result.success).toBe(true);
      expect(result.shots[0].hit).toBe(true);
      expect(result.shots[0].shipId).toBe(0);
      expect(result.shots[0].shipDestroyed).toBe(false);
    });

    it('should detect ship destruction', () => {
      // Enemy small ship at [5,5] horizontal, size 2
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true); // First hit
      const result = engine.executeShotPattern(6, 5, SINGLE_SHOT, true); // Second hit - destroys ship
      
      expect(result.shots[0].hit).toBe(true);
      expect(result.shots[0].shipDestroyed).toBe(true);
    });

    it('should prevent shooting same cell twice', () => {
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      const result = engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      
      expect(result.shots[0].executed).toBe(false);
    });

    it('should track shots for both players separately', () => {
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true); // Player shot
      engine.executeShotPattern(0, 0, SINGLE_SHOT, false); // Enemy shot
      
      const state = engine.getState();
      expect(state.playerShots).toHaveLength(1);
      expect(state.enemyShots).toHaveLength(1);
    });

    it('should increment shot count', () => {
      expect(engine.getShotCount()).toBe(0);
      
      engine.executeShotPattern(0, 0, SINGLE_SHOT, true);
      expect(engine.getShotCount()).toBe(1);
      
      engine.executeShotPattern(1, 1, SINGLE_SHOT, false);
      expect(engine.getShotCount()).toBe(2);
    });
  });

  describe('Game Over Detection', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should detect when all enemy ships are destroyed', () => {
      // Destroy enemy ship 1 (small ship at [5,5], size 2)
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      engine.executeShotPattern(6, 5, SINGLE_SHOT, true);
      
      // Destroy enemy ship 2 (medium ship at [7,7], size 3)
      engine.executeShotPattern(7, 7, SINGLE_SHOT, true);
      engine.executeShotPattern(7, 8, SINGLE_SHOT, true);
      engine.executeShotPattern(7, 9, SINGLE_SHOT, true);
      
      const state = engine.getState();
      expect(state.areAllEnemyShipsDestroyed).toBe(true);
      expect(state.areAllPlayerShipsDestroyed).toBe(false);
      
      // Game over must be set manually (normally done by Match)
      engine.setGameOver('player');
      expect(engine.getWinner()).toBe('player');
      expect(engine.getState().isGameOver).toBe(true);
    });

    it('should detect when all player ships are destroyed', () => {
      // Destroy player ship 1 (small ship at [0,0], size 2)
      engine.executeShotPattern(0, 0, SINGLE_SHOT, false);
      engine.executeShotPattern(1, 0, SINGLE_SHOT, false);
      
      // Destroy player ship 2 (medium ship at [2,2], size 3)
      engine.executeShotPattern(2, 2, SINGLE_SHOT, false);
      engine.executeShotPattern(2, 3, SINGLE_SHOT, false);
      engine.executeShotPattern(2, 4, SINGLE_SHOT, false);
      
      const state = engine.getState();
      expect(state.areAllPlayerShipsDestroyed).toBe(true);
      expect(state.areAllEnemyShipsDestroyed).toBe(false);
      
      // Game over must be set manually (normally done by Match)
      engine.setGameOver('enemy');
      expect(engine.getWinner()).toBe('enemy');
      expect(engine.getState().isGameOver).toBe(true);
    });

    it('should check areAllShipsDestroyed helper method', () => {
      // Destroy all enemy ships
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      engine.executeShotPattern(6, 5, SINGLE_SHOT, true);
      engine.executeShotPattern(7, 7, SINGLE_SHOT, true);
      engine.executeShotPattern(7, 8, SINGLE_SHOT, true);
      engine.executeShotPattern(7, 9, SINGLE_SHOT, true);
      
      expect(engine.areAllShipsDestroyed(false)).toBe(true); // enemy ships
      expect(engine.areAllShipsDestroyed(true)).toBe(false); // player ships
    });
  });

  describe('Ship Position Queries', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should detect ship at position', () => {
      expect(engine.hasShipAtPosition(0, 0, true)).toBe(true); // Player ship
      expect(engine.hasShipAtPosition(1, 0, true)).toBe(true); // Player ship continues
      expect(engine.hasShipAtPosition(5, 5, false)).toBe(true); // Enemy ship
    });

    it('should return false for empty positions', () => {
      expect(engine.hasShipAtPosition(9, 9, true)).toBe(false);
      expect(engine.hasShipAtPosition(9, 9, false)).toBe(false);
    });

    it('should check if cell has been shot', () => {
      expect(engine.isCellShot(5, 5, true)).toBe(false);
      
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      
      expect(engine.isCellShot(5, 5, true)).toBe(true);
      expect(engine.isCellShot(5, 5, false)).toBe(false); // Different player
    });

    it('should get shot at position', () => {
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      
      const shot = engine.getShotAtPosition(5, 5, true);
      expect(shot).toBeDefined();
      expect(shot?.x).toBe(5);
      expect(shot?.y).toBe(5);
      
      const noShot = engine.getShotAtPosition(9, 9, true);
      expect(noShot).toBeUndefined();
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should return complete game state', () => {
      const state = engine.getState();
      
      expect(state).toHaveProperty('currentTurn');
      expect(state).toHaveProperty('isPlayerTurn');
      expect(state).toHaveProperty('isEnemyTurn');
      expect(state).toHaveProperty('playerShips');
      expect(state).toHaveProperty('enemyShips');
      expect(state).toHaveProperty('playerShots');
      expect(state).toHaveProperty('enemyShots');
      expect(state).toHaveProperty('isGameOver');
      expect(state).toHaveProperty('winner');
      expect(state).toHaveProperty('boardWidth');
      expect(state).toHaveProperty('boardHeight');
      expect(state).toHaveProperty('shotCount');
    });

    it('should increment version counter on each mutation', () => {
      const engine2 = new GameEngine({});
      const v0 = engine2.getVersion();

      engine2.initializeGame(playerShips, enemyShips);
      const v1 = engine2.getVersion();
      expect(v1).toBeGreaterThan(v0);

      engine2.executeShotPattern(4, 4, SINGLE_SHOT, true);
      const v2 = engine2.getVersion();
      expect(v2).toBeGreaterThan(v1);
    });

    it('should reset game state', () => {
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);

      
      engine.resetGame();
      
      const state = engine.getState();
      expect(state.currentTurn).toBe('PLAYER_TURN');
      expect(state.playerShots).toHaveLength(0);
      expect(state.enemyShots).toHaveLength(0);
      expect(state.shotCount).toBe(0);
      expect(state.isGameOver).toBe(false);
      expect(state.winner).toBe(null);
    });

    it('should get player ships copy', () => {
      const ships = engine.getPlayerShips();
      expect(ships).toHaveLength(2);
      
      // Verify it's a copy
      ships.push({ coords: [9, 9], width: 2, height: 1, shipId: 99 });
      expect(engine.getPlayerShips()).toHaveLength(2); // Original unchanged
    });

    it('should get enemy ships copy', () => {
      const ships = engine.getEnemyShips();
      expect(ships).toHaveLength(2);
      
      // Verify it's a copy
      ships.push({ coords: [9, 9], width: 2, height: 1, shipId: 99 });
      expect(engine.getEnemyShips()).toHaveLength(2); // Original unchanged
    });
  });

  describe('Board Validation', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should validate positions within bounds', () => {
      expect(engine.isValidPosition(0, 0)).toBe(true);
      expect(engine.isValidPosition(9, 9)).toBe(true);
      expect(engine.isValidPosition(5, 5)).toBe(true);
    });

    it('should reject positions outside bounds', () => {
      expect(engine.isValidPosition(-1, 0)).toBe(false);
      expect(engine.isValidPosition(0, -1)).toBe(false);
      expect(engine.isValidPosition(10, 0)).toBe(false);
      expect(engine.isValidPosition(0, 10)).toBe(false);
      expect(engine.isValidPosition(15, 15)).toBe(false);
    });
  });

  describe('Shot Checking', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should check shot against enemy ships for player', () => {
      // Player shot hits enemy ship 0 at (5,5) — verified via ship-position query
      expect(engine.hasShipAtPosition(5, 5, false)).toBe(true);
      expect(engine.hasShipAtPosition(9, 9, false)).toBe(false);
    });

    it('should check shot against player ships for enemy', () => {
      // Enemy shot hits player ship 0 at (0,0) — verified via ship-position query
      expect(engine.hasShipAtPosition(0, 0, true)).toBe(true);
      expect(engine.hasShipAtPosition(9, 9, true)).toBe(false);
    });
  });

  describe('Ship Status', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should track ship destruction status', () => {
      // Enemy small ship at [5,5], size 2
      expect(engine.isShipDestroyed(0, true)).toBe(false);
      
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      expect(engine.isShipDestroyed(0, true)).toBe(false);
      
      engine.executeShotPattern(6, 5, SINGLE_SHOT, true);
      expect(engine.isShipDestroyed(0, true)).toBe(true);
    });

    it('should handle checking invalid ship IDs', () => {
      expect(engine.isShipDestroyed(999, true)).toBe(false);
      expect(engine.isShipDestroyed(-1, false)).toBe(false);
    });
  });

  describe('Ship Setters', () => {
    it('should allow setting player ships after construction', () => {
      engine.setPlayerShips(playerShips);
      expect(engine.getPlayerShips()).toHaveLength(2);
    });

    it('should allow setting enemy ships after construction', () => {
      engine.setEnemyShips(enemyShips);
      expect(engine.getEnemyShips()).toHaveLength(2);
    });

    it('should update ship positions when setting ships', () => {
      engine.setPlayerShips(playerShips);
      expect(engine.hasShipAtPosition(0, 0, true)).toBe(true);
      
      engine.setEnemyShips(enemyShips);
      expect(engine.hasShipAtPosition(5, 5, false)).toBe(true);
    });
  });

  describe('Shot History', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should allow setting player shots for replay', () => {
      const shots: Shot[] = [
        { x: 5, y: 5, hit: true, shipId: 0 },
        { x: 6, y: 5, hit: true, shipId: 0 },
      ];
      
      engine.setPlayerShots(shots);
      
      const playerShots = engine.getPlayerShots();
      expect(playerShots).toHaveLength(2);
      expect(engine.isCellShot(5, 5, true)).toBe(true);
    });

    it('should allow setting enemy shots for replay', () => {
      const shots: Shot[] = [
        { x: 0, y: 0, hit: true, shipId: 0 },
        { x: 1, y: 0, hit: true, shipId: 0 },
      ];
      
      engine.setEnemyShots(shots);
      
      const enemyShots = engine.getEnemyShots();
      expect(enemyShots).toHaveLength(2);
      expect(engine.isCellShot(0, 0, false)).toBe(true);
    });

    it('should update shot count when setting shots', () => {
      const playerShots: Shot[] = [{ x: 5, y: 5, hit: true, shipId: 0 }];
      const enemyShots: Shot[] = [{ x: 0, y: 0, hit: true, shipId: 0 }];
      
      engine.setPlayerShots(playerShots);
      engine.setEnemyShots(enemyShots);
      
      expect(engine.getShotCount()).toBe(2);
    });

    it('setPlayerShots: hits count against enemy ships (areAllEnemyShipsDestroyed)', () => {
      // enemyShips[0] occupies (5,5) and (6,5) — size 2
      // Supply both hit shots via setPlayerShots; the engine must report ship 0 as destroyed.
      const shots: Shot[] = [
        { x: 5, y: 5, hit: true, shipId: 0 },
        { x: 6, y: 5, hit: true, shipId: 0 },
      ];

      engine.setPlayerShots(shots);

      expect(engine.isShipDestroyed(0, true)).toBe(true);
      expect(engine.getState().areAllEnemyShipsDestroyed).toBe(false); // ship 1 untouched
    });

    it('setEnemyShots: hits count against player ships (areAllPlayerShipsDestroyed)', () => {
      // playerShips[0] occupies (0,0) and (1,0) — size 2
      const shots: Shot[] = [
        { x: 0, y: 0, hit: true, shipId: 0 },
        { x: 1, y: 0, hit: true, shipId: 0 },
      ];

      engine.setEnemyShots(shots);

      expect(engine.isShipDestroyed(0, false)).toBe(true);
      expect(engine.getState().areAllPlayerShipsDestroyed).toBe(false); // ship 1 untouched
    });

    it('setEnemyShots([]) does NOT clear enemy-ship hit tracking (EMP grenade regression)', () => {
      // Player fires and fully destroys both enemy ships.
      const singleShot = { id: 'single', name: 'Single', offsets: [{ dx: 0, dy: 0 }] };
      engine.executeShotPattern(5, 5, singleShot, true);
      engine.executeShotPattern(6, 5, singleShot, true);
      engine.executeShotPattern(7, 7, singleShot, true);
      engine.executeShotPattern(7, 8, singleShot, true);
      engine.executeShotPattern(7, 9, singleShot, true);

      expect(engine.getState().areAllEnemyShipsDestroyed).toBe(true);

      // Simulate EMP grenade: clear enemy (opponent) shots.
      // This must NOT wipe the player's own hit progress against enemy ships.
      engine.setEnemyShots([]);

      expect(engine.getState().areAllEnemyShipsDestroyed).toBe(true);
    });

    it('setPlayerShots([]) does NOT clear player-ship hit tracking', () => {
      const singleShot = { id: 'single', name: 'Single', offsets: [{ dx: 0, dy: 0 }] };
      // Enemy fires and fully destroys both player ships.
      engine.executeShotPattern(0, 0, singleShot, false);
      engine.executeShotPattern(1, 0, singleShot, false);
      engine.executeShotPattern(2, 2, singleShot, false);
      engine.executeShotPattern(2, 3, singleShot, false);
      engine.executeShotPattern(2, 4, singleShot, false);

      expect(engine.getState().areAllPlayerShipsDestroyed).toBe(true);

      // Clearing player (opponent) shots must NOT wipe enemy's hit progress.
      engine.setPlayerShots([]);

      expect(engine.getState().areAllPlayerShipsDestroyed).toBe(true);
    });
  });

  describe('Board Dimensions', () => {
    it('should allow setting board dimensions', () => {
      engine.setBoardDimensions(15, 12);
      
      const dimensions = engine.getBoardDimensions();
      expect(dimensions.width).toBe(15);
      expect(dimensions.height).toBe(12);
    });

    it('should update validation after changing dimensions', () => {
      engine.setBoardDimensions(5, 5);
      
      expect(engine.isValidPosition(4, 4)).toBe(true);
      expect(engine.isValidPosition(5, 5)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Items
  // ─────────────────────────────────────────────────────────────────────────
  describe('Items — placement and collection', () => {
    /** Enemy has one 1-cell item at (3,3) and one 2-cell item at (6,6)-(7,6). */
    const enemyItems = [
      { coords: [3, 3] as [number, number], part: 1 },
      { coords: [6, 6] as [number, number], part: 2 },
    ];

    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips, [], enemyItems);
    });

    it('should reflect items in state after initializeGame', () => {
      const state = engine.getState();
      expect(state.enemyItems).toHaveLength(2);
      expect(state.playerItems).toHaveLength(0);
      expect(state.playerCollectedItems).toHaveLength(0);
      expect(state.enemyCollectedItems).toHaveLength(0);
    });

    it('should mark a shot as collected when hitting an item cell', () => {
      const result = engine.executeShotPattern(3, 3, SINGLE_SHOT, true);

      expect(result.success).toBe(true);
      expect(result.shots[0].hit).toBe(false);       // items are not ship hits
      expect(result.shots[0].collected).toBe(true);
      expect(result.shots[0].itemId).toBe(0);
      expect(result.shots[0].itemFullyCollected).toBe(true); // single-part item
    });

    it('should not fully collect a multi-part item until all parts are shot', () => {
      const r1 = engine.executeShotPattern(6, 6, SINGLE_SHOT, true); // first part
      expect(r1.shots[0].collected).toBe(true);
      expect(r1.shots[0].itemFullyCollected).toBe(false);

      const r2 = engine.executeShotPattern(7, 6, SINGLE_SHOT, true); // second part
      expect(r2.shots[0].collected).toBe(true);
      expect(r2.shots[0].itemFullyCollected).toBe(true);
    });

    it('should add item index to playerCollectedItems once fully collected', () => {
      engine.executeShotPattern(3, 3, SINGLE_SHOT, true);

      const state = engine.getState();
      expect(state.playerCollectedItems).toContain(0);
    });

    it('should not re-collect an already collected item', () => {
      engine.executeShotPattern(6, 6, SINGLE_SHOT, true);
      engine.executeShotPattern(7, 6, SINGLE_SHOT, true); // fully collected

      // Trying to shoot a cell of an already-collected item returns null (no second collection)
      const result = engine.executeShotPattern(6, 6, SINGLE_SHOT, true); // cell already shot
      expect(result.shots[0].executed).toBe(false); // cell already shot
    });

    it('should set items via setPlayerItems / setEnemyItems after construction', () => {
      const eng = new GameEngine({ boardWidth: 10, boardHeight: 10 });
      eng.initializeGame(playerShips, enemyShips);

      const playerItem = { coords: [1, 1] as [number, number], part: 1 };
      eng.setPlayerItems([playerItem]);

      const result = eng.executeShotPattern(1, 1, SINGLE_SHOT, false); // enemy shoots player board
      expect(result.shots[0].collected).toBe(true);
      expect(result.shots[0].itemId).toBe(0);
      expect(result.shots[0].itemFullyCollected).toBe(true);
    });

    it('setPlayerItems resets collected state', () => {
      const eng = new GameEngine({ boardWidth: 10, boardHeight: 10 });
      const items = [{ coords: [1, 1] as [number, number], part: 1 }];
      eng.initializeGame(playerShips, enemyShips, items, []);

      eng.executeShotPattern(1, 1, SINGLE_SHOT, false); // enemy collects player item
      expect(eng.getState().enemyCollectedItems).toContain(0);

      eng.setPlayerItems(items); // reset
      expect(eng.getState().enemyCollectedItems).toHaveLength(0);
    });

    it('setEnemyItems resets collected state', () => {
      engine.executeShotPattern(3, 3, SINGLE_SHOT, true); // collect item 0
      expect(engine.getState().playerCollectedItems).toContain(0);

      engine.setEnemyItems(enemyItems); // reset
      expect(engine.getState().playerCollectedItems).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Item usage tracking (markItemUsed / isItemUsed)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Items — markItemUsed / isItemUsed', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should return false for an item that has not been used', () => {
      expect(engine.isItemUsed(0, true)).toBe(false);
      expect(engine.isItemUsed(0, false)).toBe(false);
    });

    it('should return true after marking an item as used (player)', () => {
      engine.markItemUsed(0, true);
      expect(engine.isItemUsed(0, true)).toBe(true);
      expect(engine.isItemUsed(0, false)).toBe(false); // other side unaffected
    });

    it('should return true after marking an item as used (enemy)', () => {
      engine.markItemUsed(1, false);
      expect(engine.isItemUsed(1, false)).toBe(true);
      expect(engine.isItemUsed(1, true)).toBe(false);
    });

    it('marks are independent per side', () => {
      engine.markItemUsed(0, true);
      engine.markItemUsed(0, false);
      expect(engine.isItemUsed(0, true)).toBe(true);
      expect(engine.isItemUsed(0, false)).toBe(true);
    });

    it('used items appear in playerUsedItems / enemyUsedItems state', () => {
      engine.markItemUsed(2, true);
      engine.markItemUsed(3, false);

      const state = engine.getState();
      expect(state.playerUsedItems).toContain(2);
      expect(state.enemyUsedItems).toContain(3);
    });

    it('should reset used-item tracking after initializeGame', () => {
      engine.markItemUsed(0, true);
      engine.markItemUsed(0, false);

      engine.initializeGame(playerShips, enemyShips);

      expect(engine.isItemUsed(0, true)).toBe(false);
      expect(engine.isItemUsed(0, false)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Board rendering — getPlayerBoard / getEnemyBoard
  // ─────────────────────────────────────────────────────────────────────────
  describe('Board Rendering — getPlayerBoard', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should return a board with correct dimensions', () => {
      const board = engine.getPlayerBoard();
      expect(board).toHaveLength(10); // 10 rows
      expect(board[0]).toHaveLength(10); // 10 cols
    });

    it('should mark player ship cells as SHIP', () => {
      const board = engine.getPlayerBoard();
      // playerShip 0: coords [0,0], width 2 → (0,0) and (1,0)
      expect(board[0][0].state).toBe('SHIP');
      expect(board[0][1].state).toBe('SHIP');
      // non-ship cell
      expect(board[9][9].state).toBe('EMPTY');
    });

    it('should mark enemy-shot cells as HIT when a ship is hit', () => {
      engine.executeShotPattern(0, 0, SINGLE_SHOT, false); // enemy hits player ship at (0,0)
      const board = engine.getPlayerBoard();
      expect(board[0][0].state).toBe('HIT');
      expect(board[0][0].shot).toBeDefined();
    });

    it('should mark enemy-shot cells as MISS when no ship is hit', () => {
      engine.executeShotPattern(9, 9, SINGLE_SHOT, false); // enemy misses
      const board = engine.getPlayerBoard();
      expect(board[9][9].state).toBe('MISS');
      expect(board[9][9].shot).toBeDefined();
    });

    it('should include shot metadata in cell', () => {
      engine.executeShotPattern(0, 0, SINGLE_SHOT, false);
      const board = engine.getPlayerBoard();
      const cell = board[0][0];
      expect(cell.shot?.x).toBe(0);
      expect(cell.shot?.y).toBe(0);
      expect(cell.shot?.hit).toBe(true);
    });
  });

  describe('Board Rendering — getEnemyBoard', () => {
    const enemyItems = [{ coords: [1, 1] as [number, number], part: 1 }];

    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips, [], enemyItems);
    });

    it('should return a board with correct dimensions', () => {
      const board = engine.getEnemyBoard();
      expect(board).toHaveLength(10);
      expect(board[0]).toHaveLength(10);
    });

    it('should hide enemy ships (cells start as EMPTY)', () => {
      const board = engine.getEnemyBoard();
      // Enemy ship at [5,5] should NOT appear as SHIP (hidden from player)
      expect(board[5][5].state).toBe('EMPTY');
    });

    it('should mark item cells as ITEM before collection', () => {
      const board = engine.getEnemyBoard();
      expect(board[1][1].state).toBe('ITEM');
    });

    it('should mark player-shot cells as HIT when a ship is hit', () => {
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      const board = engine.getEnemyBoard();
      expect(board[5][5].state).toBe('HIT');
    });

    it('should mark player-shot cells as MISS when nothing is hit', () => {
      engine.executeShotPattern(9, 9, SINGLE_SHOT, true);
      const board = engine.getEnemyBoard();
      expect(board[9][9].state).toBe('MISS');
    });

    it('should mark collected item cells as COLLECTED', () => {
      engine.executeShotPattern(1, 1, SINGLE_SHOT, true); // collect the item
      const board = engine.getEnemyBoard();
      expect(board[1][1].state).toBe('COLLECTED');
    });

    it('should include shot metadata in cell', () => {
      engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
      const board = engine.getEnemyBoard();
      const cell = board[5][5];
      expect(cell.shot?.x).toBe(5);
      expect(cell.shot?.y).toBe(5);
      expect(cell.shot?.hit).toBe(true);
    });
  });
});
