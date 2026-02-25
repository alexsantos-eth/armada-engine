import { GAME_CONSTANTS } from "../constants/game";
import type { GameConfig, GameShip, GameTurn } from "../engine";
import type { GameItem, GameObstacle } from "../types/common";
import {
  generateShips,
  generateItems,
  generateObstacles,
  equalizeItemCounts,
  getItemCells,
  getShipCellsFromShip,
} from "../tools/ship/calculations";
import type { PlayerName } from "../types/common";

/**
 * Abstraction for anything that can provide a ready-to-use GameSetup.
 * Implement this interface to inject custom setup logic into Match.
 */
export interface IGameSetupProvider {
  getGameSetup(): GameSetup;
}

/**
 * Game setup configuration
 * Contains all initial values needed to start a game
 */
export interface GameSetup {
  /** Player's ship placements */
  playerShips: GameShip[];
  /** Enemy's ship placements */
  enemyShips: GameShip[];
  /** Items placed on the player's board (collectible by the enemy) */
  playerItems?: GameItem[];
  /** Items placed on the enemy's board (collectible by the player) */
  enemyItems?: GameItem[];
  /** Obstacles placed on the player's board (indestructible terrain) */
  playerObstacles?: GameObstacle[];
  /** Obstacles placed on the enemy's board (indestructible terrain) */
  enemyObstacles?: GameObstacle[];
  /** Who starts the game */
  initialTurn: GameTurn;
  /** Game configuration used */
  config: Partial<GameConfig>;
}

export type GAME_INITIAL_TURN = PlayerName | "random";

/**
 * Game Initializer
 *
 * Helps generate initial game values from a simple configuration.
 * Handles validation, default values, and ship generation.
 *
 * @example
 * ```typescript
 * const initializer = new GameInitializer({
 *   boardWidth: 10,
 *   boardHeight: 10,
 * });
 *
 * const setup = initializer.getGameSetup();
 * // setup contains: playerShips, enemyShips, initialTurn, config
 * ```
 */
export class GameInitializer implements IGameSetupProvider {
  private config: GameConfig;
  private initialTurn: GAME_INITIAL_TURN;

  /**
   * Create a new game initializer
   * @param config - Partial game configuration (uses defaults for missing values)
   * @param initialTurn - Who starts the game (default: "random")
   */
  constructor(config: Partial<GameConfig> = {}, initialTurn: GAME_INITIAL_TURN = "random") {
    this.config = { ...this.getDefaultConfig(), ...config };
    this.initialTurn = initialTurn;
    this.validateConfig();
  }

