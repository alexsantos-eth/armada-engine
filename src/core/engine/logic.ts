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

  private playerItems: GameItem[];
  private enemyItems: GameItem[];
  private playerItemPositions: Map<PositionKey, number>;
  private enemyItemPositions: Map<PositionKey, number>;
  private playerItemHits: Map<number, number>;
  private enemyItemHits: Map<number, number>;
  private playerCollectedItems: Set<number>;
  private enemyCollectedItems: Set<number>;

  private usedByPlayer: Set<number>;
  private usedByEnemy: Set<number>;

  private gameInitialized: boolean;
  private _version: number = 0;

  constructor(config: Partial<GameConfig> = {}) {
    this.boardWidth = config.boardWidth ?? GAME_CONSTANTS.BOARD.DEFAULT_WIDTH;
    this.boardHeight =
      config.boardHeight ?? GAME_CONSTANTS.BOARD.DEFAULT_HEIGHT;
    this.playerShips = [];
    this.enemyShips = [];
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;
    this.gameInitialized = false;

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
    this.usedByPlayer = new Set();
    this.usedByEnemy = new Set();
  }

  /**
   * Initialize a new game with ships and items.
   * The starting turn is managed by the matchMachine, not the engine.
   * @param playerShips - Array of player's ships
   * @param enemyShips - Array of enemy's ships
   * @param playerItems - Items placed on the player's board (enemy can collect these)
   * @param enemyItems - Items placed on the enemy's board (player can collect these)
   */
  public initializeGame(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    playerItems: GameItem[] = [],
    enemyItems: GameItem[] = [],
  ): void {
    this.playerShips = playerShips;
    this.enemyShips = enemyShips;
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
    this.usedByPlayer.clear();
    this.usedByEnemy.clear();

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

    this.gameInitialized = true;
    this._version++;
  }

  /**
   * Reset the game to initial state
   */
  public resetGame(): void {
    this.playerShips = [];
    this.enemyShips = [];
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;
    this.gameInitialized = false;

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
    this.usedByPlayer.clear();
    this.usedByEnemy.clear();

    this._version++;
  }

  /**
   * Set board dimensions
   * @param width - Board width in cells
   * @param height - Board height in cells
   */
  public setBoardDimensions(width: number, height: number): void {
    this.boardWidth = width;
    this.boardHeight = height;
    this._version++;
  }



  /**
   * Execute a shot at target coordinates (internal use only)
   * @param x - X coordinate on board
   * @param y - Y coordinate on board
   * @param isPlayerShot - True if shot is from player, false if from enemy
   * @param patternInfo - Optional pattern information to store with the shot
   * @returns Result of the shot including hit status and game state
   * @private - Use executeShotPattern() instead
   */
  private executeShot(
    x: number,
    y: number,
    isPlayerShot: boolean,
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

    if (itemCollection?.itemFullyCollected && itemCollection.itemId !== undefined) {
      for (const s of shotsMap.values()) {
        if (s.collected && s.itemId === itemCollection.itemId) {
          s.itemFullyCollected = true;
        }
      }
    }

    if (result.hit && result.shipId >= 0) {
      const hitsMap = isPlayerShot ? this.enemyShipHits : this.playerShipHits;
      const currentHits = (hitsMap.get(result.shipId) || 0) + 1;
      hitsMap.set(result.shipId, currentHits);
    }

    this.shotCount++;

    const shipDestroyed =
      result.hit && result.shipId >= 0
        ? this.isShipDestroyed(result.shipId, isPlayerShot)
        : false;

    this._version++;

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
  private checkShot(
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
      return this.gameInitialized;
    }

    return ships.every((_, shipId) =>
      this.isShipDestroyed(shipId, !isPlayerShips),
    );
  }

  /**
   * Set the game as over with a winner
   * @param winner - The winner of the game ('player' or 'enemy')
   */
  public setGameOver(winner: Winner): void {
    this.winner = winner;
    this.isGameOver = true;
    this._version++;
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
      ? this.playerCollectedItems
      : this.enemyCollectedItems;

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
    this._version++;
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
    this._version++;
  }

  /**
   * Set items on the player's board (collectible by the enemy).
   * @param items - Array of player items
   */
  public setPlayerItems(items: GameItem[]): void {
    this.playerItems = items;
    this.playerItemPositions.clear();
    this.playerItemHits.clear();
    this.enemyCollectedItems.clear();
    this.usedByEnemy.clear();
    this.cacheItemPositions(items, this.playerItemPositions);
    this._version++;
  }

  /**
   * Set items on the enemy's board (collectible by the player).
   * @param items - Array of enemy items
   */
  public setEnemyItems(items: GameItem[]): void {
    this.enemyItems = items;
    this.enemyItemPositions.clear();
    this.enemyItemHits.clear();
    this.playerCollectedItems.clear();
    this.usedByPlayer.clear();
    this.cacheItemPositions(items, this.enemyItemPositions);
    this._version++;
  }

  /**
   * Set all player shots (useful for replay)
   * @param shots - Array of player shots
   */
  public setPlayerShots(shots: Shot[]): void {
    this.playerShotsMap.clear();
    this.enemyShipHits.clear();
    shots.forEach((shot) => {
      this.playerShotsMap.set(posKey(shot.x, shot.y), shot);
      if (shot.hit && shot.shipId !== undefined) {
        const currentHits = this.enemyShipHits.get(shot.shipId) || 0;
        this.enemyShipHits.set(shot.shipId, currentHits + 1);
      }
    });
    this.shotCount = this.playerShotsMap.size + this.enemyShotsMap.size;
    this._version++;
  }

  /**
   * Set all enemy shots (useful for replay)
   * @param shots - Array of enemy shots
   */
  public setEnemyShots(shots: Shot[]): void {
    this.enemyShotsMap.clear();
    this.playerShipHits.clear();
    shots.forEach((shot) => {
      this.enemyShotsMap.set(posKey(shot.x, shot.y), shot);
      if (shot.hit && shot.shipId !== undefined) {
        const currentHits = this.playerShipHits.get(shot.shipId) || 0;
        this.playerShipHits.set(shot.shipId, currentHits + 1);
      }
    });
    this.shotCount = this.playerShotsMap.size + this.enemyShotsMap.size;
    this._version++;
  }

  /**
   * Get the current engine state — ships, shots, items, dimensions, and game status.
   *
   * Turn information (`currentTurn`, `isPlayerTurn`, `isEnemyTurn`) is **not**
   * included here because the turn is owned by the `matchMachine`, not the
   * engine.  Callers that need a turn-aware snapshot should use
   * {@link toMatchState} to merge the engine state with the machine's turn.
   *
   * @returns Immutable snapshot of all engine data.
   */
  public getState(): GameEngineState {
    return {
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
      playerUsedItems: Array.from(this.usedByPlayer),
      enemyUsedItems: Array.from(this.usedByEnemy),
    };
  }

  /**
   * Mark a collected item as used (via onUse) to prevent double-activation.
   * @param itemId - The 0-based index in the side's items array.
   * @param isPlayerShot - true = player used an enemy item; false = enemy used a player item.
   */
  public markItemUsed(itemId: number, isPlayerShot: boolean): void {
    if (isPlayerShot) {
      this.usedByPlayer.add(itemId);
    } else {
      this.usedByEnemy.add(itemId);
    }
    this._version++;
  }

  /**
   * Returns true if the item has already been activated via onUse.
   */
  public isItemUsed(itemId: number, isPlayerShot: boolean): boolean {
    return isPlayerShot
      ? this.usedByPlayer.has(itemId)
      : this.usedByEnemy.has(itemId);
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
   * Returns the current mutation counter. Increments on every write, so callers
   * can cheaply detect whether the engine state has changed.
   */
  public getVersion(): number {
    return this._version;
  }
}

