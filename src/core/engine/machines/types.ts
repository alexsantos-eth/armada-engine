import type { GameEngine, IGameEngine, MatchState } from "../logic";
export type { GameEngine, IGameEngine };
import type { MatchRuleSet, TurnDecision } from "../rulesets";
import type { PlanError } from "../errors";
import type {
  GameShip,
  GameItem,
  GameTurn,
  Shot,
  ShotPattern,
  ShotPatternResult,
  Winner,
  GameObstacle,
} from "../../types/common";
import type { GameConfig, BoardViewConfig } from "../../types/config";

/** Pending plan before the attack is confirmed */
export interface PendingPlan {
  centerX: number;
  centerY: number;
  /** 0-based index into the attacker's shotPatterns array */
  patternIdx: number;
  isPlayerShot: boolean;
}

/**
 * All observable side-effect callbacks surfaced by Match.
 * Defined here so matchMachine can own the responsibility of invoking them.
 */
export type MatchCallbacks = {
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  /**
   * Fires after every engine mutation with a turn-aware snapshot.
   * The state includes `currentTurn`, `isPlayerTurn`, and `isEnemyTurn`
   * because the turn is added by the machine before broadcasting.
   */
  onStateChange?: (state: MatchState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
  onItemCollected?: (shot: Shot, item: GameItem, isPlayerShot: boolean) => void;
  /** Fires after a collected item's `onUse` handler is successfully invoked via
   * `match.useItem()`. Useful for synchronising manual item activations over the network.
   * `shipId` is the optional ship the item was targeted at (passed through from `match.useItem()`). */
  onItemUse?: (itemId: number, isPlayerShot: boolean, item: GameItem, shipId?: number) => void;
};

export interface MatchMachineContext {
  /** Underlying game engine (pure compute layer) */
  engine: IGameEngine;
  /** Active ruleset that decides turns and game-over conditions */
  ruleSet: MatchRuleSet;
  /**
   * Live board-view configuration.
   * Initialised from `config.boardView`; items can mutate `playerSide` and
   * `enemySide` at runtime via `ctx.setBoardViewPlayerSide` /
   * `ctx.setBoardViewEnemySide`.  Width and height are intentionally fixed
   * (they belong to the game setup, not to item effects).
   */
  boardView: BoardViewConfig;
  /** Current turn — owned by the machine, not the engine */
  currentTurn: GameTurn;
  /** Match-level event callbacks owned by the machine */
  callbacks?: MatchCallbacks;
  /** Planned attack pending confirmation */
  pendingPlan: PendingPlan | null;
  /** Result of the last executed attack */
  lastAttackResult: ShotPatternResult | null;
  /** Turn decision made by the ruleset in the last round */
  lastTurnDecision: TurnDecision | null;
  /** Error produced when attempting to plan an invalid shot */
  planError: PlanError | null;
  /**
   * Result of the last USE_ITEM event.
   * `true`  — handler found, item wasn't used before, `onUse` was called.
   * `false` — item not found, no `onUse` handler, or already used.
   * `null`  — no USE_ITEM event has been sent yet.
   */
  lastUseItemResult: boolean | null;
  /**
   * The active turn captured immediately before `onUse` is invoked.
   * Used by `resolveItemUse` to detect whether the item handler itself
   * toggled the turn so the ruleset's `decideTurnOnItemUse` is not
   * double-applied.
   */
  turnBeforeItemUse: GameTurn | null;
  /**
   * A ruleset change requested synchronously from inside an `onCollect` or
   * `onUse` handler via `ctx.setRuleSet()`. Stored in machine context so
   * `resolveTurn` / `resolveItemUse` can apply it before calling `decideTurn`,
   * guaranteeing the new ruleset governs the same attack cycle.
   *
   * Previously this lived as `pendingRuleSet` on `GameEngine`, which violated
   * SRP: the engine (state/logic) was holding temporal flow-coordination state
   * that belongs to the machine (game flow).
   */
  pendingRuleSet: MatchRuleSet | null;
  /**
   * Carries the `isPlayerShot` flag from `executeAttack` to `runCollectHandlers`.
   * `pendingPlan` is cleared by `executeAttack`, so without this field
   * `runCollectHandlers` would have no way to know which side fired.
   * Reset to `null` by `resolveTurn`.
   */
  lastAttackIsPlayerShot: boolean | null;
  /**
   * Carries the shot center and pattern from `executeAttack` to `resolveTurn`
   * so the CallbackCoordinator can synthesise the `onShot` payload without
   * requiring `pendingPlan` (which `executeAttack` clears).
   * Reset to `null` by `resolveTurn`.
   */
  lastAttackCenter: {
    centerX: number;
    centerY: number;
    /** 0-based index into the attacker's shotPatterns array */
    patternIdx: number;
  } | null;
  /**
   * Number of turn toggles accumulated by `onCollect` handlers during
   * `runCollectHandlers`. Consumed by `resolveTurn` to incorporate
   * collect-phase turn changes before the ruleset makes its decision.
   * Reset to 0 by `resolveTurn`.
   */
  collectToggleCount: number;
  /**
   * Number of turn toggles accumulated by an `onUse` handler during
   * `useItem`. Consumed by `resolveItemUse` to determine whether the item
   * itself changed the turn before the ruleset's `decideTurnOnItemUse` runs.
   * Reset to 0 by `resolveItemUse`.
   */
  useToggleCount: number;
  /**
   * Identity of the item activated in the last `USE_ITEM` event.
   * Stored by `useItem` so the CallbackCoordinator in `resolveItemUse` can
   * fire `onItemUse` without duplicating the lookup logic.
   * Reset to `null` by `resolveItemUse`.
   */
  lastUsedItemInfo: {
    itemId: number;
    isPlayerShot: boolean;
    item: GameItem;
    shipId?: number;
  } | null;
}

export type MatchMachineEvent =
  /** Initializes the match with both players' ships and optional items */
  | {
      type: "INITIALIZE";
      playerShips: GameShip[];
      enemyShips: GameShip[];
      /** Starting turn (defaults to PLAYER_TURN) */
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
  /** Plans a shot without executing it */
  | {
      type: "PLAN_SHOT";
      centerX: number;
      centerY: number;
      /** 0-based index into the attacker's shotPatterns array; defaults to 0 */
      patternIdx?: number;
      isPlayerShot: boolean;
    }
  /** Confirms and executes the planned attack */
  | { type: "CONFIRM_ATTACK" }
  /** Cancels the pending plan and returns to the waiting state */
  | { type: "CANCEL_PLAN" }
  /** Swaps the active ruleset at runtime */
  | { type: "SET_RULESET"; ruleSet: MatchRuleSet }
  /** Resets the machine to the IDLE state */
  | { type: "RESET" }
  /**
   * Activates the `onUse` handler of a collected item.
   * Only processed while the machine is in the `planning` state.
   * `isPlayerShot: true`  → looks in enemy items (player-collected).
   * `isPlayerShot: false` → looks in player items (enemy-collected).
   */
  | { type: "USE_ITEM"; itemId: number; isPlayerShot: boolean; shipId?: number }
  /**
   * Forces the current turn to the given value without side-effects.
   * Useful for network synchronisation (e.g. re-syncing after reconnect).
   */
  | { type: "SYNC_TURN"; turn: GameTurn }
  /**
   * Replaces the full shot history for both sides in one atomic call.
   * Useful for replay and multiplayer shot synchronisation — keeps all
   * engine mutations flowing through the machine rather than requiring
   * a direct engine reference.
   */
  | { type: "SYNC_SHOTS"; playerShots: Shot[]; enemyShots: Shot[] };

export interface MatchMachineInput {
  /** Board configuration (width, height…); ignored when `engine` is provided */
  config?: Partial<GameConfig>;
  /** Ruleset to use (defaults to ClassicRuleSet) */
  ruleSet?: MatchRuleSet;
  /**
   * Pre-created engine (with its own callbacks already wired up).
   * When provided, `config` is ignored.
   */
  engine?: IGameEngine;
  /** Match-level callbacks. The machine wires engine callbacks and fires
   * `onMatchStart` / `onItemUse` at the appropriate transition points. */
  callbacks?: MatchCallbacks;
}

export type { Winner };
