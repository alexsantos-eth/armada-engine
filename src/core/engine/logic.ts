import { GAME_CONSTANTS } from "../constants/game";
import { getShipCellsFromShip } from "../tools/ship/calculations";
import { ShotError } from "./errors";
import type {
  GameShip,
  GameItem,
  Shot,
  Winner,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
} from "../types/common";
import type { GameConfig } from "../types/config";

type PositionKey = string;
const posKey = (x: number, y: number): PositionKey => `${x},${y}`;

export class GameEngine {
  private currentTurn: GameTurn;
  private playerShips: GameShip[];
  private enemyShips: GameShip[];
  private isGameOver: boolean;
  private winner: Winner;
  private boardWidth: number;
  private boardHeight: number;
  private shotCount: number;

  private playerShotsMap: Map<PositionKey, Shot>;
  private enemyShotsMap: Map<PositionKey, Shot>;
  private playerShipPositions: Map<PositionKey, number>;
  private enemyShipPositions: Map<PositionKey, number>;
  private playerShipHits: Map<number, number>;
  private enemyShipHits: Map<number, number>;
  private playerShipSizes: Map<number, number>;
  private enemyShipSizes: Map<number, number>;

  // Items
  private playerItems: GameItem[];
  private enemyItems: GameItem[];
  private playerItemPositions: Map<PositionKey, number>;
  private enemyItemPositions: Map<PositionKey, number>;
  /** How many parts of each item have been shot (indexed by itemId array index). */
  private playerItemHits: Map<number, number>;
  private enemyItemHits: Map<number, number>;
  /** Fully collected item ids (array indices). */
  private playerCollectedItems: Set<number>;
  private enemyCollectedItems: Set<number>;

  private onStateChange?: (state: GameEngineState) => void;
  private onTurnChange?: (turn: GameTurn) => void;
  private onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  private onGameOver?: (winner: Winner) => void;

  constructor(
    config: Partial<GameConfig> = {},
    callbacks?: GameEngineCallbacks,
  ) {
    this.boardWidth = config.boardWidth ?? GAME_CONSTANTS.BOARD.DEFAULT_WIDTH;
    this.boardHeight =
      config.boardHeight ?? GAME_CONSTANTS.BOARD.DEFAULT_HEIGHT;
    this.currentTurn = "PLAYER_TURN";
    this.playerShips = [];
    this.enemyShips = [];
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;

    this.playerShotsMap = new Map();
    this.enemyShotsMap = new Map();
    this.playerShipPositions = new Map();
    this.enemyShipPositions = new Map();
    this.playerShipHits = new Map();
    this.enemyShipHits = new Map();
    this.playerShipSizes = new Map();
    this.enemyShipSizes = new Map();

    this.playerItems = [];
    this.enemyItems = [];
    this.playerItemPositions = new Map();
    this.enemyItemPositions = new Map();
    this.playerItemHits = new Map();
    this.enemyItemHits = new Map();
    this.playerCollectedItems = new Set();
    this.enemyCollectedItems = new Set();

    this.onStateChange = callbacks?.onStateChange;
    this.onTurnChange = callbacks?.onTurnChange;
    this.onShot = callbacks?.onShot;
    this.onGameOver = callbacks?.onGameOver;
  }

  /**
   * Initialize a new game with ships, items, and starting turn
   * @param playerShips - Array of player's ships
   * @param enemyShips - Array of enemy's ships
   * @param initialTurn - Which player starts (defaults to PLAYER_TURN)
   * @param playerItems - Items placed on the player's board (enemy can collect these)
   * @param enemyItems - Items placed on the enemy's board (player can collect these)
   */
  public initializeGame(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    initialTurn: GameTurn = "PLAYER_TURN",
    playerItems: GameItem[] = [],
    enemyItems: GameItem[] = [],
  ): void {
    this.playerShips = playerShips;
    this.enemyShips = enemyShips;
    this.currentTurn = initialTurn;
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;

    this.playerShotsMap.clear();
    this.enemyShotsMap.clear();
    this.playerShipPositions.clear();
    this.enemyShipPositions.clear();
    this.playerShipHits.clear();
    this.enemyShipHits.clear();
    this.playerShipSizes.clear();
    this.enemyShipSizes.clear();

    this.playerItems = playerItems;
    this.enemyItems = enemyItems;
    this.playerItemPositions.clear();
    this.enemyItemPositions.clear();
    this.playerItemHits.clear();
    this.enemyItemHits.clear();
    this.playerCollectedItems.clear();
    this.enemyCollectedItems.clear();

    this.cacheShipPositions(
      playerShips,
      this.playerShipPositions,
      this.playerShipSizes,
    );
    this.cacheShipPositions(
      enemyShips,
      this.enemyShipPositions,
      this.enemyShipSizes,
    );

    this.cacheItemPositions(playerItems, this.playerItemPositions);
    this.cacheItemPositions(enemyItems, this.enemyItemPositions);

    this.notifyStateChange();
  }

