export type {
  IGameEngine,
  IGameEngineReader,
  GameEngineState,
  MatchState,
  ShotResult,
} from "./logic";
export { toMatchState } from "./logic";

export { buildPlayerBoard, buildEnemyBoard } from "./board";

export { Match, createMatch } from "./match";
export type {
  PlanAndAttackResult,
  MatchCallbacks,
  PlanShotResult,
  MatchItemActionContext,
  MatchShipActionContext,
  MatchQueryAPI,
} from "./match";

export {
  ClassicRuleSet,
  AlternatingTurnsRuleSet,
  DefaultRuleSet,
  getRuleSetByName,
} from "./rulesets";
export type { MatchRuleSet, TurnDecision, GameOverDecision } from "./rulesets";

export { GameInitializer } from "../manager";
export type { GameSetup } from "../manager";

export type {
  GameShip,
  GameItem,
  GameObstacle,
  Shot,
  Winner,
  GameTurn,
  ShotPattern,
  ShotOffset,
  ShotPatternResult,
  PlayerRole,
  CellState,
  Cell,
  Board,
  ItemActionContext,
} from "../types/common";

export type { GameConfig, BoardLayer, BoardViewConfig } from "../types/config";

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

export { GAME_CONSTANTS } from "../constants/game";

export {
  StandardBoardView,
  FogOfWarBoardView,
  DebugBoardView,
  SpectatorBoardView,
  getBoardViewByName,
  DefaultBoardView,
  withView,
} from "../constants/views";

export {
  SMALL_SHIP,
  MEDIUM_SHIP,
  LARGE_SHIP,
  XLARGE_SHIP,
  SHIP_TEMPLATES,
  getShipTemplate,
  createShip,
} from "../constants/ships";

export { ShotError, PlanError, AttackError } from "./errors";

export {
  getShip2DCells,
  getShipCellsFromShip,
  getShipSize,
  isValidShipPlacement,
  generateShip,
  generateShip2D,
  generateShips,
} from "../tools/ships";
