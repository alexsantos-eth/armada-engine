import type { IGameEngine, MatchState } from "./engine";
import type { MatchRuleSet, TurnDecision } from "./rulesets";
import type { PlanError } from "./errors";
import type {
  GameShip,
  GameItem,
  GameObstacle,
} from "./entities";
import type { GameTurn, Winner } from "./game";
import type { Shot, ShotPattern, ShotPatternResult } from "./shots";
import type { GameConfig, BoardViewConfig } from "./config";

/**
 * A planned shot waiting for the player to confirm or cancel.
 * Stored in `MatchMachineContext.pendingPlan` between `PLAN_SHOT` and
 * `CONFIRM_ATTACK` / `CANCEL_PLAN` events.
 */
export interface PendingPlan {
  centerX: number;
  centerY: number;
  /** 0-based index into the attacker's `shotPatterns` array. */
  patternIdx: number;
  isPlayerShot: boolean;
}

/**
 * All observable side-effect callbacks surfaced by `Match`.
 *
 * Owned by `matchMachine`, which invokes them at the appropriate transition
 * points. Adding a new callback only requires updating `fireMatchCallbacks`
 * in `callbacks.ts`.
 */
export type MatchCallbacks = {
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  /**
   * Fires after every engine mutation with a turn-aware snapshot.
   * The snapshot includes `currentTurn`, `isPlayerTurn`, and `isEnemyTurn`
   * because the turn is merged by the machine before broadcasting.
   */
  onStateChange?: (state: MatchState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
  onItemCollected?: (shot: Shot, item: GameItem, isPlayerShot: boolean) => void;
  /**
   * Fires after a collected item's `onUse` handler is successfully invoked
   * via `match.useItem()`. Useful for synchronising manual item activations
   * over the network. `shipId` is the optional ship the item was targeted at.
   */
  onItemUse?: (itemId: number, isPlayerShot: boolean, item: GameItem, shipId?: number) => void;
};

/**
 * Internal context carried by the `matchMachine` XState actor.
 *
 * All mutable game-flow state lives here — the engine handles computation
 * while this context handles temporal coordination (pending plans, last
 * results, accumulated counts, pending ruleset changes, etc.).
 */
export interface MatchMachineContext {
  /** Underlying game engine (pure compute layer). */
  engine: IGameEngine;
  /** Active ruleset that decides turns and game-over conditions. */
  ruleSet: MatchRuleSet;
  /**
   * Live board-view configuration. Initialised from `config.boardView`;
   * item handlers can mutate `playerSide` / `enemySide` at runtime via
   * `ctx.setBoardViewPlayerSide` / `ctx.setBoardViewEnemySide`.
   */
  boardView: BoardViewConfig;
  /** Current turn — owned by the machine, not the engine. */
  currentTurn: GameTurn;
  /** Match-level event callbacks owned by the machine. */
  callbacks?: MatchCallbacks;
  /** Planned attack pending confirmation. */
  pendingPlan: PendingPlan | null;
  /** Result of the last executed attack. */
  lastAttackResult: ShotPatternResult | null;
  /** Turn decision made by the ruleset in the last round. */
  lastTurnDecision: TurnDecision | null;
  /** Error produced when attempting to plan an invalid shot. */
  planError: PlanError | null;
  /**
   * Result of the last `USE_ITEM` event.
   * `true`  — handler found, item not yet used, `onUse` was called.
   * `false` — item not found, no handler, or already used.
   * `null`  — no `USE_ITEM` event has been sent yet.
   */
  lastUseItemResult: boolean | null;
  /**
   * The active turn captured immediately before `onUse` is invoked.
   * Used to detect whether the item handler itself toggled the turn, so
   * `decideTurnOnItemUse` is not double-applied.
   */
  turnBeforeItemUse: GameTurn | null;
  /**
   * A ruleset change requested synchronously from inside an `onCollect` or
   * `onUse` handler via `ctx.setRuleSet()`. Applied by `resolveTurn` /
   * `resolveItemUse` before calling `decideTurn`, ensuring the new ruleset
   * governs the same attack cycle.
   */
  pendingRuleSet: MatchRuleSet | null;
  /**
   * Carries the `isPlayerShot` flag from `executeAttack` to
   * `runCollectHandlers`. Reset to `null` by `resolveTurn`.
   */
  lastAttackIsPlayerShot: boolean | null;
  /**
   * Carries the shot center and pattern from `executeAttack` to `resolveTurn`
   * so `CallbackCoordinator` can synthesise the `onShot` payload without
   * requiring `pendingPlan` (cleared by `executeAttack`).
   * Reset to `null` by `resolveTurn`.
   */
  lastAttackCenter: {
    centerX: number;
    centerY: number;
    /** 0-based index into the attacker's `shotPatterns` array. */
    patternIdx: number;
  } | null;
  /**
   * Number of turn toggles accumulated by `onCollect` handlers during
   * `runCollectHandlers`. Consumed by `resolveTurn` to incorporate
   * collect-phase turn changes before the ruleset makes its decision.
   * Reset to `0` by `resolveTurn`.
   */
  collectToggleCount: number;
  /**
   * Number of turn toggles accumulated by an `onUse` handler during `useItem`.
   * Consumed by `resolveItemUse` to detect whether the item itself changed
   * the turn before `decideTurnOnItemUse` runs.
   * Reset to `0` by `resolveItemUse`.
   */
  useToggleCount: number;
  /**
   * Identity of the item activated in the last `USE_ITEM` event.
   * Stored so `CallbackCoordinator` in `resolveItemUse` can fire `onItemUse`
   * without duplicating the lookup logic.
   * Reset to `null` by `resolveItemUse`.
   */
  lastUsedItemInfo: {
    itemId: number;
    isPlayerShot: boolean;
    item: GameItem;
    shipId?: number;
  } | null;
}

/**
 * All events accepted by the `matchMachine` XState actor.
 *
 * Send events via `match.planShot()`, `match.confirmAttack()`, etc. instead
 * of dispatching them directly, unless you have the `MatchMachineActor`
 * reference and need low-level control.
 */
export type MatchMachineEvent =
  | {
      type: "INITIALIZE";
      playerShips: GameShip[];
      enemyShips: GameShip[];
      /** Starting turn (defaults to `"PLAYER_TURN"`). */
      initialTurn?: GameTurn;
      /** Items placed on the player's board (collectible by the enemy). */
      playerItems?: GameItem[];
      /** Items placed on the enemy's board (collectible by the player). */
      enemyItems?: GameItem[];
      /** Obstacles placed on the player's board (indestructible terrain). */
      playerObstacles?: GameObstacle[];
      /** Obstacles placed on the enemy's board (indestructible terrain). */
      enemyObstacles?: GameObstacle[];
      /** Shot patterns available to the player. */
      playerShotPatterns?: ShotPattern[];
      /** Shot patterns available to the enemy. */
      enemyShotPatterns?: ShotPattern[];
    }
  | {
      type: "PLAN_SHOT";
      centerX: number;
      centerY: number;
      /** 0-based index into the attacker's `shotPatterns` array; defaults to `0`. */
      patternIdx?: number;
      isPlayerShot: boolean;
    }
  | { type: "CONFIRM_ATTACK" }
  | { type: "CANCEL_PLAN" }
  | { type: "SET_RULESET"; ruleSet: MatchRuleSet }
  | { type: "RESET" }
  /**
   * Activates the `onUse` handler of a collected item.
   * Only processed while the machine is in the `planning` state.
   * `isPlayerShot: true` → looks in enemy items (player-collected).
   * `isPlayerShot: false` → looks in player items (enemy-collected).
   */
  | { type: "USE_ITEM"; itemId: number; isPlayerShot: boolean; shipId?: number }
  /**
   * Forces the current turn without side-effects.
   * Useful for network re-synchronisation after a reconnect.
   */
  | { type: "SYNC_TURN"; turn: GameTurn }
  /**
   * Replaces the full shot history for both sides atomically.
   * Useful for replay and multiplayer shot synchronisation.
   */
  | { type: "SYNC_SHOTS"; playerShots: Shot[]; enemyShots: Shot[] };

/**
 * Input provided when creating a `matchMachine` actor via `createActor`.
 */
export interface MatchMachineInput {
  /** Board configuration (width, height…); ignored when `engine` is provided. */
  config?: Partial<GameConfig>;
  /** Ruleset to use (defaults to `ClassicRuleSet`). */
  ruleSet?: MatchRuleSet;
  /**
   * Pre-created engine with its own callbacks already wired up.
   * When provided, `config` is ignored.
   */
  engine?: IGameEngine;
  /**
   * Match-level callbacks. The machine wires engine callbacks and fires
   * `onMatchStart` / `onItemUse` at the appropriate transition points.
   */
  callbacks?: MatchCallbacks;
}

export type { Winner };
