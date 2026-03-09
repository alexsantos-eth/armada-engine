import type { MatchState } from "./engine";
import type { MatchRuleSet } from "./rulesets";
import type { MatchCallbacks } from "./machines";
import type { GameSetup, IGameSetupProvider } from "./manager";
import type { GameTurn, Winner } from "./game";
import type { Board } from "./board";
import type { Shot, ShotPatternResult } from "./shots";
import type { ItemActionContext, ShipActionContext } from "./entities";
import type { BoardViewConfig } from "./config";
import type { MatchLogger, MatchMachineLogEvent } from "./machines";

/**
 * Type-safe contract for an XState machine snapshot.
 * Using loose typing here to avoid circular dependency with engine/machines/match.ts,
 * which defines the actual XState machine. The snapshot is always safe to pass to
 * consumers; the machine guarantees type safety internally.
 */
export interface MatchMachineSnapshot {
  value: unknown;
  [key: string]: unknown;
}

/**
 * Narrowed alias for the action context injected into item `onCollect` and
 * `onUse` callbacks when they execute inside a running `Match`.
 *
 * Re-exported under this name so item definitions can be typed against the
 * match-scoped contract without importing lower-level engine internals.
 * Although `setRuleSet` accepts `unknown` in the base `ItemActionContext` to
 * avoid a circular dependency, any `MatchRuleSet` value is accepted and cast
 * correctly at runtime.
 *
 * @example
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
 * Narrowed alias for the action context injected into ship `onDestroy`
 * callbacks when they execute inside a running `Match`.
 *
 * Structurally identical to `ShipActionContext`; re-exported under this name
 * so ship definitions can align their callback signatures with the
 * match-scoped contract without reaching into lower-level engine modules.
 *
 * @example
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
 * @example
 * ```typescript
 * import type { MatchQueryAPI } from '../engine';
 *
 * function MyComponent({ match }: { match: MatchQueryAPI | null }) {
 *   const board = match?.getPlayerBoard();
 * }
 * ```
 */
export interface MatchQueryAPI {
  /**
   * Returns the high-level lifecycle phase of the match (e.g. `idle`,
   * `running`, `finished`). Drives conditional rendering of UI states that
   * depend on whether play has started or ended.
   */
  getState(): MatchState;

  /**
   * Returns the side whose turn it currently is. Consumers that need a
   * boolean shorthand should prefer `isPlayerTurn` or `isEnemyTurn`.
   */
  getCurrentTurn(): GameTurn;

  /**
   * Returns `true` while it is the local player's turn to act. Equivalent
   * to `getCurrentTurn() === 'player'`.
   */
  isPlayerTurn(): boolean;

  /**
   * Returns `true` while it is the enemy's turn to act. Equivalent to
   * `getCurrentTurn() === 'enemy'`.
   */
  isEnemyTurn(): boolean;

  /**
   * Returns the winning side once the match has concluded, or `null` while
   * the match is still in progress.
   */
  getWinner(): Winner;

  /**
   * Returns `true` after a winner has been determined and the match state
   * machine has transitioned to its terminal state.
   */
  isMatchOver(): boolean;

  /**
   * Returns the current XState machine state value. Useful for fine-grained
   * UI transitions that map directly to individual machine states (e.g.
   * distinguishing `planning` from `attacking` within a turn).
   */
  getMachineState(): MatchMachineSnapshot["value"];

  /**
   * Returns the active rule set governing turn transitions, multi-shot
   * eligibility, and other game-flow decisions.
   */
  getRuleSet(): MatchRuleSet;

  /**
   * Returns the staged shot plan that is waiting for `confirmAttack`, or
   * `null` when no plan has been initiated.
   */
  getPendingPlan(): {
    /** Board column (0-based) used as the centre of the shot pattern. */
    centerX: number;
    /** Board row (0-based) used as the centre of the shot pattern. */
    centerY: number;
    /** 0-based index into the attacker's `shotPatterns` array. */
    patternIdx: number;
    /** `true` when the plan belongs to the player; `false` for the enemy. */
    isPlayerShot: boolean;
  } | null;

