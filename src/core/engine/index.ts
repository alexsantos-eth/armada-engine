export { GameEngine } from "./logic";
export type { GameEngineState, ShotResult, GameEngineCallbacks } from "./logic";

export { Match } from "./match";
export type { MatchShotResult, MatchCallbacks, PlanPhaseResult } from "./match";

export {
  ClassicRuleSet,
  AlternatingTurnsRuleSet,
  DefaultRuleSet,
} from "./rulesets";
export type { MatchRuleSet, TurnDecision, GameOverDecision } from "./rulesets";

export { GameInitializer } from "../manager";
export type { GameSetup } from "../manager";

export type {
  GameShip,
  Shot,
  Winner,
  GameTurn,
  ShipVariant,
  ShipOrientation,
  ShotPattern,
  ShotOffset,
  ShotPatternResult,
} from "../types/common";

export type { GameConfig } from "../types/config";

export { matchMachine, createMatchActor } from "./machines";
export {
  selectGameState,
  selectCurrentTurn,
  selectWinner,
  selectPlanError,
  selectLastAttackResult,
} from "./machines";
export type {
  MatchMachineActor,
  MatchMachineSnapshot,
  MatchMachineContext,
  MatchMachineEvent,
  MatchMachineInput,
  PendingPlan,
} from "./machines";

export {
  SHOT_PATTERNS,
  SINGLE_SHOT,
  CROSS_SHOT,
  LARGE_CROSS_SHOT,
  HORIZONTAL_LINE_SHOT,
  VERTICAL_LINE_SHOT,
  SQUARE_SHOT,
  DIAGONAL_X_SHOT,
  SMALL_SQUARE_SHOT,
  T_SHAPE_SHOT,
  L_SHAPE_SHOT,
  getShotPattern,
  createCustomPattern,
} from "../constants/shotPatterns";
