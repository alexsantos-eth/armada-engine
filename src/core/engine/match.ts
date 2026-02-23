import { createActor } from "xstate";

import { SINGLE_SHOT } from "../constants/shots";
import { AttackError, PlanError } from "./errors";
import { GameInitializer, type GameSetup } from "../manager";
import { type MatchState, toMatchState } from "./logic";
import { buildPlayerBoard, buildEnemyBoard } from "./board";
import { matchMachine } from "./machines/match";
import type { MatchMachineSnapshot } from "./machines/match";
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
export type { MatchState };

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
   * Execute the planned attack.
   * The machine only accepts CONFIRM_ATTACK from the `planned` state, so
   * `pendingPlan` is guaranteed to exist at this point — no runtime guard needed.
   * Must call planShot() first to set up the attack.
   */
  public confirmAttack(): PlanAndAttackResult {
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
    return this.snap.context.currentTurn === "PLAYER_TURN";
  }

  public isEnemyTurn(): boolean {
    return this.snap.context.currentTurn === "ENEMY_TURN";
  }

  public getCurrentTurn(): GameTurn {
    return this.snap.context.currentTurn;
  }

  public getState(): MatchState {
    return toMatchState(this.engine.getState(), this.snap.context.currentTurn);
  }

  public forceSetTurn(turn: GameTurn): void {
    this.actor.send({ type: "SYNC_TURN", turn });
  }

  /**
   * Atomically replaces the full shot history for both sides.
   *
   * This is the designated path for replay and multiplayer shot synchronisation.
   * It sends a `SYNC_SHOTS` event to the machine, which delegates to
   * `engine.setPlayerShots()` and `engine.setEnemyShots()`, keeping all engine
   * mutations flowing through the machine rather than requiring a direct
   * engine reference.
   *
   * @param playerShots - Complete shot list for the player side.
   * @param enemyShots  - Complete shot list for the enemy side.
   */
  public syncShots(playerShots: Shot[], enemyShots: Shot[]): void {
    this.actor.send({ type: "SYNC_SHOTS", playerShots, enemyShots });
  }

  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.engine.isCellShot(x, y, isPlayerShot);
  }

  public isValidPosition(x: number, y: number): boolean {
    return this.engine.isValidPosition(x, y);
  }

  /**
   * Returns a rich snapshot of a single cell from the perspective of one side.
   *
   * Consolidates `isValidPosition`, `isCellShot`, `getShotAtPosition`, and
   * `hasShipAtPosition` into one call so consumers don't need to make four
   * separate queries just to render or evaluate a cell.
   *
   * @param x           - Column index.
   * @param y           - Row index.
   * @param perspective - `"player"` queries the player side; `"enemy"` queries
   *                      the enemy side.
   */
  public getCellInfo(x: number, y: number, perspective: "player" | "enemy"): CellInfo {
    if (!this.engine.isValidPosition(x, y)) {
      return { valid: false, isShot: false, hasShip: false };
    }
    const isPlayer = perspective === "player";
    return {
      valid: true,
      isShot: this.engine.isCellShot(x, y, isPlayer),
      shot: this.engine.getShotAtPosition(x, y, isPlayer),
      hasShip: this.engine.hasShipAtPosition(x, y, isPlayer),
    };
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

  /**
   * Subscribe to machine snapshot updates.
   *
   * Prefer this over accessing the raw actor — it keeps XState as an
   * implementation detail and gives consumers a stable, framework-agnostic
   * subscription API.
   *
   * @returns An unsubscribe function. Call it to stop receiving updates.
   */
  public subscribe(callback: (snapshot: MatchMachineSnapshot) => void): () => void {
    const subscription = this.actor.subscribe(callback);
    return () => subscription.unsubscribe();
  }

  /**
   * Returns the player's board with full shot metadata per cell.
   * Delegates to {@link buildPlayerBoard} — presentation logic lives in
   * the renderer, not in the engine or the Match facade.
   */
  public getPlayerBoard(): Board {
    return buildPlayerBoard(this.engine.getState());
  }

  /**
   * Returns the enemy's board with full shot metadata per cell.
   * Enemy ships remain hidden; each cell the player fired upon includes
   * the full {@link Shot} object for rich UI rendering.
   * Delegates to {@link buildEnemyBoard}.
   */
  public getEnemyBoard(): Board {
    return buildEnemyBoard(this.engine.getState());
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

/**
 * Read-only contract for observers and consumers that need to query a match
 * but should not have access to command methods
 * (`planShot`, `confirmAttack`, `syncShots`, `resetMatch`, etc.).
 *
 * React hooks and multiplayer consumers should type their `match` reference
 * as `MatchQueryAPI` rather than the concrete {@link Match} class to prevent
 * accidental coupling to mutation methods.
 *
 * ```typescript
 * import type { MatchQueryAPI } from '../engine';
 *
 * function MyComponent({ match }: { match: MatchQueryAPI | null }) {
 *   const board = match?.getPlayerBoard();
 * }
 * ```
 */
export interface MatchQueryAPI {
  // ── state queries ──────────────────────────────────────────────────────────
  getState(): MatchState;
  getCurrentTurn(): GameTurn;
  isPlayerTurn(): boolean;
  isEnemyTurn(): boolean;
  getWinner(): Winner;
  isMatchOver(): boolean;
  getMachineState(): MatchMachineSnapshot["value"];
  getRuleSet(): MatchRuleSet;
  getPendingPlan(): {
    centerX: number;
    centerY: number;
    pattern: ShotPattern;
    isPlayerShot: boolean;
  } | null;

  // ── board / cell queries ────────────────────────────────────────────────────
  getCellInfo(x: number, y: number, perspective: "player" | "enemy"): CellInfo;
  areAllShipsDestroyed(isPlayerShips: boolean): boolean;
  getBoardDimensions(): { width: number; height: number };
  getPlayerBoard(): Board;
  getEnemyBoard(): Board;

  // ── subscriptions ──────────────────────────────────────────────────────────
  subscribe(callback: (snapshot: MatchMachineSnapshot) => void): () => void;
}

/**
 * Rich snapshot of a single cell returned by {@link Match.getCellInfo}.
 *
 * Replaces the need to call `isValidPosition`, `isCellShot`,
 * `getShotAtPosition`, and `hasShipAtPosition` separately.
 */
export interface CellInfo {
  /** `false` when the coordinates fall outside the board boundaries. */
  valid: boolean;
  /** `true` if the cell has already been fired upon from this perspective. */
  isShot: boolean;
  /** Full shot metadata when fired upon; `undefined` for unshot cells. */
  shot?: Shot;
  /** `true` if a ship occupies this cell on the given side's board. */
  hasShip: boolean;
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
