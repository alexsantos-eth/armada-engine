/**
 * Public type surface for the engine core.
 *
 * Re-exports every type, interface, and error constant that external consumers
 * (React hooks, multiplayer adapters, game setup utilities) need to interact
 * with the engine. Import from this barrel instead of from individual module
 * files to maintain a stable import surface.
 *
 * Internal implementation types (e.g. `SideState`, `PositionKey`) are
 * intentionally omitted — they are only required by `GameEngine` and should
 * not be part of the public API.
 */
export type { GameTurn, PlayerName, Winner, PlayerRole } from "./game";
export type { CellState, BoardLayer, Cell, Board } from "./board";
export type { Shot, ShotOffset, ShotPattern, ShotPatternResult, ShotRecord } from "./shots";
export type {
  GameShip,
  GameItem,
  GameObstacle,
  ItemActionContext,
  ShipActionContext,
  ShipPlacement,
  BattleResult,
} from "./entities";

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
  MatchMachineLogEvent,
  MatchLogger,
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
  IMatch,
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
