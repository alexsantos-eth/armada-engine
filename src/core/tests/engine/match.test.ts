import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Match, createMatch } from '../../engine/match';
import type { IGameSetupProvider, GameSetup } from '../../manager';
import type { GameShip, GameItem } from '../../types/entities';
import { ClassicRuleSet, AlternatingTurnsRuleSet, ItemHitRuleSet, LoseTurnOnUseRuleSet } from '../../constants/rulesets';
import { StandardBoardView, withView } from '../../engine';

describe('Match', () => {
  let match: Match;
  let playerShips: GameShip[];
  let enemyShips: GameShip[];

  beforeEach(() => {
    playerShips = [
      { coords: [0, 0], width: 2, height: 1, shipId: 0 },
      { coords: [2, 2], width: 1, height: 3, shipId: 1 },
    ];

    enemyShips = [
      { coords: [5, 5], width: 2, height: 1, shipId: 0 },
      { coords: [7, 7], width: 1, height: 3, shipId: 1 },
    ];

    match = new Match({
      setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
    });
  });

  describe('Match constructor / createMatch factory', () => {
    it('new Match throws when neither setup nor setupProvider is given', () => {
      expect(() => new Match({} as any)).toThrow(
        /requires either `setup` or `setupProvider`/,
      );
    });

    it('new Match accepts explicit setup', () => {
      const m = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
      });
      m.initializeMatch();
      expect(m.getState().playerShips).toHaveLength(2);
    });

    it('new Match accepts a custom setupProvider', () => {
      const customSetup: GameSetup = {
        playerShips,
        enemyShips,
        initialTurn: 'PLAYER_TURN',
        config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
      };
      const provider: IGameSetupProvider = { getGameSetup: () => customSetup };
      const m = new Match({ setupProvider: provider });
      m.initializeMatch();
      expect(m.getState().playerShips).toHaveLength(2);
    });

    it('createMatch with explicit setup behaves like new Match', () => {
      const m = createMatch({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
      });
      m.initializeMatch();
      expect(m.getState().enemyShips).toHaveLength(2);
    });

    it('createMatch with a custom setupProvider delegates to the provider', () => {
      const called: boolean[] = [];
      const provider: IGameSetupProvider = {
        getGameSetup() {
          called.push(true);
          return {
            playerShips,
            enemyShips,
            initialTurn: 'PLAYER_TURN',
            config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          };
        },
      };
      createMatch({ setupProvider: provider });
      expect(called).toHaveLength(1);
    });

    it('createMatch with no args falls back to GameInitializer defaults', () => {
      // GameInitializer defaults: 5x5 board, GAME_CONSTANTS.SHIPS.DEFAULT_COUNTS ships
      const m = createMatch();
      m.initializeMatch();
      const state = m.getState();
      // Both sides should have ships (count depends on defaults, just check > 0)
      expect(state.playerShips.length).toBeGreaterThan(0);
      expect(state.enemyShips.length).toBeGreaterThan(0);
    });

    it('createMatch passes callbacks through to the machine', () => {
      const onMatchStart = vi.fn();
      const m = createMatch({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
        onMatchStart,
      });
      m.initializeMatch();
      expect(onMatchStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('Match Initialization', () => {
    it('should initialize a match with ships', () => {
      match.initializeMatch();
      
      const state = match.getState();
      expect(state.playerShips).toHaveLength(2);
      expect(state.enemyShips).toHaveLength(2);
      expect(state.currentTurn).toBe('PLAYER_TURN');
    });

    it('should initialize with custom starting turn', () => {
      const enemyStartMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'ENEMY_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
      });
      enemyStartMatch.initializeMatch();
      
      expect(enemyStartMatch.getCurrentTurn()).toBe('ENEMY_TURN');
      expect(enemyStartMatch.isEnemyTurn()).toBe(true);
    });

    it('should call onMatchStart callback', () => {
      const onMatchStart = vi.fn();
      const matchWithCallback = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
        onMatchStart,
      });
      
      matchWithCallback.initializeMatch();
      
      expect(onMatchStart).toHaveBeenCalled();
    });
  });

  describe('Match Rules - Hit Continuation', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should allow shooting again after a hit (ship not destroyed)', () => {
      // Enemy medium ship at [7,7], size 3
      const result = match.planAndAttack(7, 7, true);
      
      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(true);
      expect(result.shots[0]?.shipDestroyed).toBe(false);
      expect(result.turnEnded).toBe(false);
      expect(result.canShootAgain).toBe(true);
      expect(result.reason).toBe('Hit - shoot again');
      expect(match.getCurrentTurn()).toBe('PLAYER_TURN'); // Turn doesn't change
    });

    it('should end turn after miss', () => {
      const result = match.planAndAttack(0, 0, true); // Miss
      
      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.reason).toBe('Miss - turn ends');
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN'); // Turn changes
    });

    it('should end turn after ship destruction', () => {
      // Enemy small ship at [5,5], size 2
      match.planAndAttack(5, 5, true); // First hit
      const result = match.planAndAttack(6, 5, true); // Second hit - destroys
      
      expect(result.success).toBe(true);
      expect(result.shots[0]?.hit).toBe(true);
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.reason).toBe('Ship destroyed - turn ends');
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN'); // Turn changes
    });
  });

  describe('Match Rules - Turn Sequence', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should allow multiple hits in same turn if ship not destroyed', () => {
      // Enemy medium ship at [7,7] vertical, size 3
      const hit1 = match.planAndAttack(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      expect(match.getCurrentTurn()).toBe('PLAYER_TURN');
      
      const hit2 = match.planAndAttack(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      expect(match.getCurrentTurn()).toBe('PLAYER_TURN');
      
      // Third hit destroys the ship
      const hit3 = match.planAndAttack(7, 9, true);
      expect(hit3.shots[0]?.shipDestroyed).toBe(true);
      expect(hit3.turnEnded).toBe(true);
      expect(match.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should alternate turns correctly with misses', () => {
      expect(match.isPlayerTurn()).toBe(true);
      
      // Player misses
      match.planAndAttack(0, 0, true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy misses
      match.planAndAttack(9, 9, false);
      expect(match.isPlayerTurn()).toBe(true);
    });

    it('should handle complex turn sequence', () => {
      // Player hits but doesn't destroy
      const r1 = match.planAndAttack(7, 7, true);
      expect(r1.canShootAgain).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
      
      // Player misses on second shot
      const r2 = match.planAndAttack(0, 0, true);
      expect(r2.turnEnded).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy hits player ship
      const r3 = match.planAndAttack(0, 0, false);
      expect(r3.canShootAgain).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy destroys player small ship
      const r4 = match.planAndAttack(1, 0, false);
      expect(r4.shots[0]?.shipDestroyed).toBe(true);
      expect(r4.turnEnded).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
    });
  });

  describe('Match Rules - Game Over', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should end match when all enemy ships destroyed', () => {
      // Destroy enemy ship 1 (small at [5,5])
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      
      // Turn should switch after destruction
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy misses to give turn back
      match.planAndAttack(9, 9, false);
      
      // Destroy enemy ship 2 (medium at [7,7])
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      const result = match.planAndAttack(7, 9, true);
      
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('player');
      expect(match.isMatchOver()).toBe(true);
      expect(match.getWinner()).toBe('player');
    });

    it('should provide game over reason', () => {
      // Destroy all enemy ships
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.planAndAttack(9, 9, false); // Enemy miss to switch turn
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      const result = match.planAndAttack(7, 9, true);
      
      expect(result.reason).toBe('Game over');
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
    });
  });

  describe('RuleSet - Classic Rules', () => {
    let classicMatch: Match;

    beforeEach(() => {
      classicMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: ClassicRuleSet }, },
      });
      classicMatch.initializeMatch();
    });

    it('should use Classic ruleset by default', () => {
      const defaultMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
      });
      defaultMatch.initializeMatch();
      
      // Classic rule: hit allows shooting again
      const result = defaultMatch.planAndAttack(7, 7, true);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
    });

    it('should allow shooting again after hit (ship not destroyed)', () => {
      const result = classicMatch.planAndAttack(7, 7, true);
      
      expect(result.shots[0]?.hit).toBe(true);
      expect(result.shots[0]?.shipDestroyed).toBe(false);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
      expect(result.reason).toBe('Hit - shoot again');
      expect(classicMatch.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('should end turn after miss', () => {
      const result = classicMatch.planAndAttack(0, 0, true);
      
      expect(result.shots[0]?.hit).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Miss - turn ends');
      expect(classicMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should end turn after ship destruction', () => {
      classicMatch.planAndAttack(5, 5, true);
      const result = classicMatch.planAndAttack(6, 5, true);
      
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Ship destroyed - turn ends');
      expect(classicMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should allow multiple consecutive hits before destruction', () => {
      // Medium ship has 3 cells
      const hit1 = classicMatch.planAndAttack(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      expect(classicMatch.isPlayerTurn()).toBe(true);

      const hit2 = classicMatch.planAndAttack(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      expect(classicMatch.isPlayerTurn()).toBe(true);

      const hit3 = classicMatch.planAndAttack(7, 9, true);
      expect(hit3.shots[0]?.shipDestroyed).toBe(true);
      expect(hit3.canShootAgain).toBe(false);
      expect(hit3.turnEnded).toBe(true);
      expect(classicMatch.isEnemyTurn()).toBe(true);
    });
  });

  describe('RuleSet - Alternating Turns', () => {
    let alternatingMatch: Match;

    beforeEach(() => {
      alternatingMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: AlternatingTurnsRuleSet } },
      });
      alternatingMatch.initializeMatch();
    });

    it('should end turn after hit (no continuation on hit)', () => {
      const result = alternatingMatch.planAndAttack(7, 7, true);
      
      expect(result.shots[0]?.hit).toBe(true);
      expect(result.shots[0]?.shipDestroyed).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Hit - turn ends');
      expect(alternatingMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should end turn after miss', () => {
      const result = alternatingMatch.planAndAttack(0, 0, true);
      
      expect(result.shots[0]?.hit).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Miss - turn ends');
      expect(alternatingMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should end turn after ship destruction', () => {
      alternatingMatch.planAndAttack(5, 5, true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
      
      alternatingMatch.planAndAttack(9, 9, false); // Enemy miss
      expect(alternatingMatch.isPlayerTurn()).toBe(true);
      
      const result = alternatingMatch.planAndAttack(6, 5, true);
      
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(alternatingMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should strictly alternate turns on consecutive hits', () => {
      // Hit 1 - turn ends
      const hit1 = alternatingMatch.planAndAttack(7, 7, true);
      expect(hit1.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy miss - turn ends
      alternatingMatch.planAndAttack(9, 9, false);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);

      // Hit 2 - turn ends
      const hit2 = alternatingMatch.planAndAttack(7, 8, true);
      expect(hit2.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy miss - turn ends
      alternatingMatch.planAndAttack(9, 8, false);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);

      // Hit 3 - destroys ship, turn ends
      const hit3 = alternatingMatch.planAndAttack(7, 9, true);
      expect(hit3.shots[0]?.shipDestroyed).toBe(true);
      expect(hit3.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
    });

    it('should work correctly with both players', () => {
      // Player hits
      const p1 = alternatingMatch.planAndAttack(5, 5, true);
      expect(p1.shots[0]?.hit).toBe(true);
      expect(p1.turnEnded).toBe(true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy hits
      const e1 = alternatingMatch.planAndAttack(0, 0, false);
      expect(e1.shots[0]?.hit).toBe(true);
      expect(e1.turnEnded).toBe(true);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);

      // Player misses
      const p2 = alternatingMatch.planAndAttack(0, 0, true);
      expect(p2.shots[0]?.hit).toBe(false);
      expect(p2.turnEnded).toBe(true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);

      // Enemy misses
      const e2 = alternatingMatch.planAndAttack(9, 9, false);
      expect(e2.shots[0]?.hit).toBe(false);
      expect(e2.turnEnded).toBe(true);
      expect(alternatingMatch.isPlayerTurn()).toBe(true);
    });
  });

  describe('RuleSet - ItemHit Rules', () => {
    let itemHitMatch: Match;

    // Enemy item at [1,1] (1-cell) — far from ships at [5,5],[7,7]
    const enemyItems = [{ coords: [1, 1] as [number, number], part: 1 }];

    beforeEach(() => {
      itemHitMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: ItemHitRuleSet }, playerItems: [], enemyItems },
      });
      itemHitMatch.initializeMatch();
    });

    it('should repeat turn after collecting an item', () => {
      const result = itemHitMatch.planAndAttack(1, 1, true);

      expect(result.shots[0]?.collected).toBe(true);
      expect(result.shots[0]?.hit).toBe(false);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
      expect(result.reason).toBe('Item collected - shoot again');
      expect(itemHitMatch.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('should end turn after miss (no item, no ship)', () => {
      const result = itemHitMatch.planAndAttack(0, 0, true);

      expect(result.shots[0]?.hit).toBe(false);
      expect(result.shots[0]?.collected).toBeFalsy();
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Miss - turn ends');
      expect(itemHitMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should repeat turn after hitting a ship (not destroyed)', () => {
      const result = itemHitMatch.planAndAttack(7, 7, true);

      expect(result.shots[0]?.hit).toBe(true);
      expect(result.shots[0]?.shipDestroyed).toBe(false);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);
      expect(result.reason).toBe('Hit - shoot again');
      expect(itemHitMatch.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('should end turn after destroying a ship', () => {
      itemHitMatch.planAndAttack(5, 5, true);
      const result = itemHitMatch.planAndAttack(6, 5, true);

      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(result.reason).toBe('Ship destroyed - turn ends');
      expect(itemHitMatch.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('should allow chaining: collect item then hit ship in the same turn', () => {
      // Collect item → repeat turn
      const r1 = itemHitMatch.planAndAttack(1, 1, true);
      expect(r1.canShootAgain).toBe(true);
      expect(itemHitMatch.isPlayerTurn()).toBe(true);

      // Hit ship (not destroyed) → still repeat turn
      const r2 = itemHitMatch.planAndAttack(7, 7, true);
      expect(r2.canShootAgain).toBe(true);
      expect(itemHitMatch.isPlayerTurn()).toBe(true);

      // Miss → turn ends
      const r3 = itemHitMatch.planAndAttack(0, 0, true);
      expect(r3.canShootAgain).toBe(false);
      expect(r3.turnEnded).toBe(true);
      expect(itemHitMatch.isEnemyTurn()).toBe(true);
    });

    it('should work correctly with setRuleSet switching to ItemHit mid-game', () => {
      const m = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: ClassicRuleSet }, playerItems: [], enemyItems },
      });
      m.initializeMatch();

      // With Classic: item is just a miss (no special handling)
      const r1 = m.planAndAttack(1, 1, true);
      expect(r1.turnEnded).toBe(true); // classic treats item cell as miss

      // Switch to ItemHit
      m.setRuleSet(ItemHitRuleSet);
      m.planAndAttack(9, 9, false); // enemy miss to restore player turn

      // Now ItemHit: hit ship → repeat turn
      const r2 = m.planAndAttack(7, 7, true);
      expect(r2.canShootAgain).toBe(true);
      expect(m.isPlayerTurn()).toBe(true);
    });
  });

  describe('RuleSet - Comparison', () => {
    let classicMatch: Match;
    let alternatingMatch: Match;

    beforeEach(() => {
      classicMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: ClassicRuleSet }, },
      });
      alternatingMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: AlternatingTurnsRuleSet }, },
      });

      classicMatch.initializeMatch();
      alternatingMatch.initializeMatch();
    });

    it('should behave differently on hits between rulesets', () => {
      // Classic: hit allows shooting again
      const classicResult = classicMatch.planAndAttack(7, 7, true);
      expect(classicResult.canShootAgain).toBe(true);
      expect(classicMatch.isPlayerTurn()).toBe(true);

      // Alternating: hit ends turn
      const alternatingResult = alternatingMatch.planAndAttack(7, 7, true);
      expect(alternatingResult.canShootAgain).toBe(false);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
    });

    it('should behave the same on misses', () => {
      // Both end turn on miss
      const classicResult = classicMatch.planAndAttack(0, 0, true);
      expect(classicResult.turnEnded).toBe(true);
      expect(classicMatch.isEnemyTurn()).toBe(true);

      const alternatingResult = alternatingMatch.planAndAttack(0, 0, true);
      expect(alternatingResult.turnEnded).toBe(true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
    });

    it('should have different game pace', () => {
      // Classic: can destroy ship in one turn with consecutive hits
      classicMatch.planAndAttack(5, 5, true);
      const classicDestroy = classicMatch.planAndAttack(6, 5, true);
      expect(classicDestroy.shots[0]?.shipDestroyed).toBe(true);
      expect(classicMatch.getState().shotCount).toBe(2);

      // Alternating: requires multiple turns to destroy ship
      alternatingMatch.planAndAttack(5, 5, true);
      expect(alternatingMatch.isEnemyTurn()).toBe(true);
      
      alternatingMatch.planAndAttack(9, 9, false); // Enemy turn
      expect(alternatingMatch.isPlayerTurn()).toBe(true);
      
      const alternatingDestroy = alternatingMatch.planAndAttack(6, 5, true);
      expect(alternatingDestroy.shots[0]?.shipDestroyed).toBe(true);
      expect(alternatingMatch.getState().shotCount).toBe(3); // More shots needed
    });
  });

  describe('Shot Validation', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should reject already shot cells', () => {
      match.planAndAttack(5, 5, true);
      const result = match.planAndAttack(5, 5, true);
      
      expect(result.success).toBe(false);
      expect(result.turnEnded).toBe(false);
      expect(result.canShootAgain).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should check if cell has been shot', () => {
      expect(match.isCellShot(5, 5, true)).toBe(false);
      
      match.planAndAttack(5, 5, true);
      
      expect(match.isCellShot(5, 5, true)).toBe(true);
    });

    it('should validate position bounds', () => {
      expect(match.isValidPosition(0, 0)).toBe(true);
      expect(match.isValidPosition(9, 9)).toBe(true);
      expect(match.isValidPosition(-1, 0)).toBe(false);
      expect(match.isValidPosition(10, 10)).toBe(false);
    });

    it('should get shot at position', () => {
      match.planAndAttack(5, 5, true);
      
      const shot = match.getShotAtPosition(5, 5, true);
      expect(shot).toBeDefined();
      expect(shot?.x).toBe(5);
      expect(shot?.y).toBe(5);
    });
  });

  describe('Match State', () => {
    beforeEach(() => {
      match.initializeMatch();
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
      match.planAndAttack(5, 5, true);
      
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
      const matchWithCallback = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
        onStateChange,
      });

      matchWithCallback.initializeMatch();
      
      expect(onStateChange).toHaveBeenCalled();
    });

    it('should call onTurnChange callback', () => {
      const onTurnChange = vi.fn();
      const matchWithCallback = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
        onTurnChange,
      });

      matchWithCallback.initializeMatch();
      
      // Miss to trigger turn change
      matchWithCallback.planAndAttack(0, 0, true);
      
      expect(onTurnChange).toHaveBeenCalledWith('ENEMY_TURN');
    });

    it('should call onShot callback', () => {
      const onShot = vi.fn();
      const matchWithCallback = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
        onShot,
      });

      matchWithCallback.initializeMatch();
      
      matchWithCallback.planAndAttack(5, 5, true);
      
      expect(onShot).toHaveBeenCalledWith(
        expect.objectContaining({ x: 5, y: 5 }),
        true
      );
    });

    it('should call onGameOver callback', () => {
      const onGameOver = vi.fn();
      const matchWithCallback = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) } },
        onGameOver,
      });

      matchWithCallback.initializeMatch();
      
      // Destroy all enemy ships
      matchWithCallback.planAndAttack(5, 5, true);
      matchWithCallback.planAndAttack(6, 5, true);
      matchWithCallback.planAndAttack(9, 9, false);
      matchWithCallback.planAndAttack(7, 7, true);
      matchWithCallback.planAndAttack(7, 8, true);
      matchWithCallback.planAndAttack(7, 9, true);
      
      expect(onGameOver).toHaveBeenCalledWith('player');
    });
  });

  describe('Engine Access', () => {
    it('should expose game state directly without leaking the engine', () => {
      match.initializeMatch();
      const state = match.getState();

      expect(state).toBeDefined();
      expect(typeof state.currentTurn).toBe('string');
      expect((match as any).getEngine).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should handle shot on last cell of destroyed ship', () => {
      // Destroy small ship completely
      match.planAndAttack(5, 5, true);
      const result = match.planAndAttack(6, 5, true);
      
      expect(result.shots[0]?.shipDestroyed).toBe(true);
      expect(result.turnEnded).toBe(true);
    });

    it('should maintain turn logic when game ends', () => {
      // Destroy all enemy ships
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.planAndAttack(9, 9, false);
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      const result = match.planAndAttack(7, 9, true);
      
      expect(result.isGameOver).toBe(true);
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
    });

    it('should handle rapid hits on same ship', () => {
      // Hit medium ship multiple times in succession
      const r1 = match.planAndAttack(7, 7, true);
      expect(r1.canShootAgain).toBe(true);
      
      const r2 = match.planAndAttack(7, 8, true);
      expect(r2.canShootAgain).toBe(true);
      
      const r3 = match.planAndAttack(7, 9, true);
      expect(r3.shots[0]?.shipDestroyed).toBe(true);
      expect(r3.turnEnded).toBe(true);
    });
  });

  describe('Both Players Shooting', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should handle both players following match rules', () => {
      // Player hits enemy ship
      const p1 = match.planAndAttack(7, 7, true);
      expect(p1.canShootAgain).toBe(true);
      
      // Player misses
      const p2 = match.planAndAttack(0, 0, true);
      expect(p2.turnEnded).toBe(true);
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy hits player ship
      const e1 = match.planAndAttack(0, 0, false);
      expect(e1.canShootAgain).toBe(true);
      
      // Enemy destroys player ship
      const e2 = match.planAndAttack(1, 0, false);
      expect(e2.shots[0]?.shipDestroyed).toBe(true);
      expect(e2.turnEnded).toBe(true);
      expect(match.isPlayerTurn()).toBe(true);
    });
  });

  describe('Game Over - Immediate Detection', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should detect game over immediately when last ship destroyed', () => {
      // Destroy first enemy ship
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      
      // Turn switches after ship destruction
      expect(match.isEnemyTurn()).toBe(true);
      
      // Enemy misses to give turn back
      match.planAndAttack(9, 9, false);
      expect(match.isPlayerTurn()).toBe(true);
      
      // Destroy second enemy ship partially
      match.planAndAttack(7, 7, true);
      expect(match.isPlayerTurn()).toBe(true); // Still player turn (hit but not destroyed)
      
      match.planAndAttack(7, 8, true);
      expect(match.isPlayerTurn()).toBe(true); // Still player turn (hit but not destroyed)
      
      // Destroy last piece of last ship
      const finalShot = match.planAndAttack(7, 9, true);
      
      // Should detect game over immediately, not allowing shoot again despite hit
      expect(finalShot.shots[0]?.hit).toBe(true);
      expect(finalShot.shots[0]?.shipDestroyed).toBe(true);
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
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.planAndAttack(9, 9, false); // Enemy miss
      
      // Destroy second ship in one continuous turn
      const hit1 = match.planAndAttack(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);
      
      const hit2 = match.planAndAttack(7, 8, true);
      expect(hit2.canShootAgain).toBe(true);
      
      // Last hit should trigger game over, not "shoot again"
      const finalHit = match.planAndAttack(7, 9, true);
      expect(finalHit.canShootAgain).toBe(false);
      expect(finalHit.isGameOver).toBe(true);
      expect(finalHit.reason).toBe('Game over');
    });
  });

  describe('Match State Updates', () => {
    beforeEach(() => {
      match.initializeMatch();
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
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.planAndAttack(9, 9, false);
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      match.planAndAttack(7, 9, true);
      
      const state = match.getState();
      expect(state.areAllEnemyShipsDestroyed).toBe(true);
      expect(state.areAllPlayerShipsDestroyed).toBe(false);
    });

    it('should check if all ships destroyed using dedicated method', () => {
      expect(match.areAllShipsDestroyed(true)).toBe(false);
      expect(match.areAllShipsDestroyed(false)).toBe(false);

      // Destroy all enemy ships
      match.planAndAttack(5, 5, true);
      match.planAndAttack(6, 5, true);
      match.planAndAttack(9, 9, false);
      match.planAndAttack(7, 7, true);
      match.planAndAttack(7, 8, true);
      match.planAndAttack(7, 9, true);

      expect(match.areAllShipsDestroyed(false)).toBe(true);
      expect(match.areAllShipsDestroyed(true)).toBe(false);
    });
  });

  describe('RuleSet Management', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should get current ruleset', () => {
      const ruleSet = match.getRuleSet();
      expect(ruleSet).toBeDefined();
      expect(ruleSet.title).toBe('LoseTurnOnUseRuleSet');
    });

    it('should allow changing ruleset during match', () => {
      const initialRuleSet = match.getRuleSet();
      expect(initialRuleSet.title).toBe('LoseTurnOnUseRuleSet');

      // Classic: hit allows shooting again
      const hit1 = match.planAndAttack(7, 7, true);
      expect(hit1.canShootAgain).toBe(true);

      // Change to alternating rules
      match.setRuleSet(AlternatingTurnsRuleSet);
      const newRuleSet = match.getRuleSet();
      expect(newRuleSet.title).toBe('AlternatingTurnsRuleSet');

      // Player misses to switch turn
      match.planAndAttack(0, 0, true);
      match.planAndAttack(9, 9, false); // Enemy miss

      // Now with alternating rules: hit should end turn
      const hit2 = match.planAndAttack(7, 8, true);
      expect(hit2.canShootAgain).toBe(false);
      expect(hit2.turnEnded).toBe(true);
    });

    it('should use provided ruleset in constructor', () => {
      const alternatingMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: AlternatingTurnsRuleSet } },
      });

      const ruleSet = alternatingMatch.getRuleSet();
      expect(ruleSet.title).toBe('AlternatingTurnsRuleSet');
    });
  });

  describe('Enemy Victory (Player Ships Destroyed)', () => {
    beforeEach(() => {
      match.initializeMatch();
    });

    it('should end match when all player ships destroyed', () => {
      // Player misses to give enemy turn
      match.planAndAttack(9, 9, true);
      expect(match.isEnemyTurn()).toBe(true);

      // Enemy destroys player ship 1 (small at [0,0])
      match.planAndAttack(0, 0, false);
      match.planAndAttack(1, 0, false);

      // Turn switches after destruction
      expect(match.isPlayerTurn()).toBe(true);

      // Player misses
      match.planAndAttack(9, 8, true);

      // Enemy destroys player ship 2 (medium at [2,2] vertical)
      match.planAndAttack(2, 2, false);
      match.planAndAttack(2, 3, false);
      const result = match.planAndAttack(2, 4, false);

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('enemy');
      expect(match.isMatchOver()).toBe(true);
      expect(match.getWinner()).toBe('enemy');
    });

    it('should detect enemy victory with alternating ruleset', () => {
      const alternatingMatch = new Match({
        setup: { playerShips, enemyShips, initialTurn: 'PLAYER_TURN', config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: AlternatingTurnsRuleSet } },
      });
      alternatingMatch.initializeMatch();

      // Alternately destroy all player ships
      alternatingMatch.planAndAttack(9, 9, true); // Player miss
      alternatingMatch.planAndAttack(0, 0, false); // Enemy hit
      alternatingMatch.planAndAttack(9, 8, true); // Player miss
      alternatingMatch.planAndAttack(1, 0, false); // Enemy destroys ship 1
      
      alternatingMatch.planAndAttack(9, 7, true); // Player miss
      alternatingMatch.planAndAttack(2, 2, false); // Enemy hit
      alternatingMatch.planAndAttack(9, 6, true); // Player miss
      alternatingMatch.planAndAttack(2, 3, false); // Enemy hit
      alternatingMatch.planAndAttack(9, 5, true); // Player miss
      const result = alternatingMatch.planAndAttack(2, 4, false); // Enemy destroys ship 2

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('enemy');
    });

    it('should provide correct reason on enemy victory', () => {
      // Player misses
      match.planAndAttack(9, 9, true);

      // Enemy destroys all player ships
      match.planAndAttack(0, 0, false);
      match.planAndAttack(1, 0, false);
      match.planAndAttack(9, 8, true); // Player miss
      match.planAndAttack(2, 2, false);
      match.planAndAttack(2, 3, false);
      const result = match.planAndAttack(2, 4, false);

      expect(result.reason).toBe('Game over');
      expect(result.turnEnded).toBe(true);
      expect(result.canShootAgain).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Item event handlers — onCollect & onUse
  // ─────────────────────────────────────────────────────────────────────────
  describe('Item Events — onCollect', () => {
    // helper: build a match with one enemy item and an optional onCollect handler
    function makeItemMatch(enemyItem: GameItem, playerItem?: GameItem) {
      return new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [enemyItem],
          playerItems: playerItem ? [playerItem] : [],
        },
      });
    }

    it('onItemCollected match callback fires when an item is fully collected', () => {
      const onItemCollected = vi.fn();
      const item: GameItem = { coords: [3, 3], part: 1 };
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [item],
          playerItems: [],
        },
        onItemCollected,
      });
      m.initializeMatch();

      m.planAndAttack(3, 3, true);

      expect(onItemCollected).toHaveBeenCalledTimes(1);
      const [shot, calledItem, isPlayerShot] = onItemCollected.mock.calls[0];
      expect(shot.x).toBe(3);
      expect(shot.y).toBe(3);
      expect(calledItem).toMatchObject({ coords: [3, 3], part: 1 });
      expect(isPlayerShot).toBe(true);
    });

    it('onItemCollected fires after item.onCollect (coordinator fires at end of turn cycle)', () => {
      const callOrder: string[] = [];
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect() { callOrder.push('onCollect'); },
      };
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [item],
          playerItems: [],
        },
        onItemCollected: () => { callOrder.push('onItemCollected'); },
      });
      m.initializeMatch();

      m.planAndAttack(3, 3, true);

      // With the CallbackCoordinator pattern all game-logic handlers (onCollect)
      // run synchronously first inside runCollectHandlers, then callbacks are
      // fired once at the end of the cycle in resolveTurn. From an external
      // subscriber's perspective the entire transition is still atomic.
      expect(callOrder).toEqual(['onCollect', 'onItemCollected']);
    });

    it('onCollect fires when a single-part item is fully collected', () => {
      const onCollect = vi.fn();
      const item: GameItem = { coords: [3, 3], part: 1, onCollect };
      const m = makeItemMatch(item);
      m.initializeMatch();

      m.planAndAttack(3, 3, true);

      expect(onCollect).toHaveBeenCalledTimes(1);
    });

    it('onCollect fires only after ALL parts of a multi-part item are shot', () => {
      const onCollect = vi.fn();
      const item: GameItem = { coords: [0, 8], part: 3, onCollect };
      const m = makeItemMatch(item);
      m.initializeMatch();

      // First two parts — not fully collected yet
      m.planAndAttack(0, 8, true);
      expect(onCollect).not.toHaveBeenCalled();

      // After miss, enemy turn, then back
      m.planAndAttack(9, 9, false); // enemy miss
      m.planAndAttack(1, 8, true);
      expect(onCollect).not.toHaveBeenCalled();

      m.planAndAttack(9, 8, false); // enemy miss
      m.planAndAttack(2, 8, true); // third part — fully collected

      expect(onCollect).toHaveBeenCalledTimes(1);
    });

    it('onCollect receives a correct ItemActionContext', () => {
      let receivedCtx: Parameters<NonNullable<GameItem['onCollect']>>[0] | null = null;
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect(ctx) { receivedCtx = ctx; },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      m.planAndAttack(3, 3, true);

      expect(receivedCtx).not.toBeNull();
      expect(receivedCtx!.isPlayerShot).toBe(true);
      expect(receivedCtx!.item).toMatchObject({ coords: [3, 3], part: 1 });
      expect(receivedCtx!.shot).toBeDefined();
      expect(receivedCtx!.shot!.x).toBe(3);
      expect(receivedCtx!.shot!.y).toBe(3);
      expect(receivedCtx!.playerShips).toHaveLength(2);
      expect(receivedCtx!.enemyShips).toHaveLength(2);
      expect(typeof receivedCtx!.setRuleSet).toBe('function');
      expect(typeof receivedCtx!.toggleTurn).toBe('function');
      expect(typeof receivedCtx!.deleteEnemyShip).toBe('function');
    });

    it('onCollect — setRuleSet applies to the SAME turn cycle (key timing test)', () => {
      // Start with LoseTurnOnUseRuleSet (miss = turn ends, item collect = treated as miss).
      // The item's onCollect switches to ItemHitRuleSet.
      // With the fix, resolveTurn uses ItemHitRuleSet and sees shot.collected=true
      // → canShootAgain = true.
      // Without the fix, LoseTurnOnUseRuleSet would be used → canShootAgain = false.
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect(ctx) { ctx.setRuleSet(ItemHitRuleSet); },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      expect(m.getRuleSet().title).toBe('LoseTurnOnUseRuleSet');

      const result = m.planAndAttack(3, 3, true);

      // ItemHitRuleSet: item collected → canShootAgain true
      expect(result.shots[0]?.collected).toBe(true);
      expect(result.canShootAgain).toBe(true);
      expect(result.turnEnded).toBe(false);

      // Ruleset persisted for future turns
      expect(m.getRuleSet().title).toBe('ItemHitRuleSet');
    });

    it('onCollect — setRuleSet to AlternatingTurnsRuleSet strips shoot-again on same turn', () => {
      // Start with ItemHitRuleSet (item collect → shoot again).
      // onCollect switches to AlternatingTurnsRuleSet → turn ends immediately.
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect(ctx) { ctx.setRuleSet(AlternatingTurnsRuleSet); },
      };
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: ItemHitRuleSet },
          enemyItems: [item],
        },
      });
      m.initializeMatch();

      const result = m.planAndAttack(3, 3, true);

      // AlternatingTurnsRuleSet: every shot ends the turn
      expect(result.canShootAgain).toBe(false);
      expect(result.turnEnded).toBe(true);
      expect(m.getRuleSet().title).toBe('AlternatingTurnsRuleSet');
    });

    it('onCollect — toggleTurn switches the active player immediately', () => {
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect(ctx) { ctx.toggleTurn(); },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      // Player collects item; onCollect toggles to ENEMY_TURN.
      // resolveTurn (ClassicRuleSet sees collection as miss) would also toggle.
      // Net result: toggled twice → back to PLAYER_TURN.
      m.planAndAttack(3, 3, true);
      // What matters: the toggle was called — verify via state or spy.
      // We just check the turn has been affected (double-toggle = player again).
      expect(m.getCurrentTurn()).toBe('PLAYER_TURN');
    });

    it('onCollect — deleteEnemyShip removes an enemy ship immediately', () => {
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect(ctx) {
          // Remove the last enemy ship
          const last = ctx.enemyShips[ctx.enemyShips.length - 1];
          ctx.deleteEnemyShip(last.shipId ?? ctx.enemyShips.length - 1);
        },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      expect(m.getState().enemyShips).toHaveLength(2);
      m.planAndAttack(3, 3, true);
      expect(m.getState().enemyShips).toHaveLength(1);
    });

    it('onCollect — deleteAllEnemyItems clears remaining items from the board', () => {
      const item0: GameItem = {
        coords: [3, 3],
        part: 1,
        onCollect(ctx) { ctx.deleteAllEnemyItems(); },
      };
      const item1: GameItem = { coords: [4, 4], part: 1 };
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [item0, item1],
          playerItems: [],
        },
      });
      m.initializeMatch();

      expect(m.getState().enemyItems).toHaveLength(2);
      m.planAndAttack(3, 3, true);
      expect(m.getState().enemyItems).toHaveLength(0);
    });

    it('onCollect fires when the enemy collects a player item', () => {
      const onCollect = vi.fn();
      const playerItem: GameItem = { coords: [5, 0], part: 1, onCollect };
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'ENEMY_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          playerItems: [playerItem],
          enemyItems: [],
        },
      });
      m.initializeMatch();

      m.planAndAttack(5, 0, false); // enemy shoots player's board item

      expect(onCollect).toHaveBeenCalledTimes(1);
      expect(onCollect).toHaveBeenCalledWith(
        expect.objectContaining({ isPlayerShot: false }),
      );
    });
  });

  describe('Item Events — onUse / useItem()', () => {
    function makeItemMatch(enemyItem: GameItem) {
      return new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [enemyItem],
          playerItems: [],
        },
      });
    }

    it('useItem() calls onUse on the collected item and returns true', () => {
      const onUse = vi.fn();
      const item: GameItem = { coords: [3, 3], part: 1, onUse };
      const m = makeItemMatch(item);
      m.initializeMatch();

      const result = m.useItem(0, true);

      expect(result).toBe(true);
      expect(onUse).toHaveBeenCalledTimes(1);
    });

    it('useItem() returns false when the item has no onUse handler', () => {
      const item: GameItem = { coords: [3, 3], part: 1 };
      const m = makeItemMatch(item);
      m.initializeMatch();

      expect(m.useItem(0, true)).toBe(false);
    });

    it('useItem() returns false for an out-of-range itemId', () => {
      const item: GameItem = { coords: [3, 3], part: 1, onUse: vi.fn() };
      const m = makeItemMatch(item);
      m.initializeMatch();

      expect(m.useItem(99, true)).toBe(false);
    });

    it('useItem() — onUse receives correct ItemActionContext', () => {
      let ctx: Parameters<NonNullable<GameItem['onUse']>>[0] | null = null;
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onUse(c) { ctx = c; },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      m.useItem(0, true);

      expect(ctx).not.toBeNull();
      expect(ctx!.isPlayerShot).toBe(true);
      expect(ctx!.shot).toBeUndefined(); // no shot for manual use
      expect(ctx!.playerShips).toHaveLength(2);
      expect(ctx!.enemyShips).toHaveLength(2);
    });

    it('useItem() — toggleTurn inside onUse changes the active player', () => {
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onUse(ctx) { ctx.toggleTurn(); },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      expect(m.getCurrentTurn()).toBe('PLAYER_TURN');
      m.useItem(0, true);
      expect(m.getCurrentTurn()).toBe('ENEMY_TURN');
    });

    it('useItem() — deleteEnemyShip inside onUse removes a ship immediately', () => {
      const item: GameItem = {
        coords: [3, 3],
        part: 1,
        onUse(ctx) {
          const last = ctx.enemyShips[ctx.enemyShips.length - 1];
          ctx.deleteEnemyShip(last.shipId ?? ctx.enemyShips.length - 1);
        },
      };
      const m = makeItemMatch(item);
      m.initializeMatch();

      expect(m.getState().enemyShips).toHaveLength(2);
      m.useItem(0, true);
      expect(m.getState().enemyShips).toHaveLength(1);
    });

    it('onItemUse match callback fires when useItem() activates an item', () => {
      const onItemUse = vi.fn();
      const onUse = vi.fn();
      const item: GameItem = { coords: [3, 3], part: 1, onUse };
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [item],
          playerItems: [],
        },
        onItemUse,
      });
      m.initializeMatch();

      m.useItem(0, true);

      expect(onItemUse).toHaveBeenCalledTimes(1);
      const [calledItemId, calledIsPlayerShot, calledItem] = onItemUse.mock.calls[0];
      expect(calledItemId).toBe(0);
      expect(calledIsPlayerShot).toBe(true);
      expect(calledItem).toBe(item);
    });

    it('onItemUse match callback does NOT fire when useItem() fails', () => {
      const onItemUse = vi.fn();
      const item: GameItem = { coords: [3, 3], part: 1 }; // no onUse handler
      const m = new Match({
        setup: {
          playerShips,
          enemyShips,
          initialTurn: 'PLAYER_TURN',
          config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView) },
          enemyItems: [item],
          playerItems: [],
        },
        onItemUse,
      });
      m.initializeMatch();

      m.useItem(0, true);

      expect(onItemUse).not.toHaveBeenCalled();
    });

    describe('decideTurnOnItemUse — LoseTurnOnUseRuleSet', () => {
      function makeItemMatchWithRuleSet(enemyItem: GameItem, ruleSet: typeof LoseTurnOnUseRuleSet | typeof ClassicRuleSet) {
        return new Match({
          setup: {
            playerShips,
            enemyShips,
            initialTurn: 'PLAYER_TURN',
            config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet },
            enemyItems: [enemyItem],
            playerItems: [],
          },
        });
      }

      it('LoseTurnOnUseRuleSet — useItem() forfeits the current player turn', () => {
        const item: GameItem = { coords: [3, 3], part: 1, onUse: vi.fn() };
        const m = makeItemMatchWithRuleSet(item, LoseTurnOnUseRuleSet);
        m.initializeMatch();

        expect(m.getCurrentTurn()).toBe('PLAYER_TURN');
        m.useItem(0, true);
        expect(m.getCurrentTurn()).toBe('ENEMY_TURN');
      });

      it('LoseTurnOnUseRuleSet — no double-toggle when item onUse already called ctx.toggleTurn()', () => {
        // The item itself toggles the turn; the ruleset must NOT toggle a second time.
        const item: GameItem = {
          coords: [3, 3],
          part: 1,
          onUse(ctx) { ctx.toggleTurn(); },
        };
        const m = makeItemMatchWithRuleSet(item, LoseTurnOnUseRuleSet);
        m.initializeMatch();

        expect(m.getCurrentTurn()).toBe('PLAYER_TURN');
        m.useItem(0, true);
        // Item toggled PLAYER → ENEMY; ruleset detects the toggle happened → no second toggle
        expect(m.getCurrentTurn()).toBe('ENEMY_TURN');
      });

      it('ClassicRuleSet — useItem() does NOT toggle turn (baseline)', () => {
        const item: GameItem = { coords: [3, 3], part: 1, onUse: vi.fn() };
        const m = makeItemMatchWithRuleSet(item, ClassicRuleSet);
        m.initializeMatch();

        expect(m.getCurrentTurn()).toBe('PLAYER_TURN');
        m.useItem(0, true);
        expect(m.getCurrentTurn()).toBe('PLAYER_TURN'); // unchanged — classic has no decideTurnOnItemUse
      });

      it('LoseTurnOnUseRuleSet — enemy useItem() forfeits enemy turn', () => {
        const item: GameItem = { coords: [3, 3], part: 1, onUse: vi.fn() };
        const m = new Match({
          setup: {
            playerShips,
            enemyShips,
            initialTurn: 'ENEMY_TURN',
            config: { boardView: withView( { width: 10, height: 10 }, StandardBoardView), ruleSet: LoseTurnOnUseRuleSet },
            playerItems: [item], // enemy collects from player board
            enemyItems: [],
          },
        });
        m.initializeMatch();

        expect(m.getCurrentTurn()).toBe('ENEMY_TURN');
        m.useItem(0, false); // false = enemy using the item
        expect(m.getCurrentTurn()).toBe('PLAYER_TURN');
      });
    });
  });
});
