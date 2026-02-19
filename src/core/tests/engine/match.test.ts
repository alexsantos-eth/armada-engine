import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Match } from '../../engine/match';
import type { GameShip } from '../../types/common';
import { ClassicRuleSet, AlternatingTurnsRuleSet } from '../../engine/rulesets';

describe('Match', () => {
  let match: Match;
  let playerShips: GameShip[];
  let enemyShips: GameShip[];

  beforeEach(() => {
    match = new Match({ boardWidth: 10, boardHeight: 10 });
    
    playerShips = [
      { coords: [0, 0], variant: 'small', orientation: 'horizontal', shipId: 0 },
      { coords: [2, 2], variant: 'medium', orientation: 'vertical', shipId: 1 },
    ];
    
    enemyShips = [
      { coords: [5, 5], variant: 'small', orientation: 'horizontal', shipId: 0 },
      { coords: [7, 7], variant: 'medium', orientation: 'vertical', shipId: 1 },
    ];
  });

  describe('Match Initialization', () => {
    it('should initialize a match with ships', () => {
      match.initializeMatch(playerShips, enemyShips);
      
      const state = match.getState();
      expect(state.playerShips).toHaveLength(2);
      expect(state.enemyShips).toHaveLength(2);
      expect(state.currentTurn).toBe('PLAYER_TURN');
    });

    it('should initialize with custom starting turn', () => {
      match.initializeMatch(playerShips, enemyShips, 'ENEMY_TURN');
      
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN');
      expect(match.isEnemyTurn()).toBe(true);
    });

    it('should call onMatchStart callback', () => {
      const onMatchStart = vi.fn();
      const matchWithCallback = new Match({ boardWidth: 10, boardHeight: 10 }, { onMatchStart });
      
      matchWithCallback.initializeMatch(playerShips, enemyShips);
      
      expect(onMatchStart).toHaveBeenCalled();
    });
  });

  describe('Match Rules - Hit Continuation', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should allow shooting again after a hit (ship not destroyed)', () => {
      // Enemy medium ship at [7,7], size 3
      const result = match.executeShot(7, 7, true);
      
      expect(result.success).toBe(true);
      expect(result.hit).toBe(true);
      expect(result.shipDestroyed).toBe(false);
      expect(result.turnEnded).toBe(false);
      expect(result.canShootAgain).toBe(true);
      expect(result.reason).toBe('Hit - shoot again');
      expect(match.getCurrentTurn()).toBe('PLAYER_TURN'); // Turn doesn't change
    });

    it('should end turn after miss', () => {
      const result = match.executeShot(0, 0, true); // Miss
      
      expect(result.success).toBe(true);
      expect(result.hit).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.reason).toBe('Miss - turn ends');
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN'); // Turn changes
    });

    it('should end turn after ship destruction', () => {
      // Enemy small ship at [5,5], size 2
      match.executeShot(5, 5, true); // First hit
      const result = match.executeShot(6, 5, true); // Second hit - destroys
      
      expect(result.success).toBe(true);
      expect(result.hit).toBe(true);
      expect(result.shipDestroyed).toBe(true);
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.reason).toBe('Ship destroyed - turn ends');
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN'); // Turn changes
    });
  });

  describe('Match Rules - Turn Sequence', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should allow multiple hits in same turn if ship not destroyed', () => {
      // Enemy medium ship at [7,7] vertical, size 3
      const hit1 = match.executeShot(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      expect(match.getCurrentTurn()).toBe('PLAYER_TURN');
      
      const hit2 = match.executeShot(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      expect(match.getCurrentTurn()).toBe('PLAYER_TURN');
      
      // Third hit destroys the ship
      const hit3 = match.executeShot(7, 9, true);
      expect(hit3.shipDestroyed).toBe(true);
      expect(hit3.turnEnded).toBe(true);
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should alternate turns correctly with misses', () => {
      expect(match.isPlayerTurn()).toBe(true);
      
      // Player misses
      match.executeShot(0, 0, true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy misses
      match.executeShot(9, 9, false);
      expect(match.isPlayerTurn()).toBe(true);
    });

    it('should handle complex turn sequence', () => {
      // Player hits but doesn't destroy
      const r1 = match.executeShot(7, 7, true);
      expect(r1.canShootAgain).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
      
      // Player misses on second shot
      const r2 = match.executeShot(0, 0, true);
      expect(r2.turnEnded).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy hits player ship
      const r3 = match.executeShot(0, 0, false);
      expect(r3.canShootAgain).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy destroys player small ship
      const r4 = match.executeShot(1, 0, false);
      expect(r4.shipDestroyed).toBe(true);
      expect(r4.turnEnded).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
    });
  });

  describe('Match Rules - Game Over', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should end match when all enemy ships destroyed', () => {
      // Destroy enemy ship 1 (small at [5,5])
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      
      // Turn should switch after destruction
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy misses to give turn back
      match.executeShot(9, 9, false);
      
      // Destroy enemy ship 2 (medium at [7,7])
      match.executeShot(7, 7, true);
      match.executeShot(7, 8, true);
      const result = match.executeShot(7, 9, true);
      
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('player');
      expect(match.isMatchOver()).toBe(true);
      expect(match.getWinner()).toBe('player');
    });

    it('should provide game over reason', () => {
      // Destroy all enemy ships
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      match.executeShot(9, 9, false); // Enemy miss to switch turn
      match.executeShot(7, 7, true);
      match.executeShot(7, 8, true);
      const result = match.executeShot(7, 9, true);
      
      expect(result.reason).toBe('Game over');
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
    });
  });

  describe('RuleSet - Classic Rules', () => {
    let classicMatch: Match;

    beforeEach(() => {
      classicMatch = new Match(
        { boardWidth: 10, boardHeight: 10 },
        undefined,
        ClassicRuleSet
      );
      classicMatch.initializeMatch(playerShips, enemyShips);
    });

    it('should use Classic ruleset by default', () => {
      const defaultMatch = new Match({ boardWidth: 10, boardHeight: 10 });
      defaultMatch.initializeMatch(playerShips, enemyShips);
      
      // Classic rule: hit allows shooting again
      const result = defaultMatch.executeShot(7, 7, true);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
    });

    it('should allow shooting again after hit (ship not destroyed)', () => {
      const result = classicMatch.executeShot(7, 7, true);
      
      expect(result.hit).toBe(true);
      expect(result.shipDestroyed).toBe(false);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
      expect(result.reason).toBe('Hit - shoot again');
      expect(classicMatch.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('should end turn after miss', () => {
      const result = classicMatch.executeShot(0, 0, true);
      
      expect(result.hit).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Miss - turn ends');
      expect(classicMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should end turn after ship destruction', () => {
      classicMatch.executeShot(5, 5, true);
      const result = classicMatch.executeShot(6, 5, true);
      
      expect(result.shipDestroyed).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Ship destroyed - turn ends');
      expect(classicMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should allow multiple consecutive hits before destruction', () => {
      // Medium ship has 3 cells
      const hit1 = classicMatch.executeShot(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      expect(classicMatch.isPlayerTurn()).toBe(true);

      const hit2 = classicMatch.executeShot(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      expect(classicMatch.isPlayerTurn()).toBe(true);

      const hit3 = classicMatch.executeShot(7, 9, true);
      expect(hit3.shipDestroyed).toBe(true);
      expect(hit3.canShootAgain).toBe(false);
      expect(hit3.turnEnded).toBe(true);
      expect(classicMatch.isEnemyTurn()).toBe(true);
    });
  });

  describe('RuleSet - Alternating Turns', () => {
    let alternatingMatch: Match;

    beforeEach(() => {
      alternatingMatch = new Match(
        { boardWidth: 10, boardHeight: 10 },
        undefined,
        AlternatingTurnsRuleSet
      );
      alternatingMatch.initializeMatch(playerShips, enemyShips);
    });

    it('should end turn after hit (no continuation on hit)', () => {
      const result = alternatingMatch.executeShot(7, 7, true);
      
      expect(result.hit).toBe(true);
      expect(result.shipDestroyed).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Hit - turn ends');
      expect(alternatingMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should end turn after miss', () => {
      const result = alternatingMatch.executeShot(0, 0, true);
      
      expect(result.hit).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Miss - turn ends');
      expect(alternatingMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should end turn after ship destruction', () => {
      alternatingMatch.executeShot(5, 5, true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
      
      alternatingMatch.executeShot(9, 9, false); // Enemy miss
      expect(alternatingMatch.isPlayerTurn()).toBe(true);
      
      const result = alternatingMatch.executeShot(6, 5, true);
      
      expect(result.shipDestroyed).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(alternatingMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should strictly alternate turns on consecutive hits', () => {
      // Hit 1 - turn ends
      const hit1 = alternatingMatch.executeShot(7, 7, true);
      expect(hit1.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy miss - turn ends
      alternatingMatch.executeShot(9, 9, false);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);

      // Hit 2 - turn ends
      const hit2 = alternatingMatch.executeShot(7, 8, true);
      expect(hit2.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy miss - turn ends
      alternatingMatch.executeShot(9, 8, false);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);

      // Hit 3 - destroys ship, turn ends
      const hit3 = alternatingMatch.executeShot(7, 9, true);
      expect(hit3.shipDestroyed).toBe(true);
      expect(hit3.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
    });

    it('should work correctly with both players', () => {
      // Player hits
      const p1 = alternatingMatch.executeShot(5, 5, true);
      expect(p1.hit).toBe(true);
      expect(p1.turnEnded).toBe(true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy hits
      const e1 = alternatingMatch.executeShot(0, 0, false);
      expect(e1.hit).toBe(true);
      expect(e1.turnEnded).toBe(true);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);

      // Player misses
      const p2 = alternatingMatch.executeShot(0, 0, true);
      expect(p2.hit).toBe(false);
      expect(p2.turnEnded).toBe(true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy misses
      const e2 = alternatingMatch.executeShot(9, 9, false);
      expect(e2.hit).toBe(false);
      expect(e2.turnEnded).toBe(true);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);
    });
  });

  describe('RuleSet - Comparison', () => {
    let classicMatch: Match;
    let alternatingMatch: Match;

    beforeEach(() => {
      classicMatch = new Match(
        { boardWidth: 10, boardHeight: 10 },
        undefined,
        ClassicRuleSet
      );
      alternatingMatch = new Match(
        { boardWidth: 10, boardHeight: 10 },
        undefined,
        AlternatingTurnsRuleSet
      );
      
      classicMatch.initializeMatch(playerShips, enemyShips);
      alternatingMatch.initializeMatch(playerShips, enemyShips);
    });

    it('should behave differently on hits between rulesets', () => {
      // Classic: hit allows shooting again
      const classicResult = classicMatch.executeShot(7, 7, true);
      expect(classicResult.canShootAgain).toBe(true);
      expect(classicMatch.isPlayerTurn()).toBe(true);

      // Alternating: hit ends turn
      const alternatingResult = alternatingMatch.executeShot(7, 7, true);
      expect(alternatingResult.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
    });

    it('should behave the same on misses', () => {
      // Both end turn on miss
      const classicResult = classicMatch.executeShot(0, 0, true);
      expect(classicResult.turnEnded).toBe(true);
      expect(classicMatch.isEnemyTurn()).toBe(true);

      const alternatingResult = alternatingMatch.executeShot(0, 0, true);
      expect(alternatingResult.turnEnded).toBe(true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
    });

    it('should have different game pace', () => {
      // Classic: can destroy ship in one turn with consecutive hits
      classicMatch.executeShot(5, 5, true);
      const classicDestroy = classicMatch.executeShot(6, 5, true);
      expect(classicDestroy.shipDestroyed).toBe(true);
      expect(classicMatch.getState().shotCount).toBe(2);

      // Alternating: requires multiple turns to destroy ship
      alternatingMatch.executeShot(5, 5, true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
      
      alternatingMatch.executeShot(9, 9, false); // Enemy turn
      expect(alternatingMatch.isPlayerTurn()).toBe(true);
      
      const alternatingDestroy = alternatingMatch.executeShot(6, 5, true);
      expect(alternatingDestroy.shipDestroyed).toBe(true);
      expect(alternatingMatch.getState().shotCount).toBe(3); // More shots needed
    });
  });

  describe('Shot Validation', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should reject already shot cells', () => {
      match.executeShot(5, 5, true);
      const result = match.executeShot(5, 5, true);
      
      expect(result.success).toBe(false);
      expect(result.turnEnded).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should check if cell has been shot', () => {
      expect(match.isCellShot(5, 5, true)).toBe(false);
      
      match.executeShot(5, 5, true);
      
      expect(match.isCellShot(5, 5, true)).toBe(true);
    });

    it('should validate position bounds', () => {
      expect(match.isValidPosition(0, 0)).toBe(true);
      expect(match.isValidPosition(9, 9)).toBe(true);
      expect(match.isValidPosition(-1, 0)).toBe(false);
      expect(match.isValidPosition(10, 10)).toBe(false);
    });

    it('should get shot at position', () => {
      match.executeShot(5, 5, true);
      
      const shot = match.getShotAtPosition(5, 5, true);
      expect(shot).toBeDefined();
      expect(shot?.x).toBe(5);
      expect(shot?.y).toBe(5);
    });
  });

  describe('Match State', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should provide complete match state', () => {
      const state = match.getState();
      
      expect(state).toHaveProperty('currentTurn');
      expect(state).toHaveProperty('playerShips');
      expect(state).toHaveProperty('enemyShips');
      expect(state).toHaveProperty('playerShots');
      expect(state).toHaveProperty('enemyShots');
      expect(state).toHaveProperty('isGameOver');
      expect(state).toHaveProperty('winner');
    });

    it('should allow resetting match', () => {
      match.executeShot(5, 5, true);
      
      match.resetMatch();
      
      const state = match.getState();
      expect(state.playerShots).toHaveLength(0);
      expect(state.enemyShots).toHaveLength(0);
      expect(state.shotCount).toBe(0);
    });

    it('should get board dimensions', () => {
      const dimensions = match.getBoardDimensions();
      
      expect(dimensions.width).toBe(10);
      expect(dimensions.height).toBe(10);
    });

    it('should check ship positions', () => {
      expect(match.hasShipAtPosition(0, 0, true)).toBe(true); // Player ship
      expect(match.hasShipAtPosition(5, 5, false)).toBe(true); // Enemy ship
      expect(match.hasShipAtPosition(9, 9, true)).toBe(false); // Empty
    });
  });

  describe('Match Callbacks', () => {
    it('should call onStateChange callback', () => {
      const onStateChange = vi.fn();
      const matchWithCallback = new Match({ boardWidth: 10, boardHeight: 10 }, { onStateChange });
      
      matchWithCallback.initializeMatch(playerShips, enemyShips);
      
      expect(onStateChange).toHaveBeenCalled();
    });

    it('should call onTurnChange callback', () => {
      const onTurnChange = vi.fn();
      const matchWithCallback = new Match({ boardWidth: 10, boardHeight: 10 }, { onTurnChange });
      
      matchWithCallback.initializeMatch(playerShips, enemyShips);
      
      // Miss to trigger turn change
      matchWithCallback.executeShot(0, 0, true);
      
      expect(onTurnChange).toHaveBeenCalledWith('ENEMY_TURN');
    });

    it('should call onShot callback', () => {
      const onShot = vi.fn();
      const matchWithCallback = new Match({ boardWidth: 10, boardHeight: 10 }, { onShot });
      
      matchWithCallback.initializeMatch(playerShips, enemyShips);
      
      matchWithCallback.executeShot(5, 5, true);
      
      expect(onShot).toHaveBeenCalledWith(
        expect.objectContaining({ x: 5, y: 5 }),
        true
      );
    });

    it('should call onGameOver callback', () => {
      const onGameOver = vi.fn();
      const matchWithCallback = new Match({ boardWidth: 10, boardHeight: 10 }, { onGameOver });
      
      matchWithCallback.initializeMatch(playerShips, enemyShips);
      
      // Destroy all enemy ships
      matchWithCallback.executeShot(5, 5, true);
      matchWithCallback.executeShot(6, 5, true);
      matchWithCallback.executeShot(9, 9, false);
      matchWithCallback.executeShot(7, 7, true);
      matchWithCallback.executeShot(7, 8, true);
      matchWithCallback.executeShot(7, 9, true);
      
      expect(onGameOver).toHaveBeenCalledWith('player');
    });
  });

  describe('Engine Access', () => {
    it('should provide access to underlying engine', () => {
      const engine = match.getEngine();
      
      expect(engine).toBeDefined();
      expect(typeof engine.getState).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should handle shot on last cell of destroyed ship', () => {
      // Destroy small ship completely
      match.executeShot(5, 5, true);
      const result = match.executeShot(6, 5, true);
      
      expect(result.shipDestroyed).toBe(true);
      expect(result.turnEnded).toBe(true);
    });

    it('should maintain turn logic when game ends', () => {
      // Destroy all enemy ships
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      match.executeShot(9, 9, false);
      match.executeShot(7, 7, true);
      match.executeShot(7, 8, true);
      const result = match.executeShot(7, 9, true);
      
      expect(result.isGameOver).toBe(true);
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
    });

    it('should handle rapid hits on same ship', () => {
      // Hit medium ship multiple times in succession
      const r1 = match.executeShot(7, 7, true);
      expect(r1.canShootAgain).toBe(true);
      
      const r2 = match.executeShot(7, 8, true);
      expect(r2.canShootAgain).toBe(true);
      
      const r3 = match.executeShot(7, 9, true);
      expect(r3.shipDestroyed).toBe(true);
      expect(r3.turnEnded).toBe(true);
    });
  });

  describe('Both Players Shooting', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should handle both players following match rules', () => {
      // Player hits enemy ship
      const p1 = match.executeShot(7, 7, true);
      expect(p1.canShootAgain).toBe(true);
      
      // Player misses
      const p2 = match.executeShot(0, 0, true);
      expect(p2.turnEnded).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy hits player ship
      const e1 = match.executeShot(0, 0, false);
      expect(e1.canShootAgain).toBe(true);
      
      // Enemy destroys player ship
      const e2 = match.executeShot(1, 0, false);
      expect(e2.shipDestroyed).toBe(true);
      expect(e2.turnEnded).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
    });
  });

  describe('Phase System', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should return phase information in shot result', () => {
      const result = match.executeShot(5, 5, true);
      
      expect(result).toHaveProperty('phase');
      expect(result.phase).toBeDefined();
    });

    it('should return TURN phase for successful shots', () => {
      const result = match.executeShot(5, 5, true);
      
      expect(result.phase).toBe('TURN');
    });

    it('should return ATTACK phase for failed shots', () => {
      match.executeShot(5, 5, true);
      const result = match.executeShot(5, 5, true); // Duplicate
      
      expect(result.phase).toBe('ATTACK');
      expect(result.success).toBe(false);
    });
  });

  describe('Game Over - Immediate Detection', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should detect game over immediately when last ship destroyed', () => {
      // Destroy first enemy ship
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      
      // Turn switches after ship destruction
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy misses to give turn back
      match.executeShot(9, 9, false);
      expect(match.isPlayerTurn()).toBe(true);
      
      // Destroy second enemy ship partially
      match.executeShot(7, 7, true);
      expect(match.isPlayerTurn()).toBe(true); // Still player turn (hit but not destroyed)
      
      match.executeShot(7, 8, true);
      expect(match.isPlayerTurn()).toBe(true); // Still player turn (hit but not destroyed)
      
      // Destroy last piece of last ship
      const finalShot = match.executeShot(7, 9, true);
      
      // Should detect game over immediately, not allowing shoot again despite hit
      expect(finalShot.hit).toBe(true);
      expect(finalShot.shipDestroyed).toBe(true);
      expect(finalShot.isGameOver).toBe(true);
      expect(finalShot.winner).toBe('player');
      expect(finalShot.canShootAgain).toBe(false); // Game over takes priority
      expect(finalShot.turnEnded).toBe(true);
      expect(finalShot.reason).toBe('Game over');
      
      expect(match.isMatchOver()).toBe(true);
      expect(match.getWinner()).toBe('player');
    });

    it('should detect game over on last hit even if it would normally allow shooting again', () => {
      // Set up: destroy first ship
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      match.executeShot(9, 9, false); // Enemy miss
      
      // Destroy second ship in one continuous turn
      const hit1 = match.executeShot(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      
      const hit2 = match.executeShot(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      
      // Last hit should trigger game over, not "shoot again"
      const finalHit = match.executeShot(7, 9, true);
      expect(finalHit.canShootAgain).toBe(false);
      expect(finalHit.isGameOver).toBe(true);
      expect(finalHit.reason).toBe('Game over');
    });
  });

  describe('Match State Updates', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should include ship destruction status in state', () => {
      const state = match.getState();
      
      expect(state).toHaveProperty('areAllPlayerShipsDestroyed');
      expect(state).toHaveProperty('areAllEnemyShipsDestroyed');
      expect(state.areAllPlayerShipsDestroyed).toBe(false);
      expect(state.areAllEnemyShipsDestroyed).toBe(false);
    });

    it('should update ship destruction status after destroying all ships', () => {
      // Destroy all enemy ships
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      match.executeShot(9, 9, false);
      match.executeShot(7, 7, true);
      match.executeShot(7, 8, true);
      match.executeShot(7, 9, true);
      
      const state = match.getState();
      expect(state.areAllEnemyShipsDestroyed).toBe(true);
      expect(state.areAllPlayerShipsDestroyed).toBe(false);
    });

    it('should check if all ships destroyed using dedicated method', () => {
      expect(match.areAllShipsDestroyed(true)).toBe(false);
      expect(match.areAllShipsDestroyed(false)).toBe(false);

      // Destroy all enemy ships
      match.executeShot(5, 5, true);
      match.executeShot(6, 5, true);
      match.executeShot(9, 9, false);
      match.executeShot(7, 7, true);
      match.executeShot(7, 8, true);
      match.executeShot(7, 9, true);

      expect(match.areAllShipsDestroyed(false)).toBe(true);
      expect(match.areAllShipsDestroyed(true)).toBe(false);
    });
  });

  describe('RuleSet Management', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should get current ruleset', () => {
      const ruleSet = match.getRuleSet();
      expect(ruleSet).toBeDefined();
      expect(ruleSet.name).toBe('Classic');
    });

    it('should allow changing ruleset during match', () => {
      const initialRuleSet = match.getRuleSet();
      expect(initialRuleSet.name).toBe('Classic');

      // Classic: hit allows shooting again
      const hit1 = match.executeShot(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);

      // Change to alternating rules
      match.setRuleSet(AlternatingTurnsRuleSet);
      const newRuleSet = match.getRuleSet();
      expect(newRuleSet.name).toBe('Alternating');

      // Player misses to switch turn
      match.executeShot(0, 0, true);
      match.executeShot(9, 9, false); // Enemy miss

      // Now with alternating rules: hit should end turn
      const hit2 = match.executeShot(7, 8, true);
      expect(hit2.canShootAgain).toBe(false);
      expect(hit2.turnEnded).toBe(true);
    });

    it('should use provided ruleset in constructor', () => {
      const alternatingMatch = new Match(
        { boardWidth: 10, boardHeight: 10 },
        undefined,
        AlternatingTurnsRuleSet
      );

      const ruleSet = alternatingMatch.getRuleSet();
      expect(ruleSet.name).toBe('Alternating');
    });
  });

  describe('Phase Management', () => {
    it('should start in IDLE phase', () => {
      const newMatch = new Match({ boardWidth: 10, boardHeight: 10 });
      expect(newMatch.getPhase()).toBe('IDLE');
    });

    it('should call setPhase with START on initialization', () => {
      const onPhaseChange = vi.fn();
      const newMatch = new Match({ boardWidth: 10, boardHeight: 10 }, { onPhaseChange });
      
      newMatch.initializeMatch(playerShips, enemyShips);
      
      expect(onPhaseChange).toHaveBeenCalledWith('START');
    });

    it('should cycle through phases during shot execution', () => {
      const newMatch = new Match({ boardWidth: 10, boardHeight: 10 });
      newMatch.initializeMatch(playerShips, enemyShips);
      
      // Execute a shot - should cycle through phases
      const result = newMatch.executeShot(5, 5, true);
      
      // Shot succeeded, should end in TURN phase
      expect(result.phase).toBe('TURN');
      expect(newMatch.getPhase()).toBe('TURN');
    });

    it('should be in ATTACK phase when shot fails validation', () => {
      match.initializeMatch(playerShips, enemyShips);
      
      // First shot succeeds
      match.executeShot(5, 5, true);
      
      // Try shooting same cell again - should fail in ATTACK phase
      const result = match.executeShot(5, 5, true);
      expect(result.success).toBe(false);
      expect(result.phase).toBe('ATTACK');
    });

    it('should call onPhaseChange callback during shot', () => {
      const onPhaseChange = vi.fn();
      const matchWithCallback = new Match(
        { boardWidth: 10, boardHeight: 10 },
        { onPhaseChange }
      );

      matchWithCallback.initializeMatch(playerShips, enemyShips);
      matchWithCallback.executeShot(5, 5, true);
      
      // Should have called PLAN, ATTACK, and TURN
      expect(onPhaseChange).toHaveBeenCalled();
      expect(onPhaseChange).toHaveBeenCalledWith('TURN');
    });
  });

  describe('Enemy Victory (Player Ships Destroyed)', () => {
    beforeEach(() => {
      match.initializeMatch(playerShips, enemyShips);
    });

    it('should end match when all player ships destroyed', () => {
      // Player misses to give enemy turn
      match.executeShot(9, 9, true);
      expect(match.isEnemyTurn()).toBe(true);

      // Enemy destroys player ship 1 (small at [0,0])
      match.executeShot(0, 0, false);
      match.executeShot(1, 0, false);

      // Turn switches after destruction
      expect(match.isPlayerTurn()).toBe(true);

      // Player misses
      match.executeShot(9, 8, true);

      // Enemy destroys player ship 2 (medium at [2,2] vertical)
      match.executeShot(2, 2, false);
      match.executeShot(2, 3, false);
      const result = match.executeShot(2, 4, false);

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('enemy');
      expect(match.isMatchOver()).toBe(true);
      expect(match.getWinner()).toBe('enemy');
    });

    it('should detect enemy victory with alternating ruleset', () => {
      const alternatingMatch = new Match(
        { boardWidth: 10, boardHeight: 10 },
        undefined,
        AlternatingTurnsRuleSet
      );
      alternatingMatch.initializeMatch(playerShips, enemyShips);

      // Alternately destroy all player ships
      alternatingMatch.executeShot(9, 9, true); // Player miss
      alternatingMatch.executeShot(0, 0, false); // Enemy hit
      alternatingMatch.executeShot(9, 8, true); // Player miss
      alternatingMatch.executeShot(1, 0, false); // Enemy destroys ship 1
      
      alternatingMatch.executeShot(9, 7, true); // Player miss
      alternatingMatch.executeShot(2, 2, false); // Enemy hit
      alternatingMatch.executeShot(9, 6, true); // Player miss
      alternatingMatch.executeShot(2, 3, false); // Enemy hit
      alternatingMatch.executeShot(9, 5, true); // Player miss
      const result = alternatingMatch.executeShot(2, 4, false); // Enemy destroys ship 2

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('enemy');
    });

    it('should provide correct reason on enemy victory', () => {
      // Player misses
      match.executeShot(9, 9, true);

      // Enemy destroys all player ships
      match.executeShot(0, 0, false);
      match.executeShot(1, 0, false);
      match.executeShot(9, 8, true); // Player miss
      match.executeShot(2, 2, false);
      match.executeShot(2, 3, false);
      const result = match.executeShot(2, 4, false);

      expect(result.reason).toBe('Game over');
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
    });
  });
});
