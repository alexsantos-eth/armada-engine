import { GameEngine, type GameEngineState, type ShotResult } from "./logic";
import type { GameShip, Winner, GameTurn, ShotPattern, ShotPatternResult } from "../types/common";
import type { GameConfig } from "../types/config";
import { DefaultRuleSet, type MatchRuleSet } from "./rulesets";
import { SINGLE_SHOT } from "../constants/shotPatterns";

/**
 * Match Rules Manager
 *
 * Implements game match rules using configurable RuleSets:
 * - Turn management (when to end turn, when to allow shooting again)
 * - Game over conditions (what determines a winner)
 *
 * This class wraps the GameEngine and enforces turn logic automatically.
 */
export class Match {
  private engine: GameEngine;
  private matchCallbacks?: MatchCallbacks;
  private ruleSet: MatchRuleSet;
  private phase: MatchPhase = "IDLE";
  
  private pendingPlan: {
    centerX: number;
    centerY: number;
    pattern: ShotPattern;
    isPlayerShot: boolean;
  } | null = null;

  constructor(
    config?: Partial<GameConfig>,
    callbacks?: MatchCallbacks,
    ruleSet?: MatchRuleSet,
  ) {
    if (!config) {
      const initializer = new GameInitializer();
      config = initializer.getDefaultConfig();
    }

    this.matchCallbacks = callbacks;
    this.ruleSet = ruleSet ?? DefaultRuleSet;

    this.engine = new GameEngine(config, {
      onStateChange: (state) => {
        this.matchCallbacks?.onStateChange?.(state);
      },
      onTurnChange: (turn) => {
        this.checkGameOver();
        this.matchCallbacks?.onTurnChange?.(turn);
      },
      onShot: (shot, isPlayerShot) => {
        this.matchCallbacks?.onShot?.(shot, isPlayerShot);
      },
      onGameOver: (winner) => {
        this.matchCallbacks?.onGameOver?.(winner);
      },
    });

    this.setPhase("IDLE");
  }

  /**
   * Initialize a new match with ships
   * @param playerShips - Player's ship placements
   * @param enemyShips - Enemy's ship placements
   * @param initialTurn - Who starts (defaults to PLAYER_TURN)
   */
  public initializeMatch(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    initialTurn: GameTurn = "PLAYER_TURN",
  ): void {
    this.engine.initializeGame(playerShips, enemyShips, initialTurn);
    this.matchCallbacks?.onMatchStart?.();
    this.setPhase("START");
  }

  /**
   * Plan a shot with a pattern (Phase 1: PLAN)
   * This sets up the attack but doesn't execute it yet.
   * Call confirmAttack() to execute the planned shot.
   *
   * @param centerX - Center X coordinate for the pattern
   * @param centerY - Center Y coordinate for the pattern
   * @param pattern - Shot pattern to use (defaults to SINGLE_SHOT)
   * @param isPlayerShot - true for player, false for enemy
   * @returns Plan phase result
   */
  public planShot(
    centerX: number,
    centerY: number,
    pattern: ShotPattern = SINGLE_SHOT,
    isPlayerShot: boolean,
  ): PlanPhaseResult {
    this.setPhase("PLAN");

    if (!this.engine.isValidPosition(centerX, centerY)) {
      return {
        phase: "PLAN",
        ready: false,
        error: "Invalid position",
      };
    }

    if (pattern.id === "single" && this.engine.isCellShot(centerX, centerY, isPlayerShot)) {
      return {
        phase: "PLAN",
        ready: false,
        error: "Cell already shot",
      };
    }

    this.pendingPlan = {
      centerX,
      centerY,
      pattern,
      isPlayerShot,
    };

    return {
      phase: "PLAN",
      ready: true,
      pattern,
      centerX,
      centerY,
    };
  }

  /**
   * Execute the planned attack (Phase 2: ATTACK + Phase 3: TURN)
   * Must call planShot() first to set up the attack.
   *
   * @returns Match shot pattern result with turn information
   */
  public confirmAttack(): MatchShotPatternResult {
    if (!this.pendingPlan) {
      return {
        success: false,
        error: "No attack planned. Call planShot() first.",
        shots: [],
        isGameOver: this.engine.getState().isGameOver,
        winner: this.engine.getWinner(),
        turnEnded: false,
        canShootAgain: false,
        reason: "No attack planned",
        phase: "ATTACK",
      };
    }

    const { centerX, centerY, pattern, isPlayerShot } = this.pendingPlan;

    // Phase 2: Attack - Execute the shot pattern
    const attackResult = this.phaseAttackPattern(centerX, centerY, pattern, isPlayerShot);
    this.pendingPlan = null;

    if (!attackResult.success) {
      return {
        ...attackResult,
        turnEnded: false,
        canShootAgain: false,
        reason: attackResult.error || "Attack failed",
        phase: "ATTACK",
      };
    }

    // Phase 3: Turn - Decide next turn based on the overall pattern result
    const turnResult = this.phaseTurnPattern(attackResult, isPlayerShot);

    return {
      ...attackResult,
      isGameOver: turnResult.isGameOver,
      winner: turnResult.winner,
      turnEnded: turnResult.turnEnded,
      canShootAgain: turnResult.canShootAgain,
      reason: turnResult.reason,
      phase: turnResult.phase,
    };
  }

