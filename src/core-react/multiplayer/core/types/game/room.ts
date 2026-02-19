import type { GameConfig, GameEngineState } from "../../../../../core/engine";
import type { PlayerRole, Shot } from "../../../../../core/types/common";

export type RoomStatus = "waiting" | "playing" | "finished";
export interface RoomPlayer {
  uid: string;
  displayName: string;
  role: PlayerRole;
  joinedAt: number;
  isReady: boolean;
}
export type MatchRuleSetName = 'ClassicRuleSet' | 'AlternatingTurnsRuleSet'

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
