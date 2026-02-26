import type { MatchState } from "./engine";
import type { MatchRuleSet } from "./rulesets";
import type { MatchCallbacks } from "./machines";
import type { GameSetup, IGameSetupProvider } from "./manager";
import type { GameTurn, Winner } from "./game";
import type { Board } from "./board";
import type { Shot, ShotPatternResult } from "./shots";
import type { ItemActionContext, ShipActionContext } from "./entities";
import type { BoardViewConfig } from "./config";
import type { MatchMachineSnapshot } from "../engine/machines/match";

/**
 * Fully-typed alias for the context passed to item `onCollect` and `onUse`
 * handlers when they run inside a `Match`.
 *
 * `setRuleSet` accepts `unknown` in the underlying `ItemActionContext` to
 * avoid a circular import; pass any `MatchRuleSet` value — the engine casts
 * it correctly at runtime.
 *
 * ```typescript
 * import type { MatchItemActionContext } from '../engine';
 * import { AlternatingTurnsRuleSet } from '../engine';
 *
 * const myItem: GameItem = {
 *   coords: [0, 0], part: 1,
 *   onCollect(ctx: MatchItemActionContext) {
 *     ctx.setRuleSet(AlternatingTurnsRuleSet);
 *   },
 * };
 * ```
 */
export type MatchItemActionContext = ItemActionContext;

/**
 * Fully-typed alias for the context passed to ship `onDestroy` handlers when
 * they run inside a `Match`. Identical to `ShipActionContext`.
 *
 * ```typescript
 * import type { MatchShipActionContext } from '../engine';
 * import { AlternatingTurnsRuleSet } from '../engine';
 *
 * const myShip: GameShip = {
 *   coords: [0, 0], width: 2, height: 1,
 *   onDestroy(ctx: MatchShipActionContext) {
 *     ctx.setRuleSet(AlternatingTurnsRuleSet);
 *   },
 * };
 * ```
 */
export type MatchShipActionContext = ShipActionContext;

/**
 * Read-only contract for observers that need to query a match without
 * access to command methods (`planShot`, `confirmAttack`, `syncShots`, etc.).
 *
 * React hooks and multiplayer consumers should type their `match` reference
 * as `MatchQueryAPI` rather than the concrete `Match` class to prevent
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
    /** 0-based index into the attacker's `shotPatterns` array. */
    patternIdx: number;
    isPlayerShot: boolean;
  } | null;
  getCellInfo(x: number, y: number, perspective: "player" | "enemy"): CellInfo;
  areAllShipsDestroyed(isPlayerShips: boolean): boolean;
  getBoardDimensions(): { width: number; height: number };
  getBoardView(): BoardViewConfig;
  getPlayerBoard(): Board;
  getEnemyBoard(): Board;
  subscribe(callback: (snapshot: MatchMachineSnapshot) => void): () => void;
}

/**
 * Full contract for an active `Match` instance.
 *
 * Extends `MatchQueryAPI` with all command / mutation methods so that
 * consumers that need write access can type their reference as `IMatch`
 * instead of the concrete `Match` class — keeping coupling to the
 * interface rather than the implementation.
 *
 * ```typescript
 * import type { IMatch } from '../engine';
 *
 * function runEnemyTurn(match: IMatch) {
 *   match.planAndAttack(3, 4, false);
 * }
 * ```
 */
export interface IMatch extends MatchQueryAPI {
  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Seeds the state machine with the ships, items, obstacles and initial
   * turn provided in the `GameSetup`. Must be called once before any other
   * command method.
   */
  initializeMatch(): void;

  /**
   * Resets the match back to its initial state, clearing all boards and
   * re-seeding the state machine.
   */
  resetMatch(): void;

  // ── Shot planning ─────────────────────────────────────────────────────────

  /**
   * Plans a shot at `(centerX, centerY)` using the given pattern index.
   * The shot is staged but not applied until `confirmAttack` is called.
   *
   * @param centerX    Board column (0-based) for the pattern centre.
   * @param centerY    Board row (0-based) for the pattern centre.
   * @param patternIdx 0-based index into the attacker's `shotPatterns` array.
   *                   Defaults to `0`.
   * @param isPlayerShot `true` when the player is attacking, `false` for the
   *                     enemy.
   * @returns `PlanShotResult` — `ready: true` when the plan is valid;
   *          `ready: false` with an `error` string otherwise.
   */
  planShot(
    centerX: number,
    centerY: number,
    patternIdx: number,
    isPlayerShot: boolean,
  ): PlanShotResult;

