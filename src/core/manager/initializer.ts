import { GAME_CONSTANTS } from "../constants/game";
import type { GameConfig } from "../types/config";
import type {
  GameShip,
  GameItem,
  GameObstacle,
  GameTurn,
} from "../types/common";
import { generateShips, getShipCellsFromShip } from "../tools/ships";
import { generateItems, equalizeItemCounts, getItemCells } from "../tools/items";
import { generateObstacles, getObstacleCellsFromObstacle } from "../tools/obstacles";
import { generateShotPatterns } from "../tools/shots";

export type {
  IGameSetupProvider,
  GameSetup,
  GAME_INITIAL_TURN,
} from "../types/manager";
import type {
  IGameSetupProvider,
  GameSetup,
  GAME_INITIAL_TURN,
} from "../types/manager";

export class GameInitializer implements IGameSetupProvider {
  private config: GameConfig;
  private initialTurn: GAME_INITIAL_TURN;

  constructor(
    config: Partial<GameConfig> = {},
    initialTurn: GAME_INITIAL_TURN = "random",
  ) {
    this.config = { ...this.getDefaultConfig(), ...config };
    this.initialTurn = initialTurn;
    this.validateConfig();
  }

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

  public getDefaultConfig(): GameConfig {
    return {
      boardView: GAME_CONSTANTS.BOARD.DEFAULT_VIEW,
      shipCounts: GAME_CONSTANTS.SHIPS.DEFAULT_COUNTS,
      itemCounts: GAME_CONSTANTS.ITEMS.DEFAULT_COUNTS,
      obstacleCounts: GAME_CONSTANTS.OBSTACLES.DEFAULT_COUNTS,
    };
  }

  private validateItems(
    items: GameItem[],
    ships: GameShip[],
    label: string,
    otherItems: GameItem[] = [],
  ): void {
    const shipCellSet = new Set<string>();
    for (const ship of ships) {
      for (const [sx, sy] of getShipCellsFromShip(ship)) {
        shipCellSet.add(`${sx},${sy}`);
      }
    }

    const otherItemCellSet = new Set<string>();
    for (const other of otherItems) {
      for (const [ox, oy] of getItemCells(other)) {
        otherItemCellSet.add(`${ox},${oy}`);
      }
    }

    for (const item of items) {
      for (const [ix, iy] of getItemCells(item)) {
        if (shipCellSet.has(`${ix},${iy}`)) {
          throw new Error(
            `${label} item (id=${item.itemId ?? "?"}) at [${ix},${iy}] overlaps a ship`,
          );
        }
        if (otherItemCellSet.has(`${ix},${iy}`)) {
          throw new Error(
            `${label} item (id=${item.itemId ?? "?"}) at [${ix},${iy}] overlaps another item`,
          );
        }
      }
    }
  }

  private validateObstacles(
    obstacles: GameObstacle[],
    ships: GameShip[],
    items: GameItem[],
    label: string,
  ): void {
    const shipCellSet = new Set<string>();
    for (const ship of ships) {
      for (const [sx, sy] of getShipCellsFromShip(ship)) {
        shipCellSet.add(`${sx},${sy}`);
      }
    }

    const itemCellSet = new Set<string>();
    for (const item of items) {
      for (const [ix, iy] of getItemCells(item)) {
        itemCellSet.add(`${ix},${iy}`);
      }
    }

    for (const obstacle of obstacles) {
      for (const [ox, oy] of getObstacleCellsFromObstacle(obstacle)) {
        if (shipCellSet.has(`${ox},${oy}`)) {
          throw new Error(
            `${label} obstacle (id=${obstacle.obstacleId ?? "?"}) at [${ox},${oy}] overlaps a ship`,
          );
        }
        if (itemCellSet.has(`${ox},${oy}`)) {
          throw new Error(
            `${label} obstacle (id=${obstacle.obstacleId ?? "?"}) at [${ox},${oy}] overlaps an item`,
          );
        }
      }
    }
  }

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

  public getGameSetup(): GameSetup {
    const playerShips = generateShips(this.config);
    const enemyShips = generateShips(this.config);

    const rawPlayerItems = generateItems(this.config, playerShips);
    const rawEnemyItems = generateItems(this.config, enemyShips);

    const [playerItems, enemyItems] = equalizeItemCounts(
      rawPlayerItems,
      rawEnemyItems,
    );

    const playerObstacles = generateObstacles(
      this.config,
      playerShips,
      playerItems,
    );
    const enemyObstacles = generateObstacles(
      this.config,
      enemyShips,
      enemyItems,
    );

    const playerShotPatterns = generateShotPatterns(this.config);
    const enemyShotPatterns = generateShotPatterns(this.config);

    const initialTurn: GameTurn = this.determineInitialTurn();

    return {
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      playerObstacles,
      enemyObstacles,
      playerShotPatterns,
      enemyShotPatterns,
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

    if (setup.playerObstacles) {
      this.validateObstacles(
        setup.playerObstacles,
        playerShips,
        playerItems,
        "player",
      );
    }
    if (setup.enemyObstacles) {
      this.validateObstacles(
        setup.enemyObstacles,
        enemyShips,
        enemyItems,
        "enemy",
      );
    }

    const playerObstacles =
      setup.playerObstacles ??
      generateObstacles(this.config, playerShips, playerItems);
    const enemyObstacles =
      setup.enemyObstacles ??
      generateObstacles(this.config, enemyShips, enemyItems);

    const playerShotPatterns =
      setup.playerShotPatterns ?? generateShotPatterns(this.config);
    const enemyShotPatterns =
      setup.enemyShotPatterns ?? generateShotPatterns(this.config);

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
      playerShotPatterns,
      enemyShotPatterns,
    };
  }
}