  /**
   * Validate configuration values
   * @throws Error if configuration is invalid
   * @private
   */
  private validateConfig(): void {
    const { boardView, shipCounts } = this.config;
    const { width, height } = boardView;

    if (
      width < GAME_CONSTANTS.BOARD.MIN_SIZE ||
      width > GAME_CONSTANTS.BOARD.MAX_SIZE
    ) {
      throw new Error(
        `Board width must be between ${GAME_CONSTANTS.BOARD.MIN_SIZE} and ${GAME_CONSTANTS.BOARD.MAX_SIZE}`,
      );
    }

    if (
      height < GAME_CONSTANTS.BOARD.MIN_SIZE ||
      height > GAME_CONSTANTS.BOARD.MAX_SIZE
    ) {
      throw new Error(
        `Board height must be between ${GAME_CONSTANTS.BOARD.MIN_SIZE} and ${GAME_CONSTANTS.BOARD.MAX_SIZE}`,
      );
    }

    const totalShips = Object.values(shipCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const maxPossibleShips = Math.floor((width * height) / 4);

    if (totalShips > maxPossibleShips) {
      throw new Error(
        `Too many ships for board size. Maximum possible: ${maxPossibleShips}`,
      );
    }
  }

  /**
   * Get default game configuration
   * @returns Complete default configuration
   */
  public getDefaultConfig(): GameConfig {
    return {
      boardView: GAME_CONSTANTS.BOARD.DEFAULT_VIEW,
      shipCounts: GAME_CONSTANTS.SHIPS.DEFAULT_COUNTS,
      itemCounts: GAME_CONSTANTS.ITEMS.DEFAULT_COUNTS,
      obstacleCounts: GAME_CONSTANTS.OBSTACLES.DEFAULT_COUNTS,
    };
  }

  /**
   * Validate that no item cell overlaps any ship cell on the same board.
   * @param items - Items to validate
   * @param ships - Ships already placed on the same board
   * @param label - Board label used in error messages ("player" or "enemy")
   * @throws Error if any item overlaps a ship
   * @private
   */
  private validateItems(
    items: GameItem[],
    ships: GameShip[],
    label: string,
  ): void {
    const shipCellSet = new Set<string>();
    for (const ship of ships) {
      for (const [sx, sy] of getShipCellsFromShip(ship)) {
        shipCellSet.add(`${sx},${sy}`);
      }
    }

    for (const item of items) {
      for (const [ix, iy] of getItemCells(item)) {
        if (shipCellSet.has(`${ix},${iy}`)) {
          throw new Error(
            `${label} item (id=${item.itemId ?? "?"}) at [${ix},${iy}] overlaps a ship`,
          );
        }
      }
    }
  }

  /**
   * Determine initial turn based on configuration
   * @returns GameTurn value
   * @private
   */
  private determineInitialTurn(): GameTurn {
    switch (this.initialTurn) {
      case "player":
        return "PLAYER_TURN";
      case "enemy":
        return "ENEMY_TURN";
      case "random":
      default:
        return Math.random() <
          GAME_CONSTANTS.GAME_LOGIC.BATTLE.RANDOM_TURN_THRESHOLD
          ? "PLAYER_TURN"
          : "ENEMY_TURN";
    }
  }

  /**
   * Initialize a new game with all required values
   * @returns Complete game setup ready to use
   *
   * @example
   * ```typescript
   * //  initialization
   * const setup = initializer.getGameSetup();
   * ```
   */
  public getGameSetup(): GameSetup {
    const playerShips = generateShips(this.config);
    const enemyShips = generateShips(this.config);

    const rawPlayerItems = generateItems(this.config, playerShips);
    const rawEnemyItems = generateItems(this.config, enemyShips);

    const [playerItems, enemyItems] = equalizeItemCounts(
      rawPlayerItems,
      rawEnemyItems,
    );

    const playerObstacles = generateObstacles(this.config, playerShips, playerItems);
    const enemyObstacles = generateObstacles(this.config, enemyShips, enemyItems);

    const initialTurn: GameTurn = this.determineInitialTurn();

    return {
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      playerObstacles,
      enemyObstacles,
      initialTurn,
      config: this.config,
    };
  }

  public appendGameSetup(setup: Partial<GameSetup>): GameSetup {
    const playerShips = setup.playerShips || generateShips(this.config);
    const enemyShips = setup.enemyShips || generateShips(this.config);

    const rawPlayerItems =
      setup.playerItems || generateItems(this.config, playerShips);
    const rawEnemyItems =
      setup.enemyItems || generateItems(this.config, enemyShips);

    if (setup.playerItems) {
      this.validateItems(setup.playerItems, playerShips, "player");
    }
    if (setup.enemyItems) {
      this.validateItems(setup.enemyItems, enemyShips, "enemy");
    }

    const [playerItems, enemyItems] = equalizeItemCounts(
      rawPlayerItems,
      rawEnemyItems,
    );

    const playerObstacles =
      setup.playerObstacles ?? generateObstacles(this.config, playerShips, playerItems);
    const enemyObstacles =
      setup.enemyObstacles ?? generateObstacles(this.config, enemyShips, enemyItems);

    const initialTurn: GameTurn = this.determineInitialTurn();

    return {
      config: this.config,
      initialTurn,
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      playerObstacles,
      enemyObstacles,
    };
  }
}