  /**
   * Reset the game to initial state
   */
  public resetGame(): void {
    this.currentTurn = "PLAYER_TURN";
    this.playerShips = [];
    this.enemyShips = [];
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;

    this.playerShotsMap.clear();
    this.enemyShotsMap.clear();
    this.playerShipPositions.clear();
    this.enemyShipPositions.clear();
    this.playerShipHits.clear();
    this.enemyShipHits.clear();
    this.playerShipSizes.clear();
    this.enemyShipSizes.clear();

    this.playerItems = [];
    this.enemyItems = [];
    this.playerItemPositions.clear();
    this.enemyItemPositions.clear();
    this.playerItemHits.clear();
    this.enemyItemHits.clear();
    this.playerCollectedItems.clear();
    this.enemyCollectedItems.clear();

    this.notifyStateChange();
  }

  /**
   * Set board dimensions
   * @param width - Board width in cells
   * @param height - Board height in cells
   */
  public setBoardDimensions(width: number, height: number): void {
    this.boardWidth = width;
    this.boardHeight = height;
    this.notifyStateChange();
  }

  /**
   * Get current turn
   * @returns Current game turn (PLAYER_TURN or ENEMY_TURN)
   */
  public getCurrentTurn(): GameTurn {
    return this.currentTurn;
  }

  /**
   * Check if it's the player's turn
   * @returns True if current turn is PLAYER_TURN
   */
  public isPlayerTurn(): boolean {
    return this.currentTurn === "PLAYER_TURN";
  }

  /**
   * Check if it's the enemy's turn
   * @returns True if current turn is ENEMY_TURN
   */
  public isEnemyTurn(): boolean {
    return this.currentTurn === "ENEMY_TURN";
  }

  /**
   * Set turn to player
   */
  private setPlayerTurn(): void {
    this.currentTurn = "PLAYER_TURN";
    this.onTurnChange?.(this.currentTurn);
    this.notifyStateChange();
  }

  /**
   * Set turn to enemy
   */
  private setEnemyTurn(): void {
    this.currentTurn = "ENEMY_TURN";
    this.onTurnChange?.(this.currentTurn);
    this.notifyStateChange();
  }

  /**
   * Toggle turn between player and enemy
   */
  private toggleTurn(): void {
    if (this.currentTurn === "PLAYER_TURN") {
      this.setEnemyTurn();
    } else {
      this.setPlayerTurn();
    }
  }

  /**
   * Execute a shot at target coordinates (internal use only)
   * @param x - X coordinate on board
   * @param y - Y coordinate on board
   * @param isPlayerShot - True if shot is from player, false if from enemy
   * @param suppressCallback - If true, don't trigger onShot callback (used internally for patterns)
   * @param patternInfo - Optional pattern information to store with the shot
   * @returns Result of the shot including hit status and game state
   * @private - Use executeShotPattern() instead
   */
  private executeShot(
    x: number,
    y: number,
    isPlayerShot: boolean,
    suppressCallback: boolean = false,
    patternInfo?: { patternId: string; centerX: number; centerY: number },
  ): ShotResult {
    if (this.isCellShot(x, y, isPlayerShot)) {
      return {
        success: false,
        error: ShotError.CellAlreadyShot,
        hit: false,
        shipId: -1,
      };
    }

    const result = this.checkShot(x, y, isPlayerShot);

    const itemCollection = !result.hit
      ? this.collectItem(x, y, isPlayerShot)
      : null;

    const shot: Shot = {
      x,
      y,
      hit: result.hit,
      shipId: result.shipId >= 0 ? result.shipId : undefined,
      patternId: patternInfo?.patternId || "single",
      patternCenterX: patternInfo?.centerX || x,
      patternCenterY: patternInfo?.centerY || y,
      ...(itemCollection?.collected && {
        collected: true,
        itemId: itemCollection.itemId,
        itemFullyCollected: itemCollection.itemFullyCollected,
      }),
    };

    const key = posKey(x, y);
    const shotsMap = isPlayerShot ? this.playerShotsMap : this.enemyShotsMap;
    shotsMap.set(key, shot);

    if (result.hit && result.shipId >= 0) {
      const hitsMap = isPlayerShot ? this.enemyShipHits : this.playerShipHits;
      const currentHits = (hitsMap.get(result.shipId) || 0) + 1;
      hitsMap.set(result.shipId, currentHits);
    }

    this.shotCount++;
    if (!suppressCallback) {
      this.onShot?.(shot, isPlayerShot);
    }

    const shipDestroyed =
      result.hit && result.shipId >= 0
        ? this.isShipDestroyed(result.shipId, isPlayerShot)
        : false;

    this.notifyStateChange();

    return {
      success: true,
      hit: result.hit,
      shipId: result.shipId,
      shipDestroyed,
      isGameOver: this.isGameOver,
      winner: this.winner,
      collected: itemCollection?.collected,
      itemId: itemCollection?.itemId,
      itemFullyCollected: itemCollection?.itemFullyCollected,
    };
  }

