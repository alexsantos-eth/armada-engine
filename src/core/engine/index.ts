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

export { Logger } from "./match";

export type {
  PlanAndAttackResult,
  MatchCallbacks,
  PlanShotResult,
  MatchItemActionContext,
  MatchShipActionContext,
  MatchQueryAPI,
} from "./match";

export type {
  ItemUseTurnDecision,
  TurnDecision,
  GameOverDecision,
  MatchRuleSet,
} from "../types/rulesets";

export { GameInitializer } from "../manager";
export type { GameSetup } from "../manager";

export type { GameTurn, Winner, PlayerRole } from "../types/game";

export type { CellState, Cell, Board } from "../types/board";

export type {
  Shot,
  ShotOffset,
  ShotPattern,
  ShotPatternResult,
} from "../types/shots";

export type {
  GameShip,
  GameItem,
  GameObstacle,
  ItemActionContext,
} from "../types/entities";

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
  MatchMachineLogEvent,
  MatchLogger,
  PendingPlan,
} from "./machines";

export type { GameMode, GameModeConstants } from "../types/modes";

export {
  getShip2DCells,
  getShipCellsFromShip,
  getShipSize,
  isValidShipPlacement,
  generateShip,
  generateShip2D,
  generateShips,
} from "../tools/ships";

export { withView } from "../modes/classic/entities/views";