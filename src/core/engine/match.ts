import { GameEngine, type GameEngineState, type ShotResult } from "./logic";
import type { GameShip, Winner, GameTurn } from "../types/common";
import type { GameConfig } from "../types/config";

/**
 * Match Rules Manager
 *
 * Implements the game match rules:
 * 1. If a shot hits (but doesn't destroy the ship), player can shoot again
 * 2. If a shot destroys the entire ship, turn ends
 * 3. Winner is determined when all enemy ships are destroyed
 *
 * This class wraps the GameEngine and enforces turn logic automatically.
 */
export class Match {
  private engine: GameEngine;
  private matchCallbacks?: MatchCallbacks;

  constructor(config?: Partial<GameConfig>, callbacks?: MatchCallbacks) {
    if (!config) {
      const initializer = new GameInitializer();
      config = initializer.getDefaultConfig();
    }

    this.matchCallbacks = callbacks;

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
  }

  /**
   * Execute a shot following match rules with phase system
   *
   * Phases:
   * 1. Preparation: Prepare attack type or defense (not implemented yet)
   * 2. Attack: Execute the shot and resolve damage
   * 3. Turn: Decide who plays next based on result
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShot - true for player, false for enemy
   * @returns Match result with turn information
   */
  public executeShot(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): MatchShotResult {
    // Phase 1: Preparation (not implemented yet)
    this.phasePreparation(isPlayerShot);

    // Phase 2: Attack - Execute the shot
    const attackResult = this.phaseAttack(x, y, isPlayerShot);

    if (!attackResult.success) {
      return {
        ...attackResult,
        turnEnded: false,
        canShootAgain: false,
        reason: attackResult.error || "Shot failed",
        phase: "ATTACK",
      };
    }

    // Phase 3: Turn - Decide next turn
    const turnResult = this.phaseTurn(attackResult, isPlayerShot);

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
   * Phase 1: Preparation
   * Prepare attack type or defense modifications
   * @param _isPlayerShot - true for player, false for enemy (not used yet)
   * @returns Preparation phase result
   * @private
   */
  private phasePreparation(_isPlayerShot: boolean): PreparationPhaseResult {
    return {
      phase: "PREPARATION",
      ready: true,
    };
  }

  /**
   * Phase 2: Attack
   * Execute the shot and resolve damage
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShot - true for player, false for enemy
   * @returns Attack phase result
   * @private
   */
  private phaseAttack(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): AttackPhaseResult {
    const shotResult = this.engine.executeShot(x, y, isPlayerShot);
    this.checkGameOver();

    return {
      ...shotResult,
      phase: "ATTACK",
    };
  }

  /**
   * Phase 3: Turn Decision
   * Decide who plays next based on attack result
   * @param attackResult - Result from attack phase
   * @param _isPlayerShot - true for player, false for enemy (not used yet)
   * @returns Turn phase result
   * @private
   */
  private phaseTurn(
    attackResult: AttackPhaseResult,
    _isPlayerShot: boolean,
  ): TurnPhaseResult {
    const state = this.engine.getState();

    let turnEnded = false;
    let canShootAgain = false;
    let reason = "";

    if (state.isGameOver) {
      // Game over - match ends
      turnEnded = true;
      canShootAgain = false;
      reason = "Game over";
    } else if (attackResult.hit) {
      if (attackResult.shipDestroyed) {
        // Ship destroyed - turn ends
        turnEnded = true;
        canShootAgain = false;
        reason = "Ship destroyed - turn ends";
        this.engine.toggleTurn();
      } else {
        // Hit but ship not destroyed - can shoot again
        turnEnded = false;
        canShootAgain = true;
        reason = "Hit - shoot again";
      }
    } else {
      // Miss - turn ends
      turnEnded = true;
      canShootAgain = false;
      reason = "Miss - turn ends";
      this.engine.toggleTurn();
    }

    return {
      phase: "TURN",
      turnEnded,
      canShootAgain,
      reason,
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
   * This is where Match determines game over based on match rules
   * @private
   */
  private checkGameOver(): void {
    const state = this.engine.getState();

    if (state.isGameOver) return;

    if (state.areAllPlayerShipsDestroyed) {
      this.engine.setGameOver("enemy");
    } else if (state.areAllEnemyShipsDestroyed) {
      this.engine.setGameOver("player");
    }
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
}

/**
 * Match phases
 */
export type MatchPhase = "PREPARATION" | "ATTACK" | "TURN";

/**
 * Preparation phase result
 */
export interface PreparationPhaseResult {
  phase: "PREPARATION";
  ready: boolean;
}

/**
 * Attack phase result
 */
export interface AttackPhaseResult extends ShotResult {
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
 * Match callbacks for observing match events
 */
export interface MatchCallbacks {
  onStateChange?: (state: GameEngineState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
}

// Re-export Shot type for convenience
import type { Shot } from "../types/common";
import { GameInitializer } from "../manager";