  /**
   * Cancel the pending attack plan
   */
  public cancelPlan(): void {
    this.pendingPlan = null;
    this.setPhase("IDLE");
  }

  /**
   * Get the current pending plan (if any)
   */
  public getPendingPlan(): { centerX: number; centerY: number; pattern: ShotPattern; isPlayerShot: boolean } | null {
    return this.pendingPlan;
  }

  /**
   * Plan and execute a shot following match rules with phase system
   * Supports both single shots and pattern shots.
   * For detailed pattern results, use planShot() + confirmAttack()
   *
   * Phases:
   * 1. Plan: Prepare attack type or defense
   * 2. Attack: Execute the shot and resolve damage
   * 3. Turn: Decide who plays next based on result
   *
   * @param x - X coordinate (center for patterns)
   * @param y - Y coordinate (center for patterns)
   * @param isPlayerShot - true for player, false for enemy
   * @param pattern - Shot pattern to use (defaults to SINGLE_SHOT)
   * @returns Match result with turn information (returns first shot for patterns)
   */
  public planAndAttack(
    x: number,
    y: number,
    isPlayerShot: boolean,
    pattern: ShotPattern = SINGLE_SHOT,
  ): MatchShotResult {
    const planResult = this.planShot(x, y, pattern, isPlayerShot);
    
    if (!planResult.ready) {
      return {
        success: false,
        error: planResult.error,
        hit: false,
        shipId: -1,
        turnEnded: false,
        canShootAgain: false,
        reason: planResult.error || "Invalid shot",
        phase: "ATTACK",
      };
    }

    const result = this.confirmAttack();

    const lastShot = result.shots[result.shots.length - 1];

    return {
      success: result.success,
      error: result.error,
      hit: lastShot?.hit ?? false,
      shipId: lastShot?.shipId ?? -1,
      shipDestroyed: lastShot?.shipDestroyed,
      isGameOver: result.isGameOver,
      winner: result.winner,
      turnEnded: result.turnEnded,
      canShootAgain: result.canShootAgain,
      reason: result.reason,
      phase: result.phase,
    };
  }

  /**
   * Phase 2: Attack (Pattern version)
   * Execute the shot pattern and resolve damage
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param pattern - Shot pattern to execute
   * @param isPlayerShot - true for player, false for enemy
   * @returns Attack phase pattern result
   * @private
   */
  private phaseAttackPattern(
    centerX: number,
    centerY: number,
    pattern: ShotPattern,
    isPlayerShot: boolean,
  ): AttackPhasePatternResult {
    this.setPhase("ATTACK");

    const patternResult = this.engine.executeShotPattern(centerX, centerY, pattern, isPlayerShot);
    this.checkGameOver();

    return {
      ...patternResult,
      phase: "ATTACK",
    };
  }

  /**
   * Phase 3: Turn Decision (Pattern version)
   * Decide who plays next based on pattern attack result and current RuleSet
   * For patterns, we consider the pattern as a "hit" if any shot in the pattern hit
   * @param attackResult - Result from attack phase
   * @param _isPlayerShot - true for player, false for enemy (not used yet)
   * @returns Turn phase result
   * @private
   */
  private phaseTurnPattern(
    attackResult: AttackPhasePatternResult,
    _isPlayerShot: boolean,
  ): TurnPhaseResult {
    this.setPhase("TURN");

    const state = this.engine.getState();
    
    const anyHit = attackResult.shots.some(shot => shot.hit);
    const anyShipDestroyed = attackResult.shots.some(shot => shot.shipDestroyed);
    
    const syntheticShotResult: AttackPhaseResult = {
      success: attackResult.success,
      error: attackResult.error,
      hit: anyHit,
      shipId: attackResult.shots.find(s => s.hit)?.shipId ?? -1,
      shipDestroyed: anyShipDestroyed,
      isGameOver: attackResult.isGameOver,
      winner: attackResult.winner,
      phase: "ATTACK",
    };
    
    const decision = this.ruleSet.decideTurn(syntheticShotResult, state);

    if (decision.shouldToggleTurn) {
      this.engine.toggleTurn();
    }

    return {
      phase: "TURN",
      turnEnded: decision.shouldEndTurn,
      canShootAgain: decision.canShootAgain,
      reason: decision.reason,
      isGameOver: state.isGameOver,
      winner: state.winner,
    };
  }

  /**
   * Check if it's the player's turn
   */
  public isPlayerTurn(): boolean {
    return this.engine.isPlayerTurn();
  }

