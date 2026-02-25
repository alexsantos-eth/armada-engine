import { createActor } from "xstate";

import { SINGLE_SHOT } from "../constants/shots";
import { AttackError, PlanError } from "./errors";
import { GameInitializer, type GameSetup, type IGameSetupProvider } from "../manager";
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
  /**
   * Injectable provider for game setup generation.
   * Required when `setup` is not provided directly.
   * Use {@link createMatch} for a convenience wrapper that defaults to `GameInitializer`.
   */
  setupProvider?: IGameSetupProvider;
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

  constructor({ setup, setupProvider, ...callbacks }: NewMatch) {
    if (setup) {
      this.setup = setup;
    } else if (setupProvider) {
      this.setup = setupProvider.getGameSetup();
    } else {
      throw new Error(
        "Match requires either `setup` or `setupProvider`. " +
        "Use `createMatch()` for a convenience wrapper with a default initializer.",
      );
    }

    const ruleSet = this.setup?.config.ruleSet ?? DefaultRuleSet;

    this.actor = createActor(matchMachine, {
      input: { config: this.setup?.config, ruleSet, callbacks },
    });

    this.actor.start();
  }

  /**
   * Initialize the match with ships and items from the current setup.
   * Sends an `INITIALIZE` event to the machine, transitioning it from `idle`
   * to `active.planning` and firing `onMatchStart`.
   */
  public initializeMatch(): void {
    const { playerShips, enemyShips, initialTurn, playerItems, enemyItems, playerObstacles, enemyObstacles } =
      this.setup!;

    this.actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      initialTurn,
      playerItems,
      enemyItems,
      playerObstacles,
      enemyObstacles,
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

  /** Returns `true` when it is the player's turn. */
  public isPlayerTurn(): boolean {
    return this.snap.context.currentTurn === "PLAYER_TURN";
  }

  /** Returns `true` when it is the enemy's turn. */
  public isEnemyTurn(): boolean {
    return this.snap.context.currentTurn === "ENEMY_TURN";
  }

  /** Returns the current turn (`"PLAYER_TURN"` or `"ENEMY_TURN"`). */
  public getCurrentTurn(): GameTurn {
    return this.snap.context.currentTurn;
  }

  /**
   * Returns a turn-aware snapshot of the full game state.
   * Merges the engine's turn-agnostic {@link GameEngineState} with the
   * machine's current turn to produce a {@link MatchState}.
   */
  public getState(): MatchState {
    return toMatchState(this.engine.getState(), this.snap.context.currentTurn);
  }

  /**
   * Overrides the current turn without side-effects.
   * Intended for network re-synchronisation after a disconnect — does not
   * fire `onTurnChange` or any other callback.
   */
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

  /** Returns `true` if `(x, y)` falls within the board boundaries. */
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

  /** Returns the winner once the match is over, or `null` while still in progress. */
  public getWinner(): Winner {
    return this.getState().winner;
  }

  /** Returns `true` once the match has ended (game over). */
  public isMatchOver(): boolean {
    return this.getState().isGameOver;
  }

  /** Resets the machine back to `idle` and clears all engine state. */
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

  /** Returns the currently active ruleset. */
  public getRuleSet(): MatchRuleSet {
    return this.snap.context.ruleSet;
  }

  /** Swaps the active ruleset at runtime. Takes effect on the next attack. */
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
  public useItem(itemId: number, isPlayerShot: boolean, shipId?: number): boolean {
    this.actor.send({ type: "USE_ITEM", itemId, isPlayerShot, shipId });
    return this.snap.context.lastUseItemResult ?? false;
  }

  /** Returns the board dimensions as `{ width, height }`. */
  public getBoardDimensions(): { width: number; height: number } {
    return this.engine.getBoardDimensions();
  }

  /**
   * Returns `true` if all ships on the given side have been destroyed.
   * Pass `true` for the player's fleet, `false` for the enemy's fleet.
   */
  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    return this.engine.areAllShipsDestroyed(isPlayerShips);
  }

  /** Returns the full `Shot` record at `(x, y)` for the given side, or `undefined`. */
  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    return this.engine.getShotAtPosition(x, y, isPlayerShot);
  }

  /** Returns `true` if a ship occupies `(x, y)` on the given side's board. */
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
    return buildPlayerBoard(this.engine.getState(), this.setup?.config.boardView);
  }

  /**
   * Returns the enemy's board with full shot metadata per cell.
   * Enemy ships remain hidden; each cell the player fired upon includes
   * the full {@link Shot} object for rich UI rendering.
   * Delegates to {@link buildEnemyBoard}.
   */
  public getEnemyBoard(): Board {
    return buildEnemyBoard(this.engine.getState(), this.setup?.config.boardView);
  }
}

/**
 * Factory wrapper around {@link Match} that injects a {@link GameInitializer}
 * as the default setup provider when neither `setup` nor `setupProvider` is given.
 *
 * Prefer this over `new Match()` in application code so that `Match` itself
 * stays free of the concrete `GameInitializer` dependency (DIP).
 *
 * ```typescript
 * // No config needed — GameInitializer supplies sensible defaults:
 * const match = createMatch({ onStateChange: (s) => render(s) });
 *
 * // Or pass explicit setup / a custom provider as usual:
 * const match = createMatch({ setup: mySetup });
 * const match = createMatch({ setupProvider: myCustomProvider });
 * ```
 */
export function createMatch(opts: NewMatch = {}): Match {
  if (!opts.setup && !opts.setupProvider) {
    return new Match({ ...opts, setupProvider: new GameInitializer() });
  }
  return new Match(opts);
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

  getCellInfo(x: number, y: number, perspective: "player" | "enemy"): CellInfo;
  areAllShipsDestroyed(isPlayerShips: boolean): boolean;
  getBoardDimensions(): { width: number; height: number };
  getPlayerBoard(): Board;
  getEnemyBoard(): Board;

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