/**
 * Immutable snapshot of the game engine at a given point in time.
 *
 * Returned by {@link GameEngine.getState} after each mutation. All arrays are
 * shallow copies — mutating them has no effect on internal engine state.
 *
 * This interface is **turn-agnostic**: whose turn it is belongs to the
 * `matchMachine`, not to the engine. To get a turn-aware snapshot see
 * {@link MatchState} and {@link toMatchState}.
 *
 * @example
 * const state = engine.getState();
 * if (state.isGameOver) {
 *   console.log("Winner:", state.winner);
 * }
 */
export interface GameEngineState {
  /** Shallow copy of all ships on the **player's** board. */
  playerShips: GameShip[];

  /** Shallow copy of all ships on the **enemy's** board. */
  enemyShips: GameShip[];

  /**
   * All shots fired **by the player** (i.e. targeting the enemy board),
   * in the order they were registered.
   */
  playerShots: Shot[];

  /**
   * All shots fired **by the enemy** (i.e. targeting the player board),
   * in the order they were registered.
   */
  enemyShots: Shot[];

  /** `true` once the game has ended (by any means). */
  isGameOver: boolean;

  /**
   * The winner of the game once it is over.
   * `"player"` | `"enemy"` | `null` while the game is still in progress.
   */
  winner: Winner;

