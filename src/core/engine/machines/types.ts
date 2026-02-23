import type { GameEngine, GameEngineState } from "../logic";
export type { GameEngine };
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
} from "../../types/common";
import type { GameConfig } from "../../types/config";

/** Pending plan before the attack is confirmed */
export interface PendingPlan {
  centerX: number;
  centerY: number;
  pattern: ShotPattern;
  isPlayerShot: boolean;
}

/**
 * All observable side-effect callbacks surfaced by Match.
 * Defined here so matchMachine can own the responsibility of invoking them.
 */
export type MatchCallbacks = {
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  onStateChange?: (state: GameEngineState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onGameOver?: (winner: Winner) => void;
  onMatchStart?: () => void;
  onItemCollected?: (shot: Shot, item: GameItem, isPlayerShot: boolean) => void;
  /** Fires after a collected item's `onUse` handler is successfully invoked via
   * `match.useItem()`. Useful for synchronising manual item activations over the network. */
  onItemUse?: (itemId: number, isPlayerShot: boolean, item: GameItem) => void;
};

export interface MatchMachineContext {
  /** Underlying game engine (pure compute layer) */
  engine: GameEngine;
  /** Active ruleset that decides turns and game-over conditions */
  ruleSet: MatchRuleSet;
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
    }
  /** Plans a shot without executing it */
  | {
      type: "PLAN_SHOT";
      centerX: number;
      centerY: number;
      /** Shot pattern; defaults to SINGLE_SHOT */
      pattern?: ShotPattern;
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
  | { type: "USE_ITEM"; itemId: number; isPlayerShot: boolean };

export interface MatchMachineInput {
  /** Board configuration (width, height…); ignored when `engine` is provided */
  config?: Partial<GameConfig>;
  /** Ruleset to use (defaults to ClassicRuleSet) */
  ruleSet?: MatchRuleSet;
  /**
   * Pre-created engine (with its own callbacks already wired up).
   * When provided, `config` is ignored.
   */
  engine?: GameEngine;
  /** Match-level callbacks. The machine wires engine callbacks and fires
   * `onMatchStart` / `onItemUse` at the appropriate transition points. */
  callbacks?: MatchCallbacks;
}

export type { GameEngineState, Winner };