  /**
   * Check if it's the enemy's turn
   */
  public isEnemyTurn(): boolean {
    return this.engine.isEnemyTurn();
  }

  /**
   * Get current turn
   */
  public getCurrentTurn(): GameTurn {
    return this.engine.getCurrentTurn();
  }

  /**
   * Get complete match state
   */
  public getState(): GameEngineState {
    return this.engine.getState();
  }

  /**
   * Get the underlying game engine (for advanced usage)
   */
  public getEngine(): GameEngine {
    return this.engine;
  }

  /**
   * Check if a cell has been shot
   */
  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.engine.isCellShot(x, y, isPlayerShot);
  }

  /**
   * Check if a position is valid
   */
  public isValidPosition(x: number, y: number): boolean {
    return this.engine.isValidPosition(x, y);
  }

  /**
   * Get the winner (if game is over)
   */
  public getWinner(): Winner {
    return this.engine.getWinner();
  }

  /**
   * Check if the match is over
   */
  public isMatchOver(): boolean {
    return this.engine.getState().isGameOver;
  }

  /**
   * Reset the match
   */
  public resetMatch(): void {
    this.engine.resetGame();
  }

  /**
   * Check if the match is over and set winner if needed
   * Uses the current RuleSet to determine game over conditions
   * @private
   */
  private checkGameOver(): void {
    const state = this.engine.getState();

    if (state.isGameOver) return;

    const decision = this.ruleSet.checkGameOver(state);

    if (decision.isGameOver && decision.winner) {
      this.engine.setGameOver(decision.winner);
    }
  }

  /**
   * Get current RuleSet
   * @returns Current match rule set
   */
  public getRuleSet(): MatchRuleSet {
    return this.ruleSet;
  }

  /**
   * Set a new RuleSet for the match
   * @param ruleSet - New rule set to apply
   */
  public setRuleSet(ruleSet: MatchRuleSet): void {
    this.ruleSet = ruleSet;
  }

  /**
   * Get board dimensions
   */
  public getBoardDimensions(): { width: number; height: number } {
    return this.engine.getBoardDimensions();
  }

  /**
   * Check if all ships of a player are destroyed
   * @param isPlayerShips - True to check player ships, false for enemy ships
   * @returns True if all ships are destroyed
   */
  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    return this.engine.areAllShipsDestroyed(isPlayerShips);
  }

  /**
   * Get shot at specific coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShot - True to check player shots, false for enemy shots
   * @returns Shot object if found, undefined otherwise
   */
  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    return this.engine.getShotAtPosition(x, y, isPlayerShot);
  }

  /**
   * Check if there's a ship at specific coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShips - True to check player ships, false for enemy ships
   * @returns True if there's a ship at that position
   */
  public hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean {
    return this.engine.hasShipAtPosition(x, y, isPlayerShips);
  }

  /**
   * Set the current match phase and notify callbacks
   * @param phase - New match phase to set
   */
  public setPhase(phase: MatchPhase): void {
    this.phase = phase;
    this.matchCallbacks?.onPhaseChange?.(phase);
  }

  /**
   * Get the current match phase
   * @returns Current match phase
   */
  public getPhase(): MatchPhase {
    return this.phase;
  }
}

/**
 * Match phases
 */
export type MatchPhase = "PLAN" | "ATTACK" | "TURN" | "START" | "IDLE";

/**
 * Plan phase result
 */
export interface PlanPhaseResult {
  phase: "PLAN";
  ready: boolean;
  error?: string;
  pattern?: ShotPattern;
  centerX?: number;
  centerY?: number;
}

/**
 * Attack phase result (single shot)
 */
export interface AttackPhaseResult extends ShotResult {
  phase: "ATTACK";
}

/**
 * Attack phase result (pattern shot)
 */
export interface AttackPhasePatternResult extends ShotPatternResult {
  phase: "ATTACK";
}

/**
 * Turn phase result
 */
export interface TurnPhaseResult {
  phase: "TURN";
  turnEnded: boolean;
  canShootAgain: boolean;
  reason: string;
  isGameOver: boolean;
  winner: Winner;
}

/**
 * Match shot result extends ShotResult with turn information
 */
export interface MatchShotResult extends ShotResult {
  turnEnded: boolean;
  canShootAgain: boolean;
  reason: string;
  phase: MatchPhase;
}

/**
 * Match shot pattern result extends ShotPatternResult with turn information
 */
export interface MatchShotPatternResult extends ShotPatternResult {
  turnEnded: boolean;
  canShootAgain: boolean;
  reason: string;
  phase: MatchPhase;
}

/**
 * Match callbacks for observing match events
 */
export interface MatchCallbacks {
  onStateChange?: (state: GameEngineState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
  onPhaseChange?: (phase: MatchPhase) => void;
}

// Re-export Shot type for convenience
import type { Shot } from "../types/common";
import { GameInitializer } from "../manager";