  /**
   * Returns a consolidated `CellInfo` snapshot for the cell at `(x, y)`
   * as seen from the given perspective. Combines validity, shot status, and
   * ship presence into one call, avoiding multiple round-trips for rendering.
   *
   * @param x           Board column (0-based).
   * @param y           Board row (0-based).
   * @param perspective Which side's board and shot history to query.
   */
  getCellInfo(x: number, y: number, perspective: "player" | "enemy"): CellInfo;

  /**
   * Returns `true` when every ship on the specified side has been fully
   * destroyed. Used to determine end-of-game conditions independently of
   * the match state machine.
   *
   * @param isPlayerShips `true` to check the player's fleet; `false` for the enemy's.
   */
  areAllShipsDestroyed(isPlayerShips: boolean): boolean;

  /**
   * Returns the width and height of the shared game board in grid cells.
   * Both sides always play on the same dimensions within a single match.
   */
  getBoardDimensions(): { width: number; height: number };

  /**
   * Returns the active view configuration controlling how the board is
   * rendered (cell size, offsets, zoom level, etc.).
   */
  getBoardView(): BoardViewConfig;

  /**
   * Returns the player's live `Board` instance, including ship positions,
   * received shots, and collected items.
   */
  getPlayerBoard(): Board;

  /**
   * Returns the enemy's live `Board` instance, including ship positions,
   * received shots, and collected items.
   */
  getEnemyBoard(): Board;

  /**
   * Returns a copy of the machine logger history ordered by insertion time.
   */
  getEventLog(): MatchMachineLogEvent[];

  /**
   * Returns the newest machine log entry, if one exists.
   */
  getLastEventLog(): MatchMachineLogEvent | undefined;

  /**
   * Removes every persisted machine log entry.
   */
  clearEventLog(): void;

  /**
   * Registers a listener that fires whenever the underlying state machine
   * emits a new snapshot. Returns an unsubscribe function; call it during
   * component teardown to prevent memory leaks.
   *
   * @param callback Invoked with the latest machine snapshot on every
   *                 state transition.
   * @returns A zero-argument function that removes the subscription.
   */
  subscribe(callback: (snapshot: unknown) => void): () => void;
}

/**
 * Full read-write contract for an active `Match` instance.
 *
 * Extends `MatchQueryAPI` with all command and mutation methods. Consumers
 * that need write access should type their reference as `IMatch` rather than
 * the concrete `Match` class, keeping their coupling at the interface level.
 * Consumers that only need to observe state should use `MatchQueryAPI`.
 *
 * @example
 * ```typescript
 * import type { IMatch } from '../engine';
 *
 * function runEnemyTurn(match: IMatch) {
 *   match.planAndAttack(3, 4, false);
 * }
 * ```
 */
export interface IMatch extends MatchQueryAPI {
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

  /**
   * Plans a shot at `(centerX, centerY)` using the given pattern index.
   * The shot is staged but not applied until `confirmAttack` is called.
   *
   * @param centerX    Board column (0-based) for the pattern centre.
  * @param centerY    Board y coordinate (0-based, bottom -> top) for the pattern centre.
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
  * @param y          Board y coordinate (0-based, bottom -> top).
   * @param isPlayerShot `true` for a player attack, `false` for enemy.
   * @param patternIdx 0-based pattern index. Defaults to `0`.
   */
  planAndAttack(
    x: number,
    y: number,
    isPlayerShot: boolean,
    patternIdx?: number,
  ): PlanAndAttackResult;

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

  /**
   * Replaces the active rule set at runtime without resetting the match.
   * Useful for items or powerups that alter game rules mid-match.
   */
  setRuleSet(ruleSet: MatchRuleSet): void;

  /**
   * Activates the item identified by `itemId`.
   *
   * @param itemId       Numeric identifier of the item to activate.
   * @param isPlayerShot `true` when the player is using the item.
   * @param shipId       Optional ship to associate with the activation.
   * @returns `true` when the item was successfully used; `false` otherwise.
   */
  useItem(itemId: number, isPlayerShot: boolean, shipId?: number): boolean;

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
 * Rich snapshot of a single board cell returned by `MatchQueryAPI.getCellInfo`.
 *
 * Aggregates the four most common cell queries — boundary check, shot status,
 * shot metadata, and ship occupancy — into a single object, reducing the
 * number of method calls needed per cell during board rendering.
 */
export interface CellInfo {
  /**
   * `true` when the coordinates fall within the board boundaries.
   * All other fields are only meaningful when `valid` is `true`.
   */
  valid: boolean;

