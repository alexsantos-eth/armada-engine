import { createActor } from 'xstate';

import { SINGLE_SHOT } from '../constants/shotPatterns';
import { AttackError, PlanError } from './errors';
import { GameInitializer } from '../manager';
import { GameEngine, type GameEngineState } from './logic';
import { matchMachine } from './machines/matchMachine';
import { DefaultRuleSet, type MatchRuleSet } from './rulesets';

import { getShipCellsFromShip } from '../tools/ship/calculations';

import type {
  Board,
  Cell,
  GameShip,
  GameItem,
  Winner,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
  Shot,
} from "../types/common";
import type { GameConfig } from "../types/config";

/**
 * Match Rules Manager
 * - Turn management (when to end turn, when to allow shooting again)
 * - Game over conditions (what determines a winner)
 */
export class Match {
  private actor: ReturnType<typeof createActor<typeof matchMachine>>;
  private matchCallbacks?: MatchCallbacks;

  private get snap() {
    return this.actor.getSnapshot();
  }

  private get engine() {
    return this.snap.context.engine;
  }

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

    /**
     * The engine is created here (with its callbacks) and injected into the actor.
     * This ensures all existing callbacks (onShot, onTurnChange…) continue to
     * fire synchronously: the engine dispatches them from inside the machine actions.
     */
    const engine = new GameEngine(config, {
      onStateChange: (state) => {
        this.matchCallbacks?.onStateChange?.(state);
      },
      onTurnChange: (turn) => {
        this.matchCallbacks?.onTurnChange?.(turn);
      },
      onShot: (shot, isPlayerShot) => {
        this.matchCallbacks?.onShot?.(shot, isPlayerShot);
      },
      onGameOver: (winner) => {
        this.matchCallbacks?.onGameOver?.(winner);
      },
    });

    this.actor = createActor(matchMachine, {
      input: { engine, ruleSet: ruleSet ?? DefaultRuleSet },
    });

