export type {
  GameShip,
  GameItem,
  GameObstacle,
  Shot,
  ShotOffset,
  ShotPattern,
  ShotPatternResult,
  Winner,
  GameTurn,
  PlayerName,
  PlayerRole,
  CellState,
  Cell,
  Board,
  BoardLayer,
  ItemActionContext,
  ShipActionContext,
  BattleResult,
  ShotRecord,
  ShipPlacement,
} from "./common";

export type {
  BoardViewConfig,
  GameConfig,
} from "./config";
export type { BoardLayer as BoardLayerFromConfig } from "./config";

export type {
  IGameEngineReader,
  IGameEngine,
  GameEngineState,
  MatchState,
  ShotResult,
  SidePerspective,
} from "./engine";

export type {
  ItemUseTurnDecision,
  TurnDecision,
  GameOverDecision,
  MatchRuleSet,
} from "./rulesets";

export { ShotError, PlanError, AttackError } from "./errors";
export type { ShotError as ShotErrorType, PlanError as PlanErrorType, AttackError as AttackErrorType } from "./errors";

export type {
  PendingPlan,
  MatchCallbacks,
  MatchMachineContext,
  MatchMachineEvent,
  MatchMachineInput,
} from "./machines";

export type {
  AttackCyclePayload,
  ItemUseCyclePayload,
  MatchLifecyclePayload,
  CallbackPayload,
} from "./callbacks";

export type {
  MatchItemActionContext,
  MatchShipActionContext,
  MatchQueryAPI,
  CellInfo,
  PlanShotResult,
  PlanAndAttackResult,
  NewMatch,
} from "./match";

export type {
  IGameSetupProvider,
  GameSetup,
  GAME_INITIAL_TURN,
} from "./manager";

export type {
  ItemTemplate,
  ShipTemplate,
  ObstacleTemplate,
} from "./constants";
