import type { PlayerName } from "./common";

export interface GameConfig {
  boardWidth: number;
  boardHeight: number;

  shipCounts: Record<string, number>;

  initialTurn: PlayerName | "random";
}