  /**
   * Execute a shot pattern at target coordinates
   * This is the primary method for executing shots. For a single-cell shot, use SINGLE_SHOT pattern.
   *
   * @param centerX - Center X coordinate for the pattern
   * @param centerY - Center Y coordinate for the pattern
   * @param pattern - The shot pattern to execute (use SINGLE_SHOT for standard single shots)
   * @param isPlayerShot - True if shots are from player, false if from enemy
   * @returns Result containing all shots executed in the pattern
   *
   * @example
   * // Single shot
   * engine.executeShotPattern(5, 5, SINGLE_SHOT, true);
   *
   * // Cross pattern
   * engine.executeShotPattern(5, 5, CROSS_SHOT, true);
   */
  public executeShotPattern(
    centerX: number,
    centerY: number,
    pattern: ShotPattern,
    isPlayerShot: boolean,
  ): ShotPatternResult {
    if (this.isGameOver) {
      return {
        success: false,
        error: ShotError.GameAlreadyOver,
        shots: [],
        isGameOver: true,
        winner: this.winner,
      };
    }

    const shots: ShotPatternResult["shots"] = [];

    for (const offset of pattern.offsets) {
      const targetX = centerX + offset.dx;
      const targetY = centerY + offset.dy;

      if (!this.isValidPosition(targetX, targetY)) {
        shots.push({
          x: targetX,
          y: targetY,
          hit: false,
          executed: false,
        });
        continue;
      }

      if (this.isCellShot(targetX, targetY, isPlayerShot)) {
        const existingShot = this.getShotAtPosition(
          targetX,
          targetY,
          isPlayerShot,
        );

        shots.push({
          x: targetX,
          y: targetY,
          hit: existingShot?.hit ?? false,
          shipId: existingShot?.shipId,
          executed: false,
        });
        continue;
      }

      const shotResult = this.executeShot(
        targetX,
        targetY,
        isPlayerShot,
        true,
        { patternId: pattern.id, centerX, centerY },
      );

      shots.push({
        x: targetX,
        y: targetY,
        hit: shotResult.hit,
        shipId: shotResult.shipId >= 0 ? shotResult.shipId : undefined,
        shipDestroyed: shotResult.shipDestroyed,
        executed: true,
        patternId: pattern.id,
        patternCenterX: centerX,
        patternCenterY: centerY,
        collected: shotResult.collected,
        itemId: shotResult.itemId,
        itemFullyCollected: shotResult.itemFullyCollected,
      });
    }

    if (this.onShot) {
      const centerShot: Shot = {
        x: centerX,
        y: centerY,
        hit: shots.some((s) => s.hit && s.executed),
        shipId: shots.find((s) => s.hit && s.executed)?.shipId,
        patternId: pattern.id,
        patternCenterX: centerX,
        patternCenterY: centerY,
      };

      this.onShot(centerShot, isPlayerShot);
    }

    return {
      success: true,
      shots,
      isGameOver: this.isGameOver,
      winner: this.winner,
    };
  }