    this.actor.start();
  }

  /**
   * Initialize a new match with ships and optional items
   * @param playerShips - Player's ship placements
   * @param enemyShips - Enemy's ship placements
   * @param initialTurn - Who starts (defaults to PLAYER_TURN)
   * @param playerItems - Items on the player's board (collectible by the enemy)
   * @param enemyItems - Items on the enemy's board (collectible by the player)
   */
  public initializeMatch(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    initialTurn: GameTurn = "PLAYER_TURN",
    playerItems: GameItem[] = [],
    enemyItems: GameItem[] = [],
  ): void {
    this.actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      initialTurn,
      playerItems,
      enemyItems,
    });
    this.matchCallbacks?.onMatchStart?.();
  }

  /**
   * Plan a shot with a pattern 
   * This sets up the attack but doesn't execute it yet.
   * Call confirmAttack() to execute the planned shot.
   */
  public planShot(
    centerX: number,
    centerY: number,
    pattern: ShotPattern = SINGLE_SHOT,
    isPlayerShot: boolean,
  ): PlanShotResult {
    this.actor.send({
      type: "PLAN_SHOT",
      centerX,
      centerY,
      pattern,
      isPlayerShot,
    });

    if (this.snap.context.planError) {
      return { ready: false, error: this.snap.context.planError };
    }

    if (!this.snap.context.pendingPlan) {
      return { ready: false, error: PlanError.InvalidPlan };
    }

    return { ready: true, pattern, centerX, centerY };
  }

  /**
   * Execute the planned attack
   * Must call planShot() first to set up the attack.
   */
  public confirmAttack(): PlanAndAttackResult {
    if (!this.snap.context.pendingPlan) {
      const state = this.engine.getState();
      return {
        success: false,
        error: AttackError.NoAttackPlanned,
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: "No attack planned",
      };
    }

    this.actor.send({ type: "CONFIRM_ATTACK" });

    const { lastAttackResult, lastTurnDecision } = this.snap.context;

    if (!lastAttackResult) {
      const state = this.engine.getState();
      return {
        success: false,
        error: AttackError.AttackFailed,
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: AttackError.AttackFailed,
      };
    }

    const state = this.engine.getState();

    return {
      ...lastAttackResult,
      isGameOver: state.isGameOver,
      winner: state.winner,
      turnEnded: lastTurnDecision?.shouldEndTurn ?? true,
      canShootAgain: state.isGameOver ? false : (lastTurnDecision?.canShootAgain ?? false),
      reason: state.isGameOver ? "Game over" : (lastTurnDecision?.reason ?? ""),
    };
  }

  /**
   * Cancel the pending attack plan
   */
  public cancelPlan(): void {
    this.actor.send({ type: "CANCEL_PLAN" });
  }

  /**
   * Get the current pending plan (if any)
   */
  public getPendingPlan(): {
    centerX: number;
    centerY: number;
    pattern: ShotPattern;
    isPlayerShot: boolean;
  } | null {
    return this.snap.context.pendingPlan;
  }

  /**
   * Plan and execute a shot in one call (convenience wrapper).
   *
   * Phases:
   * 1. Plan: validate and store the shot
   * 2. Attack: execute the shot pattern
   * 3. Turn: decide who plays next
   */
  public planAndAttack(
    x: number,
    y: number,
    isPlayerShot: boolean,
    pattern: ShotPattern = SINGLE_SHOT,
  ): PlanAndAttackResult {
    const planResult = this.planShot(x, y, pattern, isPlayerShot);

    if (!planResult.ready) {
      const state = this.engine.getState();
      return {
        success: false,
        error: planResult.error,
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: planResult.error || "Invalid shot",
      };
    }

    return this.confirmAttack();
  }

  public isPlayerTurn(): boolean {
    return this.engine.isPlayerTurn();
  }

  public isEnemyTurn(): boolean {
    return this.engine.isEnemyTurn();
  }

  public getCurrentTurn(): GameTurn {
    return this.engine.getCurrentTurn();
  }

  public getState(): GameEngineState {
    return this.engine.getState();
  }

  public getEngine(): GameEngine {
    return this.engine;
  }

  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.engine.isCellShot(x, y, isPlayerShot);
  }

  public isValidPosition(x: number, y: number): boolean {
    return this.engine.isValidPosition(x, y);
  }

  public getWinner(): Winner {
    return this.engine.getWinner();
  }

  public isMatchOver(): boolean {
    return this.engine.getState().isGameOver;
  }

  public resetMatch(): void {
    this.actor.send({ type: "RESET" });
  }

  /**
   * Returns the current state of the underlying XState machine.
   *
   * Possible values:
   * - `"idle"` — machine created, no active match yet.
   * - `{ active: "planning" }` — match in progress, waiting for a shot to be planned.
   * - `{ active: "planned" }` — shot planned, waiting for confirmation or cancellation.
   * - `{ active: "attacking" }` — shot being executed (transient).
   * - `{ active: "resolvingTurn" }` — turn logic being applied (transient).
   * - `"gameOver"` — match has ended.
   */
  public getMachineState(): typeof this.snap.value {
    return this.snap.value;
  }

  public getRuleSet(): MatchRuleSet {
    return this.snap.context.ruleSet;
  }

  public setRuleSet(ruleSet: MatchRuleSet): void {
    this.actor.send({ type: "SET_RULESET", ruleSet });
  }

  public getBoardDimensions(): { width: number; height: number } {
    return this.engine.getBoardDimensions();
  }

  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    return this.engine.areAllShipsDestroyed(isPlayerShips);
  }

  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    return this.engine.getShotAtPosition(x, y, isPlayerShot);
  }

  public hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean {
    return this.engine.hasShipAtPosition(x, y, isPlayerShips);
  }

  public getActor() {
    return this.actor;
  }

  /**
   * Returns the player's board with full shot metadata per cell.
   * Each cell carries its {@link CellState} plus the original {@link Shot} object
   * (patternId, patternCenterX/Y, shipId, collected, itemId, itemFullyCollected…)
   * so the UI can render rich hit/miss information.
   */
  public getPlayerBoard(): Board {
    const state = this.engine.getState();
    const { boardWidth, boardHeight, playerShips, enemyShots } = state;

    const board: Board = Array.from({ length: boardHeight }, () =>
      Array.from({ length: boardWidth }, (): Cell => ({ state: "EMPTY" })),
    );

    // PLAYER SHIPS
    for (const ship of playerShips) {
      for (const [x, y] of getShipCellsFromShip(ship)) {
        if (x >= 0 && x < boardWidth && y >= 0 && y < boardHeight) {
          board[y][x] = { state: "SHIP" };
        }
      }
    }

    // ENEMY SHOTS — carry full shot data
    for (const shot of enemyShots) {
      if (shot.x >= 0 && shot.x < boardWidth && shot.y >= 0 && shot.y < boardHeight) {
        const cellState = shot.collected ? "MISS" : (shot.hit ? "HIT" : "MISS");
        board[shot.y][shot.x] = { state: cellState, shot };
      }
    }

    return board;
  }

  /**
   * Returns the enemy's board with full shot metadata per cell.
   * Enemy ships remain hidden; each cell the player fired upon includes
   * the full {@link Shot} object for rich UI rendering.
   */
  public getEnemyBoard(): Board {
    const state = this.engine.getState();
    const { boardWidth, boardHeight, playerShots, enemyItems, enemyCollectedItems } = state;

    const board: Board = Array.from({ length: boardHeight }, () =>
      Array.from({ length: boardWidth }, (): Cell => ({ state: "EMPTY" })),
    );

    // ITEMS
    const collectedSet = new Set(enemyCollectedItems);
    enemyItems.forEach((item, itemId) => {
      const [startX, y] = item.coords;
      for (let i = 0; i < item.part; i++) {
        const cx = startX + i;
        if (cx >= 0 && cx < boardWidth && y >= 0 && y < boardHeight) {
          board[y][cx] = { state: collectedSet.has(itemId) ? "COLLECTED" : "ITEM" };
        }
      }
    });

    // PLAYER SHOTS — carry full shot data
    for (const shot of playerShots) {
      if (shot.x >= 0 && shot.x < boardWidth && shot.y >= 0 && shot.y < boardHeight) {
        const cellState = shot.collected ? "COLLECTED" : (shot.hit ? "HIT" : "MISS");
        board[shot.y][shot.x] = { state: cellState, shot };
      }
    }

    return board;
  }
}

export interface PlanShotResult {
  ready: boolean;
  error?: string;
  pattern?: ShotPattern;
  centerX?: number;
  centerY?: number;
}

export interface PlanAndAttackResult extends ShotPatternResult {
  turnEnded: boolean;
  canShootAgain: boolean;
  reason: string;
}

export type MatchCallbacks = {
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  onStateChange?: (state: GameEngineState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
};
