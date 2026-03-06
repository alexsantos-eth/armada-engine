import type { IGameEngine, MatchState } from "./engine";
import type { MatchRuleSet, TurnDecision } from "./rulesets";
import type { PlanError } from "./errors";
import type { GameShip, GameItem, GameObstacle } from "./entities";
import type { GameTurn, Winner } from "./game";
import type { Shot, ShotPattern, ShotPatternResult } from "./shots";
import type { GameConfig, BoardViewConfig } from "./config";
import type { GameMode } from "./modes";

/**
 * Snapshot of the board coordinates and pattern used in an attack.
 *
 * Bridging type carried from `executeAttack` to `resolveTurn` so that
 * `CallbackCoordinator` can reconstruct the `onShot` payload independently
 * of `pendingPlan`, which is cleared before `resolveTurn` runs.
 */
export interface AttackCenter {
  /** Zero-based column that was chosen as the pattern's origin. */
  centerX: number;
  /** Zero-based row that was chosen as the pattern's origin. */
  centerY: number;
  /** Zero-based index into the attacker's `shotPatterns` array. */
  patternIdx: number;
}

/**
 * Identity and ownership record for the most recently activated item.
 *
 * Persisted in `MatchMachineContext.lastUsedItemInfo` so that
 * `CallbackCoordinator` inside `resolveItemUse` can dispatch `onItemUse`
 * without repeating the item lookup that already happened in `useItem`.
 */
export interface UsedItemInfo {
  /** Stable numeric identifier of the activated item. */
  itemId: number;
  /**
   * Indicates which side activated the item.
   * `true` → the player used it; `false` → the enemy used it.
   */
  isPlayerShot: boolean;
  /** Full item record at the moment it was activated. */
  item: GameItem;
  /**
   * Optional target ship for item effects that require a specific vessel.
   * `undefined` when the item's `onUse` handler is not ship-targeted.
   */
  shipId?: number;
}

/**
 * Staged attack created by `PLAN_SHOT` and awaiting either `CONFIRM_ATTACK`
 * or `CANCEL_PLAN`.
 *
 * Lives in `MatchMachineContext.pendingPlan` and is cleared as soon as the
 * player resolves or cancels the pending action.
 */
export interface PendingPlan {
  /** Zero-based column chosen as the shot pattern's origin cell. */
  centerX: number;
  /** Zero-based row chosen as the shot pattern's origin cell. */
  centerY: number;
  /** Zero-based index into the attacking side's `shotPatterns` array. */
  patternIdx: number;
  /**
   * Identifies the attacking side.
   * `true` → the local player is the attacker; `false` → the enemy is.
   */
  isPlayerShot: boolean;
}

/**
 * Observable side-effect hooks exposed by the `matchMachine` actor.
 *
 * Each handler is optional; supply only the ones your consumer cares about.
 * The machine fires them at well-defined transition boundaries — consumers
 * should not rely on call frequency beyond what is documented per handler.
 */
export interface MatchCallbacks {
  /**
   * Emitted once per resolved shot cell, in pattern order.
   *
   * Called synchronously inside the attack cycle before `onStateChange`
   * so listeners can animate individual hits before seeing the new state.
   *
   * @param shot - The resolved cell coordinates and hit result.
   * @param isPlayerShot - `true` when the player fired; `false` for the enemy.
   */
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;

  /**
   * Emitted after every engine mutation with the full, turn-enriched snapshot.
   *
   * The snapshot's `currentTurn`, `isPlayerTurn`, and `isEnemyTurn` fields
   * are merged by the machine before broadcasting, so the state always
   * reflects the turn that is active after the mutation.
   *
   * @param state - Immutable snapshot of the game state post-mutation.
   */
  onStateChange?: (state: MatchState) => void;

  /**
   * Emitted when control passes from one side to the other.
   *
   * Not fired during collect-phase micro-toggles; only emitted when the
   * ruleset produces a definitive turn handoff.
   *
   * @param turn - The turn that is now active.
   */
  onTurnChange?: (turn: GameTurn) => void;

  /**
   * Emitted exactly once when `MatchRuleSet.checkGameOver` signals the match
   * has a conclusive result.
   *
   * @param winner - The winning side, or `"DRAW"` when applicable.
   */
  onGameOver?: (winner: Winner) => void;

  /**
   * Emitted once immediately after the machine finishes processing
   * `INITIALIZE`, signalling that the match is ready to accept `PLAN_SHOT`.
   */
  onMatchStart?: () => void;