  /**
   * `true` if the cell has already been targeted by the attacker whose
   * perspective was supplied to `getCellInfo`. Prevents duplicate shots on
   * the same cell.
   */
  isShot: boolean;

  /**
   * Full metadata for the shot that landed on this cell, including hit/miss
   * status, pattern coordinates, and any triggered effects. Present only
   * when `isShot` is `true`.
   */
  shot?: Shot;

  /**
   * `true` if a ship part occupies this cell on the queried side's board.
   * On the enemy board this reveals ship positions, so callers should
   * gate access to this field appropriately in multiplayer contexts.
   */
  hasShip: boolean;
}

/**
 * Outcome returned by `IMatch.planShot`.
 *
 * When `ready` is `true` the shot has been staged and `confirmAttack` may be
 * called immediately. When `ready` is `false` the plan was rejected and
 * `error` contains a human-readable explanation; no staged plan is stored.
 */
export interface PlanShotResult {
  /**
   * `true` when the requested shot position and pattern passed all
   * validation checks and the plan is ready to be confirmed. `false` when
   * the cell is out-of-bounds, already shot, or the pattern is invalid.
   */
  ready: boolean;

  /**
   * Human-readable rejection reason. Only present when `ready` is `false`.
   * Intended for debugging and user-facing error messages.
   */
  error?: string;

  /**
   * 0-based index into the attacker's `shotPatterns` array that was
   * resolved during planning. Echoed back so callers can confirm which
   * pattern will be applied on `confirmAttack`.
   */
  patternIdx?: number;

  /**
   * Board column (0-based) that was accepted as the pattern centre.
   * May differ from the requested value if the engine snapped it to the
   * nearest valid cell.
   */
  centerX?: number;

  /**
   * Board row (0-based) that was accepted as the pattern centre.
   * May differ from the requested value if the engine snapped it to the
   * nearest valid cell.
   */
  centerY?: number;
}

/**
 * Outcome returned by `IMatch.confirmAttack` and `IMatch.planAndAttack`.
 *
 * Extends `ShotPatternResult` with the turn-resolution decision produced by
 * the active `MatchRuleSet`, giving callers everything they need to update
 * UI state and decide whether to present another attack opportunity.
 */
export interface PlanAndAttackResult extends ShotPatternResult {
  /**
   * `true` when the ruleset determined that control should pass to the
   * opposing side after this attack. When `false`, the same attacker may
   * act again (see `canShootAgain`).
   */
  turnEnded: boolean;

  /**
   * `true` when the active attacker is permitted to fire an additional shot
   * without yielding the turn. Driven by ruleset conditions such as a
   * confirmed hit granting a bonus action.
   */
  canShootAgain: boolean;

  /**
   * Human-readable explanation of the turn-resolution decision emitted by
   * the active ruleset. Intended for debugging and match logging; not
   * suitable for direct display in production UI without localisation.
   */
  reason: string;
}

/**
 * Construction options accepted by `new Match()` and the `createMatch()`
 * factory.
 *
 * Extends `MatchCallbacks` so lifecycle event handlers can be declared
 * inline at construction time. Supply either `setup` or `setupProvider`;
 * when neither is provided, `createMatch()` automatically delegates to
 * `GameInitializer`.
 */
export interface NewMatch extends MatchCallbacks {
  /**
   * A fully-constructed `GameSetup` to inject directly into the match,
   * bypassing any provider. When present, `setupProvider` is ignored.
   * Use this when the board layout has already been generated externally
   * (e.g. received from a multiplayer server).
   */
  setup?: GameSetup;

  /**
   * Strategy object responsible for generating a `GameSetup` on demand.
   * Required when `setup` is omitted and the match should produce its own
   * layout. `createMatch()` defaults this to `GameInitializer` if neither
   * field is supplied.
   */
  setupProvider?: IGameSetupProvider;

  /**
   * Optional custom logger instance. When omitted, `Match` creates one.
   */
  logger?: MatchLogger;
}
