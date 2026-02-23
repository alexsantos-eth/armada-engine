import type {
  GameConfig,
  GameEngineState,
  PlayerRole,
  Shot,
  ShotPattern,
} from "../../../../../core/engine";

export type RoomStatus = "waiting" | "playing" | "finished";
export interface RoomPlayer {
  uid: string;
  displayName: string;
  role: PlayerRole;
  joinedAt: number;
  isReady: boolean;
}
export type MatchRuleSetName = "ClassicRuleSet" | "AlternatingTurnsRuleSet";

export interface GameRoom {
  id: string;
  roomCode: string;
  status: RoomStatus;
  host: RoomPlayer;
  guest?: RoomPlayer;
  initialTurn: PlayerRole;
  createdAt: number;
  updatedAt: number;
  gameConfig?: Omit<GameConfig, "initialTurn">;
  currentPhase?: string;
  ruleSet?: MatchRuleSetName;

  hostShots?: Shot[];
  guestShots?: Shot[];
  shotCount?: number;

  hostItemUses?: { itemId: number }[];
  guestItemUses?: { itemId: number }[];

  initialState?: Partial<GameEngineState>;
  currentTurn?: PlayerRole;
  isGameOver?: boolean;
  messages?: Array<{
    id: string;
    senderId: string;
    senderName: string;
    message: string;
    timestamp: number;
  }>;
}

export interface MatchAttackEvent {
  type: "ATTACK";
  /** Role of the player who fired the shot (used to skip own events). */
  senderId: PlayerRole;
  x: number;
  y: number;
  /** Full ShotPattern so the receiver never needs to reconstruct it. */
  pattern: ShotPattern;
  timestamp: number;
}

export interface MatchUseItemEvent {
  type: "USE_ITEM";
  senderId: PlayerRole;
  itemId: number;
  timestamp: number;
}

export type MatchEvent = MatchAttackEvent | MatchUseItemEvent;
