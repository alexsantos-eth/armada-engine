import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from '../../engine/logic';
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

    it('should initialize with custom starting turn', () => {
      engine.initializeGame(playerShips, enemyShips, 'ENEMY_TURN');
      
      expect(engine.getCurrentTurn()).toBe('ENEMY_TURN');
      expect(engine.isEnemyTurn()).toBe(true);
      expect(engine.isPlayerTurn()).toBe(false);
    });

    it('should accept custom board dimensions', () => {
      const customEngine = new GameEngine({ boardWidth: 15, boardHeight: 12 });
      const dimensions = customEngine.getBoardDimensions();
      
      expect(dimensions.width).toBe(15);
      expect(dimensions.height).toBe(12);
    });
  });

  describe('Turn Management', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should start with player turn by default', () => {
      expect(engine.isPlayerTurn()).toBe(true);
      expect(engine.isEnemyTurn()).toBe(false);
      expect(engine.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('should switch to enemy turn', () => {
      engine.setEnemyTurn();
      
      expect(engine.isPlayerTurn()).toBe(false);
      expect(engine.isEnemyTurn()).toBe(true);
      expect(engine.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should toggle turns correctly', () => {
      const internal = engine.getInternalAPI();
      expect(engine.getCurrentTurn()).toBe('PLAYER_TURN');
      
      internal.toggleTurn();
      expect(engine.getCurrentTurn()).toBe('ENEMY_TURN');
      
      internal.toggleTurn();
      expect(engine.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('should call onTurnChange callback when turn changes', () => {
      const onTurnChange = vi.fn();
      const engineWithCallback = new GameEngine({}, { onTurnChange });
      const internal = engineWithCallback.getInternalAPI();
      
      // Toggle to enemy turn
      internal.toggleTurn();
      expect(onTurnChange).toHaveBeenCalledWith('ENEMY_TURN');
      
      // Toggle back to player turn
      internal.toggleTurn();
      expect(onTurnChange).toHaveBeenCalledWith('PLAYER_TURN');
    });
  });

  describe('Shot Execution', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should register a miss correctly', () => {
      const result = engine.executeShot(9, 9, true);
      
      expect(result.success).toBe(true);
      expect(result.hit).toBe(false);
      expect(result.shipId).toBe(-1);
      expect(result.shipDestroyed).toBe(false);
    });

    it('should register a hit correctly', () => {
      // Enemy ship at [5,5] horizontal, size 2
      const result = engine.executeShot(5, 5, true);
      
      expect(result.success).toBe(true);
      expect(result.hit).toBe(true);
      expect(result.shipId).toBe(0);
      expect(result.shipDestroyed).toBe(false);
    });

    it('should detect ship destruction', () => {
      // Enemy small ship at [5,5] horizontal, size 2
      engine.executeShot(5, 5, true); // First hit
      const result = engine.executeShot(6, 5, true); // Second hit - destroys ship
      
      expect(result.hit).toBe(true);
      expect(result.shipDestroyed).toBe(true);
    });

    it('should prevent shooting same cell twice', () => {
      engine.executeShot(5, 5, true);
      const result = engine.executeShot(5, 5, true);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cell already shot');
    });

    it('should track shots for both players separately', () => {
      engine.executeShot(5, 5, true); // Player shot
      engine.executeShot(0, 0, false); // Enemy shot
      
      const state = engine.getState();
      expect(state.playerShots).toHaveLength(1);
      expect(state.enemyShots).toHaveLength(1);
    });

    it('should call onShot callback', () => {
      const onShot = vi.fn();
      const engineWithCallback = new GameEngine({}, { onShot });
      engineWithCallback.initializeGame(playerShips, enemyShips);
      
      engineWithCallback.executeShot(9, 9, true);
      
      expect(onShot).toHaveBeenCalledWith(
        expect.objectContaining({ x: 9, y: 9, hit: false }),
        true
      );
    });

    it('should increment shot count', () => {
      expect(engine.getShotCount()).toBe(0);
      
      engine.executeShot(0, 0, true);
      expect(engine.getShotCount()).toBe(1);
      
      engine.executeShot(1, 1, false);
      expect(engine.getShotCount()).toBe(2);
    });
  });

  describe('Game Over Detection', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should detect when all enemy ships are destroyed', () => {
      // Destroy enemy ship 1 (small ship at [5,5], size 2)
      engine.executeShot(5, 5, true);
      engine.executeShot(6, 5, true);
      
      // Destroy enemy ship 2 (medium ship at [7,7], size 3)
      engine.executeShot(7, 7, true);
      engine.executeShot(7, 8, true);
      engine.executeShot(7, 9, true);
      
      const state = engine.getState();
      expect(state.areAllEnemyShipsDestroyed).toBe(true);
      expect(state.areAllPlayerShipsDestroyed).toBe(false);
      
      // Game over must be set manually (normally done by Match)
      const internal = engine.getInternalAPI();
      internal.setGameOver('player');
      expect(engine.getWinner()).toBe('player');
      expect(engine.getState().isGameOver).toBe(true);
    });

    it('should detect when all player ships are destroyed', () => {
      // Destroy player ship 1 (small ship at [0,0], size 2)
      engine.executeShot(0, 0, false);
      engine.executeShot(1, 0, false);
      
      // Destroy player ship 2 (medium ship at [2,2], size 3)
      engine.executeShot(2, 2, false);
      engine.executeShot(2, 3, false);
      engine.executeShot(2, 4, false);
      
      const state = engine.getState();
      expect(state.areAllPlayerShipsDestroyed).toBe(true);
      expect(state.areAllEnemyShipsDestroyed).toBe(false);
      
      // Game over must be set manually (normally done by Match)
      const internal = engine.getInternalAPI();
      internal.setGameOver('enemy');
      expect(engine.getWinner()).toBe('enemy');
      expect(engine.getState().isGameOver).toBe(true);
    });

    it('should call onGameOver callback when setGameOver is called', () => {
      const onGameOver = vi.fn();
      const engineWithCallback = new GameEngine({}, { onGameOver });
      engineWithCallback.initializeGame(playerShips, enemyShips);
      
      // Destroy all enemy ships
      engineWithCallback.executeShot(5, 5, true);
      engineWithCallback.executeShot(6, 5, true);
      engineWithCallback.executeShot(7, 7, true);
      engineWithCallback.executeShot(7, 8, true);
      engineWithCallback.executeShot(7, 9, true);
      
      // Manually set game over (normally done by Match)
      const internal = engineWithCallback.getInternalAPI();
      internal.setGameOver('player');
      
      expect(onGameOver).toHaveBeenCalledWith('player');
    });

    it('should check areAllShipsDestroyed helper method', () => {
      // Destroy all enemy ships
      engine.executeShot(5, 5, true);
      engine.executeShot(6, 5, true);
      engine.executeShot(7, 7, true);
      engine.executeShot(7, 8, true);
      engine.executeShot(7, 9, true);
      
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
      
      engine.executeShot(5, 5, true);
      
      expect(engine.isCellShot(5, 5, true)).toBe(true);
      expect(engine.isCellShot(5, 5, false)).toBe(false); // Different player
    });

    it('should get shot at position', () => {
      engine.executeShot(5, 5, true);
      
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

    it('should call onStateChange callback on significant changes', () => {
      const onStateChange = vi.fn();
      const engineWithCallback = new GameEngine({}, { onStateChange });
      
      engineWithCallback.initializeGame(playerShips, enemyShips);
      expect(onStateChange).toHaveBeenCalled();
      
      onStateChange.mockClear();
      engineWithCallback.executeShot(5, 5, true);
      expect(onStateChange).toHaveBeenCalled();
    });

    it('should reset game state', () => {
      engine.executeShot(5, 5, true);
      engine.setEnemyTurn();
      
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
      const hit = engine.checkShot(5, 5, true);
      expect(hit.hit).toBe(true);
      expect(hit.shipId).toBe(0);
      
      const miss = engine.checkShot(9, 9, true);
      expect(miss.hit).toBe(false);
      expect(miss.shipId).toBe(-1);
    });

    it('should check shot against player ships for enemy', () => {
      const hit = engine.checkShot(0, 0, false);
      expect(hit.hit).toBe(true);
      expect(hit.shipId).toBe(0);
      
      const miss = engine.checkShot(9, 9, false);
      expect(miss.hit).toBe(false);
      expect(miss.shipId).toBe(-1);
    });
  });

  describe('Ship Status', () => {
    beforeEach(() => {
      engine.initializeGame(playerShips, enemyShips);
    });

    it('should track ship destruction status', () => {
      // Enemy small ship at [5,5], size 2
      expect(engine.isShipDestroyed(0, true)).toBe(false);
      
      engine.executeShot(5, 5, true);
      expect(engine.isShipDestroyed(0, true)).toBe(false);
      
      engine.executeShot(6, 5, true);
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
      engine.initializeGame(playerShips, enemyShips, 'PLAYER_TURN', [], enemyItems);
    });

    it('should reflect items in state after initializeGame', () => {
      const state = engine.getState();
      expect(state.enemyItems).toHaveLength(2);
      expect(state.playerItems).toHaveLength(0);
      expect(state.playerCollectedItems).toHaveLength(0);
      expect(state.enemyCollectedItems).toHaveLength(0);
    });

    it('should mark a shot as collected when hitting an item cell', () => {
      const result = engine.executeShot(3, 3, true);

      expect(result.success).toBe(true);
      expect(result.hit).toBe(false);       // items are not ship hits
      expect(result.collected).toBe(true);
      expect(result.itemId).toBe(0);
      expect(result.itemFullyCollected).toBe(true); // single-part item
    });

    it('should not fully collect a multi-part item until all parts are shot', () => {
      const r1 = engine.executeShot(6, 6, true); // first part
      expect(r1.collected).toBe(true);
      expect(r1.itemFullyCollected).toBe(false);

      const r2 = engine.executeShot(7, 6, true); // second part
      expect(r2.collected).toBe(true);
      expect(r2.itemFullyCollected).toBe(true);
    });

    it('should add item index to playerCollectedItems once fully collected', () => {
      engine.executeShot(3, 3, true);

      const state = engine.getState();
      expect(state.playerCollectedItems).toContain(0);
    });

    it('should not re-collect an already collected item', () => {
      engine.executeShot(6, 6, true);
      engine.executeShot(7, 6, true); // fully collected

      // Trying to shoot a cell of an already-collected item returns null (no second collection)
      const result = engine.executeShot(6, 6, true); // cell already shot
      expect(result.success).toBe(false); // cell already shot
    });

    it('should fire onItemCollected callback when an item is fully collected', () => {
      const onItemCollected = vi.fn();
      const eng = new GameEngine({}, { onItemCollected });
      eng.initializeGame(playerShips, enemyShips, 'PLAYER_TURN', [], enemyItems);

      eng.executeShot(3, 3, true);

      expect(onItemCollected).toHaveBeenCalledTimes(1);
      const [shot, item, isPlayerShot] = onItemCollected.mock.calls[0];
      expect(shot.x).toBe(3);
      expect(shot.y).toBe(3);
      expect(item).toMatchObject({ coords: [3, 3], part: 1 });
      expect(isPlayerShot).toBe(true);
    });

    it('should NOT fire onItemCollected for a partial collection', () => {
      const onItemCollected = vi.fn();
      const eng = new GameEngine({}, { onItemCollected });
      eng.initializeGame(playerShips, enemyShips, 'PLAYER_TURN', [], enemyItems);

      eng.executeShot(6, 6, true); // only first of two parts

      expect(onItemCollected).not.toHaveBeenCalled();
    });

    it('should set items via setPlayerItems / setEnemyItems after construction', () => {
      const eng = new GameEngine({ boardWidth: 10, boardHeight: 10 });
      eng.initializeGame(playerShips, enemyShips);

      const playerItem = { coords: [1, 1] as [number, number], part: 1 };
      eng.setPlayerItems([playerItem]);

      const result = eng.executeShot(1, 1, false); // enemy shoots player board
      expect(result.collected).toBe(true);
      expect(result.itemId).toBe(0);
      expect(result.itemFullyCollected).toBe(true);
    });

    it('setPlayerItems resets collected state', () => {
      const eng = new GameEngine({ boardWidth: 10, boardHeight: 10 });
      const items = [{ coords: [1, 1] as [number, number], part: 1 }];
      eng.initializeGame(playerShips, enemyShips, 'PLAYER_TURN', items, []);

      eng.executeShot(1, 1, false); // enemy collects player item
      expect(eng.getState().enemyCollectedItems).toContain(0);

      eng.setPlayerItems(items); // reset
      expect(eng.getState().enemyCollectedItems).toHaveLength(0);
    });

    it('setEnemyItems resets collected state', () => {
      engine.executeShot(3, 3, true); // collect item 0
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
      engine.executeShot(0, 0, false); // enemy hits player ship at (0,0)
      const board = engine.getPlayerBoard();
      expect(board[0][0].state).toBe('HIT');
      expect(board[0][0].shot).toBeDefined();
    });

    it('should mark enemy-shot cells as MISS when no ship is hit', () => {
      engine.executeShot(9, 9, false); // enemy misses
      const board = engine.getPlayerBoard();
      expect(board[9][9].state).toBe('MISS');
      expect(board[9][9].shot).toBeDefined();
    });

    it('should include shot metadata in cell', () => {
      engine.executeShot(0, 0, false);
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
      engine.initializeGame(playerShips, enemyShips, 'PLAYER_TURN', [], enemyItems);
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
      engine.executeShot(5, 5, true);
      const board = engine.getEnemyBoard();
      expect(board[5][5].state).toBe('HIT');
    });

    it('should mark player-shot cells as MISS when nothing is hit', () => {
      engine.executeShot(9, 9, true);
      const board = engine.getEnemyBoard();
      expect(board[9][9].state).toBe('MISS');
    });

    it('should mark collected item cells as COLLECTED', () => {
      engine.executeShot(1, 1, true); // collect the item
      const board = engine.getEnemyBoard();
      expect(board[1][1].state).toBe('COLLECTED');
    });

    it('should include shot metadata in cell', () => {
      engine.executeShot(5, 5, true);
      const board = engine.getEnemyBoard();
      const cell = board[5][5];
      expect(cell.shot?.x).toBe(5);
      expect(cell.shot?.y).toBe(5);
      expect(cell.shot?.hit).toBe(true);
    });
  });
});