  /**
   * Emitted once for each item cell collected during the attack resolution,
   * in the order the pattern cells were processed.
   *
   * @param shot - The cell at which the item part was collected.
   * @param item - The item record as it exists after collection.
   * @param isPlayerShot - `true` when the player's attack collected it.
   */
  onItemCollected?: (shot: Shot, item: GameItem, isPlayerShot: boolean) => void;

  /**
   * Emitted after `match.useItem()` successfully invokes an item's `onUse`
   * handler. Useful for replicating item activations over the network.
   *
   * @param itemId - Stable identifier of the activated item.
   * @param isPlayerShot - `true` when the player activated the item.
   * @param item - Full item record at the moment of activation.
   * @param shipId - Target ship, if the item required one; otherwise `undefined`.
   */
  onItemUse?: (
    itemId: number,
    isPlayerShot: boolean,
    item: GameItem,
    shipId?: number,
  ) => void;
}

/**
 * Serializable machine event snapshot persisted by the in-memory logger.
 */
export interface MatchMachineLogEvent {
  /** Monotonic event identifier assigned by the logger. */
  id: number;
  /** UTC timestamp (ISO-8601) of when the event was recorded. */
  timestamp: string;
  /** Event type processed by the state machine (`PLAN_SHOT`, `RESET`, etc.). */
  eventType: MatchMachineEvent["type"];
  /** Action or lifecycle stage that produced this log record. */
  stage: string;
  /** Best-effort machine state label at log time. */
  machineState: string;
  /** Active turn at the moment the record was persisted. */
  currentTurn: GameTurn;
  /** Indicates whether a shot plan existed at that moment. */
  hasPendingPlan: boolean;
  /** Game-over status as observed from the engine snapshot. */
  isGameOver: boolean;
  /** Winner value at log time, or `null` while the match is active. */
  winner: Winner | null;
  /** Optional action-specific payload for debugging or telemetry. */
  metadata?: Record<string, unknown>;
}

/**
 * Contract used by the machine to persist `MatchMachineLogEvent` entries.
 */
export interface MatchLogger {
  add(event: Omit<MatchMachineLogEvent, "id">): MatchMachineLogEvent;
  all(): MatchMachineLogEvent[];
  clear(): void;
  last(): MatchMachineLogEvent | undefined;
}

/**
 * Full internal state of the `matchMachine` XState actor.
 *
 * The engine owns pure computation; this context owns all temporal
 * coordination — staged plans, intermediate results, toggle bookkeeping,
 * and deferred ruleset swaps. Fields prefixed `last*` act as a one-slot
 * buffer consumed once per cycle, then reset to `null` or `0`.
 */
export interface MatchMachineContext {
  /**
   * Stateless compute layer responsible for applying shots, tracking board
   * state, and evaluating hit results. The machine delegates all game logic
   * to this engine rather than duplicating it in the state chart.
   */
  engine: IGameEngine;

  /**
   * Governs turn decisions and game-over evaluation for the current match.
   * Can be replaced at runtime via `SET_RULESET` or transiently via
   * `pendingRuleSet` from within an item handler.
   */
  ruleSet: MatchRuleSet;

  /**
   * Visual mapping that determines which logical board side is rendered as
   * the player's or enemy's perspective. Seeded from `config.boardView` and
   * may be mutated at runtime by item handlers through `ctx.setBoardViewPlayerSide`
   * and `ctx.setBoardViewEnemySide`.
   */
  boardView: BoardViewConfig;

  /**
   * The turn that is currently active. Owned exclusively by the machine —
   * the engine has no knowledge of turn state.
   */
  currentTurn: GameTurn;

  /**
   * Optional consumer-provided hooks. When present, the machine fires the
   * relevant handlers at each transition boundary.
   */
  callbacks?: MatchCallbacks;

  /**
   * Optional in-memory logger that captures every processed machine event.
   */
  logger?: MatchLogger;

  /**
   * The most recently staged attack, or `null` when no shot is pending.
   * Set by `PLAN_SHOT`, consumed and cleared by `CONFIRM_ATTACK` or
   * `CANCEL_PLAN`.
   */
  pendingPlan: PendingPlan | null;

  /**
   * Outcome of the last committed attack pattern.
   * Available immediately after `CONFIRM_ATTACK` resolves; replaced on each
   * new attack and never cleared between turns.
   */
  lastAttackResult: ShotPatternResult | null;

  /**
   * The turn directive produced by the ruleset at the end of the last attack
   * cycle. Consumed by the machine to advance `currentTurn`.
   */
  lastTurnDecision: TurnDecision | null;

  /**
   * Validation error raised when `PLAN_SHOT` targets an illegal cell or uses
   * an unavailable pattern. Cleared on each new `PLAN_SHOT` attempt.
   */
  planError: PlanError | null;