  /**
   * Check if a shot hits a ship
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShot - True if checking enemy ships, false if checking player ships
   * @returns Object with hit status and ship ID if hit
   */
  public checkShot(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): { hit: boolean; shipId: number } {
    const shipPositions = isPlayerShot
      ? this.enemyShipPositions
      : this.playerShipPositions;
    const key = posKey(x, y);
    const shipId = shipPositions.get(key);

    if (shipId !== undefined) {
      return { hit: true, shipId };
    }

    return { hit: false, shipId: -1 };
  }

  /**
   * Check if a cell has already been shot at
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShot - True to check player shots, false for enemy shots
   * @returns True if cell was already shot
   */
  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    const shotsMap = isPlayerShot ? this.playerShotsMap : this.enemyShotsMap;
    return shotsMap.has(posKey(x, y));
  }

  /**
   * Check if a ship is completely destroyed
   * @param shipId - ID of the ship to check
   * @param isPlayerShot - True if checking enemy ship, false for player ship
   * @returns True if all ship cells have been hit
   */
  public isShipDestroyed(shipId: number, isPlayerShot: boolean): boolean {
    const ships = isPlayerShot ? this.enemyShips : this.playerShips;
    if (shipId >= ships.length) return false;

    const hitsMap = isPlayerShot ? this.enemyShipHits : this.playerShipHits;
    const sizesMap = isPlayerShot ? this.enemyShipSizes : this.playerShipSizes;

    const hits = hitsMap.get(shipId) || 0;
    const size = sizesMap.get(shipId);

    return size !== undefined && hits === size;
  }

  /**
   * Check if all ships of a player are destroyed
   * @param isPlayerShips - True to check player ships, false for enemy ships
   * @returns True if all ships are destroyed
   */
  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    const ships = isPlayerShips ? this.playerShips : this.enemyShips;

    if (ships.length === 0) {
      return false;
    }

    return ships.every((_, shipId) =>
      this.isShipDestroyed(shipId, !isPlayerShips),
    );
  }

  /**
   * Set the game as over with a winner
   * @param winner - The winner of the game ('player' or 'enemy')
   * @private - Should only be called through Match
   */
  private setGameOver(winner: Winner): void {
    this.winner = winner;
    this.isGameOver = true;
    this.onGameOver?.(this.winner);
    this.notifyStateChange();
  }

  /**
   * Cache ship positions for O(1) lookup
   * @private
   */
  private cacheShipPositions(
    ships: GameShip[],
    positionsMap: Map<PositionKey, number>,
    sizesMap: Map<number, number>,
  ): void {
    ships.forEach((ship, shipId) => {
      const cells = getShipCellsFromShip(ship);
      sizesMap.set(shipId, cells.length);

      cells.forEach(([x, y]) => {
        positionsMap.set(posKey(x, y), shipId);
      });
    });
  }

  /**
   * Cache item positions for O(1) lookup.
   * Each item occupies `part` cells in a horizontal row starting at `coords`.
   * @private
   */
  private cacheItemPositions(
    items: GameItem[],
    positionsMap: Map<PositionKey, number>,
  ): void {
    items.forEach((item, itemId) => {
      const [startX, y] = item.coords;
      for (let i = 0; i < item.part; i++) {
        positionsMap.set(posKey(startX + i, y), itemId);
      }
    });
  }

  /**
   * Try to collect an item at the given position.
   * Returns collection info or null if no item is present.
   * @private
   */
  private collectItem(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): { collected: boolean; itemId: number; itemFullyCollected: boolean } | null {
    const itemPositions = isPlayerShot
      ? this.enemyItemPositions
      : this.playerItemPositions;
    const items = isPlayerShot ? this.enemyItems : this.playerItems;
    const itemHits = isPlayerShot ? this.enemyItemHits : this.playerItemHits;
    const collectedSet = isPlayerShot
      ? this.enemyCollectedItems
      : this.playerCollectedItems;

    const key = posKey(x, y);
    const itemId = itemPositions.get(key);

    if (itemId === undefined) return null;

    if (collectedSet.has(itemId)) return null;

    const currentHits = (itemHits.get(itemId) ?? 0) + 1;
    itemHits.set(itemId, currentHits);

    const item = items[itemId];
    const itemFullyCollected = currentHits === item.part;

    if (itemFullyCollected) {
      collectedSet.add(itemId);
    }

    return { collected: true, itemId, itemFullyCollected };
  }

  /**
   * Set player's ships
   * @param ships - Array of player ships
   */
  public setPlayerShips(ships: GameShip[]): void {
    this.playerShips = ships;
    this.playerShipPositions.clear();
    this.playerShipSizes.clear();
    this.cacheShipPositions(
      ships,
      this.playerShipPositions,
      this.playerShipSizes,
    );
    this.notifyStateChange();
  }

  /**
   * Set enemy's ships
   * @param ships - Array of enemy ships
   */
  public setEnemyShips(ships: GameShip[]): void {
    this.enemyShips = ships;
    this.enemyShipPositions.clear();
    this.enemyShipSizes.clear();
    this.cacheShipPositions(
      ships,
      this.enemyShipPositions,
      this.enemyShipSizes,
    );
    this.notifyStateChange();
  }

  /**
   * Set items on the player's board (collectible by the enemy).
   * @param items - Array of player items
   */
  public setPlayerItems(items: GameItem[]): void {
    this.playerItems = items;
    this.playerItemPositions.clear();
    this.playerItemHits.clear();
    this.playerCollectedItems.clear();
    this.cacheItemPositions(items, this.playerItemPositions);
    this.notifyStateChange();
  }

  /**
   * Set items on the enemy's board (collectible by the player).
   * @param items - Array of enemy items
   */
  public setEnemyItems(items: GameItem[]): void {
    this.enemyItems = items;
    this.enemyItemPositions.clear();
    this.enemyItemHits.clear();
    this.enemyCollectedItems.clear();
    this.cacheItemPositions(items, this.enemyItemPositions);
    this.notifyStateChange();
  }

  /**
   * Set all player shots (useful for replay)
   * @param shots - Array of player shots
   */
  public setPlayerShots(shots: Shot[]): void {
    this.playerShotsMap.clear();
    this.playerShipHits.clear();
    shots.forEach((shot) => {
      this.playerShotsMap.set(posKey(shot.x, shot.y), shot);
      if (shot.hit && shot.shipId !== undefined) {
        const currentHits = this.playerShipHits.get(shot.shipId) || 0;
        this.playerShipHits.set(shot.shipId, currentHits + 1);
      }
    });
    this.shotCount = this.playerShotsMap.size + this.enemyShotsMap.size;
    this.notifyStateChange();
  }

  /**
   * Set all enemy shots (useful for replay)
   * @param shots - Array of enemy shots
   */
  public setEnemyShots(shots: Shot[]): void {
    this.enemyShotsMap.clear();
    this.enemyShipHits.clear();
    shots.forEach((shot) => {
      this.enemyShotsMap.set(posKey(shot.x, shot.y), shot);
      if (shot.hit && shot.shipId !== undefined) {
        const currentHits = this.enemyShipHits.get(shot.shipId) || 0;
        this.enemyShipHits.set(shot.shipId, currentHits + 1);
      }
    });
    this.shotCount = this.playerShotsMap.size + this.enemyShotsMap.size;
    this.notifyStateChange();
  }

  /**
   * Get complete current game state
   * @returns Full game state including ships, shots, items, and game status
   */
  public getState(): GameEngineState {
    return {
      currentTurn: this.currentTurn,
      isPlayerTurn: this.isPlayerTurn(),
      isEnemyTurn: this.isEnemyTurn(),
      playerShips: [...this.playerShips],
      enemyShips: [...this.enemyShips],
      playerShots: Array.from(this.playerShotsMap.values()),
      enemyShots: Array.from(this.enemyShotsMap.values()),
      isGameOver: this.isGameOver,
      winner: this.winner,
      boardWidth: this.boardWidth,
      boardHeight: this.boardHeight,
      shotCount: this.shotCount,
      areAllPlayerShipsDestroyed: this.areAllShipsDestroyed(true),
      areAllEnemyShipsDestroyed: this.areAllShipsDestroyed(false),
      playerItems: [...this.playerItems],
      enemyItems: [...this.enemyItems],
      playerCollectedItems: Array.from(this.playerCollectedItems),
      enemyCollectedItems: Array.from(this.enemyCollectedItems),
    };
  }

  /**
   * Get player's ships
   * @returns Copy of player ships array
   */
  public getPlayerShips(): GameShip[] {
    return [...this.playerShips];
  }

  /**
   * Get enemy's ships
   * @returns Copy of enemy ships array
   */
  public getEnemyShips(): GameShip[] {
    return [...this.enemyShips];
  }

  /**
   * Get player's shots
   * @returns Array of player shots
   */
  public getPlayerShots(): Shot[] {
    return Array.from(this.playerShotsMap.values());
  }

  /**
   * Get enemy's shots
   * @returns Array of enemy shots
   */
  public getEnemyShots(): Shot[] {
    return Array.from(this.enemyShotsMap.values());
  }

  /**
   * Get total shot count
   * @returns Total number of shots fired by both players
   */
  public getShotCount(): number {
    return this.shotCount;
  }

  /**
   * Get the winner (if game is over)
   * @returns Winner ('player', 'enemy', or null if not over)
   */
  public getWinner(): Winner {
    return this.winner;
  }

  /**
   * Get board dimensions
   * @returns Object with width and height of the board
   */
  public getBoardDimensions(): { width: number; height: number } {
    return { width: this.boardWidth, height: this.boardHeight };
  }

  /**
   * Check if a position is valid on the board
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns True if position is within board boundaries
   */
  public isValidPosition(x: number, y: number): boolean {
    return x >= 0 && x < this.boardWidth && y >= 0 && y < this.boardHeight;
  }

  /**
   * Get shot at specific coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShot - True to check player shots, false for enemy shots
   * @returns Shot object if found, undefined otherwise
   */
  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    const shotsMap = isPlayerShot ? this.playerShotsMap : this.enemyShotsMap;
    return shotsMap.get(posKey(x, y));
  }

  /**
   * Check if there's a ship at specific coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerShips - True to check player ships, false for enemy ships
   * @returns True if there's a ship at that position
   */
  public hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean {
    const positions = isPlayerShips
      ? this.playerShipPositions
      : this.enemyShipPositions;
    return positions.has(posKey(x, y));
  }

  /**
   * Notify state changes to observers
   * @private
   */
  private notifyStateChange(): void {
    this.onStateChange?.(this.getState());
  }

  /**
   * Get internal API for Match class
   * @internal - This API should only be used by the Match class
   * @returns Object with internal methods for turn and game state management
   */
  public getInternalAPI(): GameEngineInternalAPI {
    return {
      toggleTurn: () => this.toggleTurn(),
      setGameOver: (winner: Winner) => this.setGameOver(winner),
    };
  }
}

