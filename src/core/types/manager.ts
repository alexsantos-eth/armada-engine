import type { GameShip, GameItem, GameObstacle, GameTurn, ShotPattern, PlayerName } from "./common";
import type { GameConfig } from "./config";

/**
 * Abstraction for anything that can provide a ready-to-use `GameSetup`.
 * Implement this interface to inject custom setup logic into `Match`
 * via `createMatch({ setupProvider: myProvider })`.
 */
export interface IGameSetupProvider {
  getGameSetup(): GameSetup;
}

/**
 * All initial values needed to start a game.
 *
 * Produced by `GameInitializer.getGameSetup()` or built manually and passed
 * directly to `new Match({ setup })` / `createMatch({ setup })`.
 */
export interface GameSetup {
  /** Player's ship placements. */
  playerShips: GameShip[];
  /** Enemy's ship placements. */
  enemyShips: GameShip[];
  /** Items placed on the player's board (collectible by the enemy). */
  playerItems?: GameItem[];
  /** Items placed on the enemy's board (collectible by the player). */
  enemyItems?: GameItem[];
  /** Obstacles placed on the player's board (indestructible terrain). */
  playerObstacles?: GameObstacle[];
  /** Obstacles placed on the enemy's board (indestructible terrain). */
  enemyObstacles?: GameObstacle[];
  /** Shot patterns available to the player at game start. */
  playerShotPatterns?: ShotPattern[];
  /** Shot patterns available to the enemy at game start. */
  enemyShotPatterns?: ShotPattern[];
  /** Which side takes the first move. */
  initialTurn: GameTurn;
  /** Game configuration used to generate this setup. */
  config: Partial<GameConfig>;
}

/**
 * Who goes first when creating a match.
 * `"random"` selects the starting side at random.
 */
export type GAME_INITIAL_TURN = PlayerName | "random";