  /**
   * Outcome of the most recent `USE_ITEM` event:
   * - `true`  — item found, not yet used, `onUse` was successfully invoked.
   * - `false` — item not found, lacks a handler, or was already consumed.
   * - `null`  — no `USE_ITEM` event has been dispatched this session.
   */
  lastUseItemResult: boolean | null;

  /**
   * Turn value snapshotted immediately before an item's `onUse` callback
   * runs. Compared post-handler to determine whether the item itself toggled
   * the turn, preventing `decideTurnOnItemUse` from double-applying the change.
   */
  turnBeforeItemUse: GameTurn | null;

  /**
   * Ruleset swap queued by an `onCollect` or `onUse` handler via
   * `ctx.setRuleSet()`. Applied by `resolveTurn` / `resolveItemUse` before
   * `decideTurn` is called, so the new ruleset governs the outcome of the
   * same attack cycle that triggered the change.
   */
  pendingRuleSet: MatchRuleSet | null;

  /**
   * Identifies which side fired the last committed attack.
   * Carried from `executeAttack` to `runCollectHandlers`; reset to `null`
   * by `resolveTurn` after the collect phase completes.
   */
  lastAttackIsPlayerShot: boolean | null;

  /**
   * Coordinates and pattern of the last committed attack.
   * Passed from `executeAttack` to `resolveTurn` so `CallbackCoordinator`
   * can build the `onShot` payload after `pendingPlan` has been cleared.
   * Reset to `null` by `resolveTurn`.
   */
  lastAttackCenter: AttackCenter | null;

  /**
   * Running count of turn-toggle side-effects emitted by `onCollect`
   * handlers during a single `runCollectHandlers` pass. `resolveTurn`
   * reads this to factor collect-phase toggles into the ruleset decision,
   * then resets it to `0`.
   */
  collectToggleCount: number;

  /**
   * Running count of turn-toggle side-effects emitted by an `onUse` handler
   * during a `useItem` call. `resolveItemUse` checks this to avoid
   * double-applying the turn decision when the item already changed the turn,
   * then resets it to `0`.
   */
  useToggleCount: number;

  /**
   * Identity record for the item activated in the most recent `USE_ITEM`
   * cycle. Consumed once by `CallbackCoordinator` inside `resolveItemUse`
   * to fire `onItemUse`, then reset to `null`.
   */
  lastUsedItemInfo: UsedItemInfo | null;
}

/**
 * Bootstraps the match by placing ships, items, and obstacles on both boards
 * and transitioning the machine from `idle` to `planning`.
 *
 * Must be the first event dispatched after the actor is created.
 */
export interface InitializeEvent {
  readonly type: "INITIALIZE";
  /** Ships positioned on the player's board. */
  playerShips: GameShip[];
  /** Ships positioned on the enemy's board. */
  enemyShips: GameShip[];
  /**
   * Which side takes the first turn.
   * @defaultValue `"PLAYER_TURN"`
   */
  initialTurn?: GameTurn;
  /**
   * Collectible items placed on the player's board.
   * The enemy's shots may collect these.
   */
  playerItems?: GameItem[];
  /**
   * Collectible items placed on the enemy's board.
   * The player's shots may collect these.
   */
  enemyItems?: GameItem[];
  /** Indestructible terrain cells on the player's board. */
  playerObstacles?: GameObstacle[];
  /** Indestructible terrain cells on the enemy's board. */
  enemyObstacles?: GameObstacle[];
  /** Shot patterns the player may choose from when attacking. */
  playerShotPatterns?: ShotPattern[];
  /** Shot patterns the enemy may use when attacking. */
  enemyShotPatterns?: ShotPattern[];
}

/**
 * Stages an attack by recording the origin cell and pattern before the player
 * confirms or cancels. Transitions the machine into the `confirming` state
 * and populates `MatchMachineContext.pendingPlan`.
 *
 * Fails with a `PlanError` (stored in `planError`) when the target cell is
 * occupied, already shot, or out of bounds.
 */
export interface PlanShotEvent {
  readonly type: "PLAN_SHOT";
  /** Zero-based column of the pattern's origin cell. */
  centerX: number;
  /** Zero-based row of the pattern's origin cell. */
  centerY: number;
  /**
   * Zero-based index into the attacking side's `shotPatterns` array.
   * @defaultValue `0`
   */
  patternIdx?: number;
  /**
   * Identifies the attacking side.
   * `true` → the player attacks; `false` → the enemy attacks.
   */
  isPlayerShot: boolean;
}