/**
 * Game engine state interface
 * Contains all game information at a point in time
 */
export interface GameEngineState {
  currentTurn: GameTurn;
  isPlayerTurn: boolean;
  isEnemyTurn: boolean;
  playerShips: GameShip[];
  enemyShips: GameShip[];
  playerShots: Shot[];
  enemyShots: Shot[];
  isGameOver: boolean;
  winner: Winner;
  boardWidth: number;
  boardHeight: number;
  shotCount: number;
  areAllPlayerShipsDestroyed: boolean;
  areAllEnemyShipsDestroyed: boolean;
  /** Items placed on the player's board (collectible by the enemy). */
  playerItems: GameItem[];
  /** Items placed on the enemy's board (collectible by the player). */
  enemyItems: GameItem[];
  /** Indices of player items that have been fully collected by the enemy. */
  playerCollectedItems: number[];
  /** Indices of enemy items that have been fully collected by the player. */
  enemyCollectedItems: number[];
}

/**
 * Shot result interface
 * Contains information about the outcome of a shot
 */
export interface ShotResult {
  success: boolean;
  error?: string;
  hit: boolean;
  shipId: number;
  shipDestroyed?: boolean;
  isGameOver?: boolean;
  winner?: Winner;
  /** True when this shot collected a part of an item. */
  collected?: boolean;
  /** The itemId of the collected item (when collected is true). */
  itemId?: number;
  /** True when the item is now fully collected. */
  itemFullyCollected?: boolean;
}

/**
 * Optional callbacks to observe engine changes
 * Useful for UI updates and event handling
 */
export interface GameEngineCallbacks {
  onStateChange?: (state: GameEngineState) => void;
  onTurnChange?: (turn: GameTurn) => void;
  onShot?: (shot: Shot, isPlayerShot: boolean) => void;
  onGameOver?: (winner: Winner) => void;
}

/**
 * Internal API for Match class
 * @internal - This interface should only be used by the Match class
 * Provides controlled access to engine internals for game flow management
 */
export interface GameEngineInternalAPI {
  /**
   * Toggle turn between player and enemy
   * @internal
   */
  toggleTurn: () => void;

  /**
   * Set the game as over with a winner
   * @internal
   * @param winner - The winner of the game
   */
  setGameOver: (winner: Winner) => void;
}