  /** Width of the game board in cells. */
  boardWidth: number;

  /** Height of the game board in cells. */
  boardHeight: number;

  /** Total number of shots fired by both sides combined. */
  shotCount: number;

  /**
   * `true` when every ship on the **player's** board has been fully sunk
   * (i.e. the enemy has won on ships alone).
   */
  areAllPlayerShipsDestroyed: boolean;

  /**
   * `true` when every ship on the **enemy's** board has been fully sunk
   * (i.e. the player has won on ships alone).
   */
  areAllEnemyShipsDestroyed: boolean;

  /**
   * Items placed on the **player's** board.
   * These are collectible by the enemy when they shoot the corresponding cells.
   */
  playerItems: GameItem[];

  /**
   * Items placed on the **enemy's** board.
   * These are collectible by the player when they shoot the corresponding cells.
   */
  enemyItems: GameItem[];

  /**
   * Indices (into `enemyItems`) of items the **player** has fully collected
   * from the enemy board. An item is fully collected once all of its `part`
   * cells have been hit.
   */
  playerCollectedItems: number[];

  /**
   * Indices (into `playerItems`) of items the **enemy** has fully collected
   * from the player board. An item is fully collected once all of its `part`
   * cells have been hit.
   */
  enemyCollectedItems: number[];

  /**
   * Indices (into `enemyItems`) of player-collected items that the player has
   * already activated via `onUse`. Used to prevent double-activation of the
   * same item powerup.
   */
  playerUsedItems: number[];

  /**
   * Indices (into `playerItems`) of enemy-collected items that the enemy has
   * already activated via `onUse`. Used to prevent double-activation of the
   * same item powerup.
   */
  enemyUsedItems: number[];
}

/**
 * Turn-aware snapshot of the match state, produced by the {@link Match} layer.
 *
 * Extends {@link GameEngineState} with `currentTurn`, `isPlayerTurn` and
 * `isEnemyTurn` which are owned by `matchMachine` — not by `GameEngine`.
 *
 * Use {@link toMatchState} to construct one from an engine snapshot plus the
 * machine's current turn.
 */
export interface MatchState extends GameEngineState {
  /** Whose turn it is right now (`"PLAYER_TURN"` or `"ENEMY_TURN"`). */
  currentTurn: GameTurn;
  /** Convenience flag — `true` when `currentTurn === "PLAYER_TURN"`. */
  isPlayerTurn: boolean;
  /** Convenience flag — `true` when `currentTurn === "ENEMY_TURN"`. */
  isEnemyTurn: boolean;
}

/**
 * Merges a pure engine snapshot with the machine's current turn to produce a
 * {@link MatchState}.
 *
 * Call this in any place that must bridge the engine layer (turn-agnostic) and
 * the match layer (turn-aware): machine actions, `Match.getState()`,
 * `onStateChange` callbacks, etc.
 *
 * @example
 * const matchState = toMatchState(engine.getState(), context.currentTurn);
 */
export function toMatchState(
  state: GameEngineState,
  currentTurn: GameTurn,
): MatchState {
  return {
    ...state,
    currentTurn,
    isPlayerTurn: currentTurn === "PLAYER_TURN",
    isEnemyTurn: currentTurn === "ENEMY_TURN",
  };
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


