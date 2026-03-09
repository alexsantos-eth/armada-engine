import type { GameConfig } from "../types/config";
import type { GameTurn } from "../types/game";
import type { GameShip, GameItem, GameObstacle } from "../types/entities";
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
import { InitializerError } from "../types/errors";
import type { GameMode } from "../engine";
import { DEFAULT_GAME_MODE } from "../modes";

export class GameInitializer implements IGameSetupProvider {
  private config: GameConfig;
  private initialTurn: GAME_INITIAL_TURN;
  private gameMode: GameMode;

  constructor(
    config: Partial<GameConfig> = {},
    initialTurn: GAME_INITIAL_TURN = "random",
    gameMode: GameMode = DEFAULT_GAME_MODE,
  ) {
    this.gameMode = gameMode;
    this.config = { ...this.getDefaultConfig(), ...config };
    this.initialTurn = initialTurn;
    this.validateConfig();
  }

  private validateConfig(): void {
    const { boardView, shipCounts } = this.config;
    const { width, height } = boardView;

    if (
      width < this.gameMode.constants.BOARD.MIN_SIZE ||
      width > this.gameMode.constants.BOARD.MAX_SIZE
    ) {
      throw new Error(
        InitializerError.BoardWidth(
          this.gameMode.constants.BOARD.MIN_SIZE,
          this.gameMode.constants.BOARD.MAX_SIZE,
        ),
      );
    }

    if (
      height < this.gameMode.constants.BOARD.MIN_SIZE ||
      height > this.gameMode.constants.BOARD.MAX_SIZE
    ) {
      throw new Error(
        InitializerError.BoardHeight(
          this.gameMode.constants.BOARD.MIN_SIZE,
          this.gameMode.constants.BOARD.MAX_SIZE,
        ),
      );
    }

    const totalShips = Object.values(shipCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const maxPossibleShips = Math.floor((width * height) / 4);

    if (totalShips > maxPossibleShips) {
      throw new Error(
        InitializerError.TooManyShips(maxPossibleShips),
      );
    }
  }

  public getDefaultConfig(): GameConfig {
    return {
      boardView: this.gameMode.boardView,
      shipCounts: this.gameMode.defaultCounts.shipCounts,
      itemCounts: this.gameMode.defaultCounts.itemCounts,
      obstacleCounts: this.gameMode.defaultCounts.obstacleCounts,
      ruleSet: this.gameMode.ruleSet,
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
            InitializerError.ItemOverlapShip(
              label,
              String(item.itemId ?? "?"),
              ix,
              iy,
            ),
          );
        }
        if (otherItemCellSet.has(`${ix},${iy}`)) {
          throw new Error(
            InitializerError.ItemOverlapItem(
              label,
              String(item.itemId ?? "?"),
              ix,
              iy,
            ),
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
            InitializerError.ObstacleOverlapShip(
              label,
              String(obstacle.obstacleId ?? "?"),
              ox,
              oy,
            ),
          );
        }
        if (itemCellSet.has(`${ox},${oy}`)) {
          throw new Error(
            InitializerError.ObstacleOverlapItem(
              label,
              String(obstacle.obstacleId ?? "?"),
              ox,
              oy,
            ),
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
          this.gameMode.constants.GAME_LOGIC.BATTLE.RANDOM_TURN_THRESHOLD
          ? "PLAYER_TURN"
          : "ENEMY_TURN";
    }
  }

  public getGameSetup(): GameSetup {
    const playerShips = generateShips(this.config, this.gameMode);
    const enemyShips = generateShips(this.config, this.gameMode);

    const rawPlayerItems = generateItems(this.config, playerShips, this.gameMode);
    const rawEnemyItems = generateItems(this.config, enemyShips, this.gameMode);

    const [playerItems, enemyItems] = equalizeItemCounts(
      rawPlayerItems,
      rawEnemyItems,
    );

    const playerObstacles = generateObstacles(
      this.config,
      playerShips,
      playerItems,
      this.gameMode,
    );
    const enemyObstacles = generateObstacles(
      this.config,
      enemyShips,
      enemyItems,
      this.gameMode,
    );


    debugger;

    const playerShotPatterns = generateShotPatterns(this.config, this.gameMode);
    const enemyShotPatterns = generateShotPatterns(this.config, this.gameMode);

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
      gameMode: this.gameMode,
    };
  }

  public appendGameSetup(setup: Partial<GameSetup>): GameSetup {
    const playerShips = setup.playerShips || generateShips(this.config, this.gameMode);
    const enemyShips = setup.enemyShips || generateShips(this.config, this.gameMode);

    const rawPlayerItems =
      setup.playerItems || generateItems(this.config, playerShips, this.gameMode);
    const rawEnemyItems =
      setup.enemyItems || generateItems(this.config, enemyShips, this.gameMode);

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
      generateObstacles(this.config, playerShips, playerItems, this.gameMode);
    const enemyObstacles =
      setup.enemyObstacles ??
      generateObstacles(this.config, enemyShips, enemyItems, this.gameMode);

    const playerShotPatterns =
      setup.playerShotPatterns ?? generateShotPatterns(this.config, this.gameMode);
    const enemyShotPatterns =
      setup.enemyShotPatterns ?? generateShotPatterns(this.config, this.gameMode);

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
      gameMode: this.gameMode,
    };
  }
}
