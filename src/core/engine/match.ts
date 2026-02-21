import { createActor } from "xstate";
import { GameEngine, type GameEngineState } from "./logic";
import type {
  GameShip,
  Winner,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
} from "../types/common";
import type { GameConfig } from "../types/config";
import { DefaultRuleSet, type MatchRuleSet } from "./rulesets";
import { SINGLE_SHOT } from "../constants/shotPatterns";
import { matchMachine } from "./machines/matchMachine";

/**
 * Match Rules Manager
 * - Turn management (when to end turn, when to allow shooting again)
 * - Game over conditions (what determines a winner)
 */
export class Match {
  private actor: ReturnType<typeof createActor<typeof matchMachine>>;
  private matchCallbacks?: MatchCallbacks;

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
    this.actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      initialTurn,
    });
    this.matchCallbacks?.onMatchStart?.();
  }

  /**
   * Plan a shot with a pattern (Phase 1: PLAN)
   * This sets up the attack but doesn't execute it yet.
   * Call confirmAttack() to execute the planned shot.
   */
  public planShot(
    centerX: number,
    centerY: number,
    pattern: ShotPattern = SINGLE_SHOT,
    isPlayerShot: boolean,
  ): PlanPhaseResult {
    this.actor.send({
      type: "PLAN_SHOT",
      centerX,
      centerY,
      pattern,
      isPlayerShot,
    });

    const snap = this.actor.getSnapshot();

    if (snap.context.planError) {
      return { ready: false, error: snap.context.planError };
    }

    if (!snap.context.pendingPlan) {
      return { ready: false, error: "Invalid plan" };
    }

    return { ready: true, pattern, centerX, centerY };
  }

  /**
   * Execute the planned attack (Phase 2: ATTACK + Phase 3: TURN)
   * Must call planShot() first to set up the attack.
   */
  public confirmAttack(): MatchShotResult {
    const snapBefore = this.actor.getSnapshot();

    if (!snapBefore.context.pendingPlan) {
      const state = snapBefore.context.engine.getState();
      return {
        success: false,
        error: "No attack planned. Call planShot() first.",
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: "No attack planned",
      };
    }

    this.actor.send({ type: "CONFIRM_ATTACK" });

    const snap = this.actor.getSnapshot();
    const { lastAttackResult, lastTurnDecision } = snap.context;

    if (!lastAttackResult) {
      const state = snap.context.engine.getState();
      return {
        success: false,
        error: "Attack failed",
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: "Attack failed",
      };
    }

    const state = snap.context.engine.getState();

    return {
      ...lastAttackResult,
      isGameOver: state.isGameOver,
      winner: state.winner,
      turnEnded: lastTurnDecision?.shouldEndTurn ?? true,
      canShootAgain: lastTurnDecision?.canShootAgain ?? false,
      reason: lastTurnDecision?.reason ?? "",
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
    return this.actor.getSnapshot().context.pendingPlan;
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
  ): MatchShotResult {
    const planResult = this.planShot(x, y, pattern, isPlayerShot);

    if (!planResult.ready) {
      const state = this.actor.getSnapshot().context.engine.getState();
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
    return this.actor.getSnapshot().context.engine.isPlayerTurn();
  }

  public isEnemyTurn(): boolean {
    return this.actor.getSnapshot().context.engine.isEnemyTurn();
  }

  public getCurrentTurn(): GameTurn {
    return this.actor.getSnapshot().context.engine.getCurrentTurn();
  }

  public getState(): GameEngineState {
    return this.actor.getSnapshot().context.engine.getState();
  }

  public getEngine(): GameEngine {
    return this.actor.getSnapshot().context.engine;
  }

  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.actor
      .getSnapshot()
      .context.engine.isCellShot(x, y, isPlayerShot);
  }

  public isValidPosition(x: number, y: number): boolean {
    return this.actor.getSnapshot().context.engine.isValidPosition(x, y);
  }

  public getWinner(): Winner {
    return this.actor.getSnapshot().context.engine.getWinner();
  }

  public isMatchOver(): boolean {
    return this.actor.getSnapshot().context.engine.getState().isGameOver;
  }

  public resetMatch(): void {
    this.actor.send({ type: "RESET" });
  }

  public getRuleSet(): MatchRuleSet {
    return this.actor.getSnapshot().context.ruleSet;
  }

  public setRuleSet(ruleSet: MatchRuleSet): void {
    this.actor.send({ type: "SET_RULESET", ruleSet });
  }

  public getBoardDimensions(): { width: number; height: number } {
    return this.actor.getSnapshot().context.engine.getBoardDimensions();
  }

  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    return this.actor
      .getSnapshot()
      .context.engine.areAllShipsDestroyed(isPlayerShips);
  }

  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    return this.actor
      .getSnapshot()
      .context.engine.getShotAtPosition(x, y, isPlayerShot);
  }

  public hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean {
    return this.actor
      .getSnapshot()
      .context.engine.hasShipAtPosition(x, y, isPlayerShips);
  }

  public getActor() {
    return this.actor;
  }
}

import type { Shot } from "../types/common";
import { GameInitializer } from "../manager";

export interface PlanPhaseResult {
  ready: boolean;
  error?: string;
  pattern?: ShotPattern;
  centerX?: number;
  centerY?: number;
}

export interface MatchShotResult extends ShotPatternResult {
  turnEnded: boolean;
  canShootAgain: boolean;
  reason: string;
}

export type MatchCallbacks = {
  onStateChange?: (state: GameEngineState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
};