/**
 * Executes the staged attack held in `pendingPlan`.
 * Only accepted while the machine is in the `confirming` state.
 * Advances through the full attack cycle — shots, collect handlers,
 * turn resolution — before returning to `planning`.
 */
export interface ConfirmAttackEvent {
  readonly type: "CONFIRM_ATTACK";
}

/**
 * Discards the staged attack held in `pendingPlan` without firing any shots.
 * Returns the machine to the `planning` state.
 */
export interface CancelPlanEvent {
  readonly type: "CANCEL_PLAN";
}

/**
 * Replaces the active ruleset immediately.
 * The new ruleset governs all subsequent turn decisions and game-over checks.
 * For mid-cycle swaps triggered by item handlers, use `ctx.setRuleSet()`
 * instead, which routes through `pendingRuleSet`.
 */
export interface SetRulesetEvent {
  readonly type: "SET_RULESET";
  /** Replacement ruleset to activate. */
  ruleSet: MatchRuleSet;
}

/**
 * Tears down the current match and resets the machine to its initial `idle`
 * state, clearing all boards, shots, and context fields.
 */
export interface ResetEvent {
  readonly type: "RESET";
}

/**
 * Activates the `onUse` handler of a previously collected item.
 *
 * Only processed while the machine is in the `planning` state. The lookup
 * direction is determined by `isPlayerShot`: the player-collected items live
 * on the enemy's board, and vice versa.
 *
 * `isPlayerShot: true`  → searches enemy items (collected by the player).
 * `isPlayerShot: false` → searches player items (collected by the enemy).
 */
export interface UseItemEvent {
  readonly type: "USE_ITEM";
  /** Stable numeric identifier of the item to activate. */
  itemId: number;
  /**
   * Identifies which side is activating the item, which determines the
   * board side to search. See event-level docs for the lookup convention.
   */
  isPlayerShot: boolean;
  /**
   * Optional target ship for item effects that require one.
   * Forwarded verbatim to the item's `onUse` handler.
   */
  shipId?: number;
}

/**
 * Overwrites `currentTurn` without triggering any side-effects or callbacks.
 * Intended for network reconnection scenarios where the client needs to
 * re-align its local turn state with the authoritative server value.
 */
export interface SyncTurnEvent {
  readonly type: "SYNC_TURN";
  /** The turn value to enforce. */
  turn: GameTurn;
}

/**
 * Atomically replaces the complete shot history for both boards.
 * Intended for replay playback or multiplayer re-synchronisation after a
 * disconnection, where an incremental catch-up would be ambiguous.
 */
export interface SyncShotsEvent {
  readonly type: "SYNC_SHOTS";
  /** Complete ordered shot history for the player's attacks. */
  playerShots: Shot[];
  /** Complete ordered shot history for the enemy's attacks. */
  enemyShots: Shot[];
}

/**
 * Discriminated union of every event the `matchMachine` actor accepts.
 *
 * Prefer the typed helper methods — `match.planShot()`, `match.confirmAttack()`,
 * etc. — over dispatching raw events, unless you hold a direct
 * `MatchMachineActor` reference and need low-level control.
 */
export type MatchMachineEvent =
  | InitializeEvent
  | PlanShotEvent
  | ConfirmAttackEvent
  | CancelPlanEvent
  | SetRulesetEvent
  | ResetEvent
  | UseItemEvent
  | SyncTurnEvent
  | SyncShotsEvent;

/**
 * Bootstrap options passed to `createActor(matchMachine, { input })`.
 *
 * All fields are optional; sensible defaults are applied for any omitted
 * configuration.
 */
export interface MatchMachineInput {
  /**
   * Board dimensions and game-level settings.
   * Ignored when a fully constructed `engine` is supplied directly.
   */
  config?: Partial<GameConfig>;

  /**
   * The game mode being used for this match.
   * Contains ships, items, obstacles, shot patterns, and ruleset defaults.
   */
  gameMode?: GameMode;

  /**
   * Ruleset that governs turn order and victory conditions.
   * @defaultValue `ClassicRuleSet`
   */
  ruleSet?: MatchRuleSet;

  /**
   * Pre-constructed engine instance to adopt instead of creating a new one.
   * Useful when the caller needs to wire low-level engine callbacks before
   * handing control to the machine. When provided, `config` is ignored.
   */
  engine?: IGameEngine;

  /**
   * Consumer-provided hooks wired by the machine at construction time.
   * `onMatchStart` and `onItemUse` are dispatched by the machine itself;
   * remaining callbacks are forwarded to the engine.
   */
  callbacks?: MatchCallbacks;

  /**
   * Optional logger instance used by the machine to persist event objects.
   */
  logger?: MatchLogger;
}

export type { Winner };
