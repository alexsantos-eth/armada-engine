import type { GameEngine, GameEngineState } from "../logic";
export type { GameEngine };
import type { MatchRuleSet, TurnDecision } from "../rulesets";
import type {
  GameShip,
  GameTurn,
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

export interface MatchMachineContext {
  /** Underlying game engine (pure compute layer) */
  engine: GameEngine;
  /** Active ruleset that decides turns and game-over conditions */
  ruleSet: MatchRuleSet;
  /** Planned attack pending confirmation */
  pendingPlan: PendingPlan | null;
  /** Result of the last executed attack */
  lastAttackResult: ShotPatternResult | null;
  /** Turn decision made by the ruleset in the last round */
  lastTurnDecision: TurnDecision | null;
  /** Error produced when attempting to plan an invalid shot */
  planError: string | null;
}

export type MatchMachineEvent =
  /** Initializes the match with both players' ships */
  | {
      type: "INITIALIZE";
      playerShips: GameShip[];
      enemyShips: GameShip[];
      /** Starting turn (defaults to PLAYER_TURN) */
      initialTurn?: GameTurn;
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
  /** Confirms and executes the planned attack (ATTACK + TURN phases) */
  | { type: "CONFIRM_ATTACK" }
  /** Cancels the pending plan and returns to the waiting state */
  | { type: "CANCEL_PLAN" }
  /** Swaps the active ruleset at runtime */
  | { type: "SET_RULESET"; ruleSet: MatchRuleSet }
  /** Resets the machine to the IDLE state */
  | { type: "RESET" };

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
}

export type { GameEngineState, Winner };
