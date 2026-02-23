import { createActor } from "xstate";

import { SINGLE_SHOT } from "../constants/shots";
import { AttackError, PlanError } from "./errors";
import { GameInitializer, type GameSetup } from "../manager";
import { type GameEngineState } from "./logic";
import { matchMachine } from "./machines/matchMachine";
import { DefaultRuleSet, type MatchRuleSet } from "./rulesets";

import type {
  Board,
  Winner,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
  Shot,
  ItemActionContext,
} from "../types/common";

import type { MatchCallbacks } from "./machines/types";
export type { MatchCallbacks };

interface NewMatch extends MatchCallbacks {
  setup?: GameSetup;
}

/**
 * Public api over the `matchMachine` XState actor.
 *
 * `Match` has a single responsibility: expose a simple, imperative API so
 * consumers don't need to interact with the state machine directly.
 * All heavy game-flow logic (turn management, attack execution, rule
 * evaluation, game-over detection, item activation) lives inside
 * `matchMachine` and its actions — `Match` only forwards calls and reads
 * results from the machine snapshot.
 *
 * Typical usage:
 * ```
 * match.initializeMatch()          // send INITIALIZE
 * match.planShot(x, y, pattern)    // send PLAN_SHOT
 * match.confirmAttack()            // send CONFIRM_ATTACK
 * match.useItem(itemId, true)      // send USE_ITEM (planning phase only)
 * match.resetMatch()               // send RESET
 * ```
 */
export class Match {
  private actor: ReturnType<typeof createActor<typeof matchMachine>>;
  private setup?: GameSetup;

  private get snap() {
    return this.actor.getSnapshot();
  }

  private get engine() {
    return this.snap.context.engine;
  }

  constructor({ setup, ...callbacks }: NewMatch) {
    this.setup = setup;

    if (!this.setup) {
      const initilizer = new GameInitializer();
      this.setup = initilizer.getGameSetup();
    }

    const ruleSet = setup?.config.ruleSet ?? DefaultRuleSet;

    this.actor = createActor(matchMachine, {
      input: { config: this.setup?.config, ruleSet, callbacks },
    });

    this.actor.start();
  }

  public initializeMatch(): void {
    const { playerShips, enemyShips, initialTurn, playerItems, enemyItems } =
      this.setup!;

    this.actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      initialTurn,
      playerItems,
      enemyItems,
    });
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
      canShootAgain: state.isGameOver
        ? false
        : (lastTurnDecision?.canShootAgain ?? false),
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
    return this.getState().isPlayerTurn;
  }

  public isEnemyTurn(): boolean {
    return this.getState().isEnemyTurn;
  }

  public getCurrentTurn(): GameTurn {
    return this.getState().currentTurn;
  }

  public getState(): GameEngineState {
    return this.engine.getState();
  }

  public forceSetTurn(turn: GameTurn): void {
    if (this.engine.getCurrentTurn() !== turn) {
      this.engine.toggleTurn();
    }
  }

  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.engine.isCellShot(x, y, isPlayerShot);
  }

  public isValidPosition(x: number, y: number): boolean {
    return this.engine.isValidPosition(x, y);
  }

  public getWinner(): Winner {
    return this.getState().winner;
  }

  public isMatchOver(): boolean {
    return this.getState().isGameOver;
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

  /**
   * Trigger the `onUse` handler of a collected item.
   *
   * The activation is delegated to the state machine and is only processed
   * while the machine is in the `planning` phase — calling this from any
   * other phase (planned, attacking, gameOver…) is a no-op that returns `false`.
   *
   * @param itemId - The `itemId` of the item to use (0-based index in its side's array).
   * @param isPlayerShot - `true` to look in the enemy's items (player-collected),
   *                       `false` to look in the player's items (enemy-collected).
   * @returns `true` if the handler was found and called, `false` otherwise.
   */
  public useItem(itemId: number, isPlayerShot: boolean): boolean {
    this.actor.send({ type: "USE_ITEM", itemId, isPlayerShot });
    return this.snap.context.lastUseItemResult ?? false;
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
    return this.engine.getPlayerBoard();
  }

  /**
   * Returns the enemy's board with full shot metadata per cell.
   * Enemy ships remain hidden; each cell the player fired upon includes
   * the full {@link Shot} object for rich UI rendering.
   */
  public getEnemyBoard(): Board {
    return this.engine.getEnemyBoard();
  }
}

/**
 * Convenience alias for {@link ItemActionContext} used inside `onCollect` and
 * `onUse` handlers.
 *
 * `setRuleSet` accepts `unknown` in the underlying interface to avoid a
 * circular import; pass any {@link MatchRuleSet} value — TypeScript will not
 * narrow the argument, but at runtime the engine casts it correctly.
 *
 * ```typescript
 * import type { MatchItemActionContext } from '../engine/match';
 * import { AlternatingTurnsRuleSet } from '../engine/rulesets';
 *
 * const myItem: GameItem = {
 *   coords: [0, 0],
 *   part: 1,
 *   onCollect(ctx: MatchItemActionContext) {
 *     ctx.setRuleSet(AlternatingTurnsRuleSet);
 *   },
 * };
 * ```
 */
export type MatchItemActionContext = ItemActionContext;

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