  /**
   * Cancels the currently staged shot plan without applying it.
   * No-op when there is no pending plan.
   */
  cancelPlan(): void;

  /**
   * Applies the staged shot plan produced by the most recent `planShot`
   * call. Must be called after a successful `planShot`.
   *
   * @returns `PlanAndAttackResult` with turn-resolution information.
   */
  confirmAttack(): PlanAndAttackResult;

  /**
   * Convenience method that combines `planShot` + `confirmAttack` in one
   * call. Aborts early and returns a failure result if planning fails.
   *
   * @param x          Board column (0-based).
   * @param y          Board row (0-based).
   * @param isPlayerShot `true` for a player attack, `false` for enemy.
   * @param patternIdx 0-based pattern index. Defaults to `0`.
   */
  planAndAttack(
    x: number,
    y: number,
    isPlayerShot: boolean,
    patternIdx?: number,
  ): PlanAndAttackResult;

  // ── Turn / sync ───────────────────────────────────────────────────────────

  /**
   * Forcefully sets the active turn. Used during multiplayer synchronisation
   * to align local state with the server.
   */
  forceSetTurn(turn: GameTurn): void;

  /**
   * Replaces the stored shot records with the provided arrays. Used by
   * multiplayer consumers to synchronise remote shot history.
   *
   * @param playerShots Full list of shots fired by the player.
   * @param enemyShots  Full list of shots fired by the enemy.
   */
  syncShots(playerShots: Shot[], enemyShots: Shot[]): void;

  // ── Rule set ──────────────────────────────────────────────────────────────

  /**
   * Replaces the active rule set at runtime without resetting the match.
   * Useful for items or powerups that alter game rules mid-match.
   */
  setRuleSet(ruleSet: MatchRuleSet): void;

  // ── Items ─────────────────────────────────────────────────────────────────

  /**
   * Activates the item identified by `itemId`.
   *
   * @param itemId       Numeric identifier of the item to activate.
   * @param isPlayerShot `true` when the player is using the item.
   * @param shipId       Optional ship to associate with the activation.
   * @returns `true` when the item was successfully used; `false` otherwise.
   */
  useItem(itemId: number, isPlayerShot: boolean, shipId?: number): boolean;

  // ── Board queries (extended) ──────────────────────────────────────────────

  /**
   * Returns `true` if cell `(x, y)` has already been fired upon from the
   * given shooter's perspective.
   */
  isCellShot(x: number, y: number, isPlayerShot: boolean): boolean;

  /**
   * Returns `true` if `(x, y)` falls within the board boundaries.
   */
  isValidPosition(x: number, y: number): boolean;

  /**
   * Returns the full `Shot` record at `(x, y)` if the cell has been fired
   * upon, or `undefined` otherwise.
   */
  getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined;

  /**
   * Returns `true` if a ship occupies cell `(x, y)` on the specified side's
   * board.
   */
  hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean;
}

/**
 * Rich snapshot of a single cell returned by `Match.getCellInfo`.
 *
 * Consolidates `isValidPosition`, `isCellShot`, `getShotAtPosition`, and
 * `hasShipAtPosition` into one call.
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

/**
 * Result of `Match.planShot`. When `ready` is `true`, the shot is planned
 * and can be confirmed with `confirmAttack`. When `false`, `error` describes
 * why the plan was rejected.
 */
export interface PlanShotResult {
  ready: boolean;
  error?: string;
  /** 0-based index into the attacker's `shotPatterns` array. */
  patternIdx?: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Result of `Match.confirmAttack` and `Match.planAndAttack`.
 *
 * Extends `ShotPatternResult` with turn-resolution fields so the caller
 * knows whether the turn ended, whether the same player may fire again,
 * and a human-readable reason for debugging.
 */
export interface PlanAndAttackResult extends ShotPatternResult {
  /** `true` when the active turn ended after this attack. */
  turnEnded: boolean;
  /** `true` when the same player may fire another shot. */
  canShootAgain: boolean;
  /** Human-readable reason from the ruleset decision. */
  reason: string;
}

/**
 * Options accepted by `new Match()` and `createMatch()`.
 *
 * Extends `MatchCallbacks` so all callbacks can be passed inline.
 * Exactly one of `setup` or `setupProvider` must be provided (or use
 * `createMatch()` which defaults to `GameInitializer`).
 */
export interface NewMatch extends MatchCallbacks {
  setup?: GameSetup;
  /**
   * Injectable provider for game setup generation.
   * Required when `setup` is not provided directly.
   * Use `createMatch` for a convenience wrapper that defaults to `GameInitializer`.
   */
  setupProvider?: IGameSetupProvider;
}
