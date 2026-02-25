import { getShipCellsFromShip, getObstacleCellsFromObstacle } from "../tools/ship/calculations";
import { ShotError } from "./errors";
import type {
  GameShip,
  GameItem,
  GameObstacle,
  Shot,
  Winner,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
} from "../types/common";
import type { GameConfig } from "../types/config";
import { BOARD_DEFAULT_HEIGHT, BOARD_DEFAULT_WIDTH } from "../constants/views";

type PositionKey = string;
const posKey = (x: number, y: number): PositionKey => `${x},${y}`;

interface SideState {
  ships: GameShip[];
  items: GameItem[];
  obstacles: GameObstacle[];
  shotsMap: Map<PositionKey, Shot>;
  shipPositions: Map<PositionKey, number>;
  shipSizes: Map<number, number>;
  shipHits: Map<number, number>;
  itemPositions: Map<PositionKey, number>;
  itemHits: Map<number, number>;
  obstaclePositions: Map<PositionKey, number>;
  collectedItems: Set<number>;
  usedItems: Map<number, number | undefined>;
}

function createSideState(): SideState {
  return {
    ships: [],
    items: [],
    obstacles: [],
    shotsMap: new Map(),
    shipPositions: new Map(),
    shipSizes: new Map(),
    shipHits: new Map(),
    itemPositions: new Map(),
    itemHits: new Map(),
    obstaclePositions: new Map(),
    collectedItems: new Set(),
    usedItems: new Map(),
  };
}

/**
 * Read-only contract for the game engine.
 *
 * Use this type for consumers that only need to observe state — callbacks,
 * board projections, UI queries — without holding write access.
 * Satisfies ISP: callers declare exactly the capability they need.
 */
export interface IGameEngineReader {
  getState(): GameEngineState;
  getVersion(): number;
  isCellShot(x: number, y: number, isPlayerShot: boolean): boolean;
  isShipDestroyed(shipId: number, isPlayerShot: boolean): boolean;
  areAllShipsDestroyed(isPlayerShips: boolean): boolean;
  isItemUsed(itemId: number, isPlayerShot: boolean): boolean;
  getPlayerShips(): GameShip[];
  getEnemyShips(): GameShip[];
  getPlayerShots(): Shot[];
  getEnemyShots(): Shot[];
  getPlayerObstacles(): GameObstacle[];
  getEnemyObstacles(): GameObstacle[];
  getShotCount(): number;
  getWinner(): Winner;
  getBoardDimensions(): { width: number; height: number };
  isValidPosition(x: number, y: number): boolean;
  getShotAtPosition(x: number, y: number, isPlayerShot: boolean): Shot | undefined;
  hasShipAtPosition(x: number, y: number, isPlayerShips: boolean): boolean;
  hasObstacleAtPosition(x: number, y: number, isPlayerSide: boolean): boolean;
}

/**
 * Full contract for the game engine compute layer (read + mutate).
 *
 * Program against this interface instead of the concrete `GameEngine` class
 * so that alternative implementations (fog-of-war, deterministic replay,
 * test doubles, etc.) can be injected without touching call-sites.
 *
 * Extends {@link IGameEngineReader} — anywhere a read-only view suffices,
 * prefer `IGameEngineReader` to express that intent explicitly (ISP).
 */
export interface IGameEngine extends IGameEngineReader {
  initializeGame(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    playerItems?: GameItem[],
    enemyItems?: GameItem[],
    playerObstacles?: GameObstacle[],
    enemyObstacles?: GameObstacle[],
  ): void;
  resetGame(): void;
  setBoardDimensions(width: number, height: number): void;
  executeShotPattern(
    centerX: number,
    centerY: number,
    pattern: ShotPattern,
    isPlayerShot: boolean,
  ): ShotPatternResult;
  setGameOver(winner: Winner): void;
  setPlayerShips(ships: GameShip[]): void;
  setEnemyShips(ships: GameShip[]): void;
  setPlayerItems(items: GameItem[]): void;
  setEnemyItems(items: GameItem[]): void;
  setPlayerShots(shots: Shot[]): void;
  setEnemyShots(shots: Shot[]): void;
  setPlayerObstacles(obstacles: GameObstacle[]): void;
  setEnemyObstacles(obstacles: GameObstacle[]): void;
  markItemUsed(itemId: number, isPlayerShot: boolean, shipId?: number): void;
}

export class GameEngine implements IGameEngine {
  private playerSide: SideState;
  private enemySide: SideState;
  private isGameOver: boolean;
  private winner: Winner;
  private boardWidth: number;
  private boardHeight: number;
  private shotCount: number;
  private gameInitialized: boolean;
  private _version: number = 0;

  constructor(config: Partial<GameConfig> = {}) {
    this.boardWidth = config.boardView?.width ?? BOARD_DEFAULT_WIDTH;
    this.boardHeight = config.boardView?.height ?? BOARD_DEFAULT_HEIGHT;
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;
    this.gameInitialized = false;
    this.playerSide = createSideState();
    this.enemySide = createSideState();
  }

  /** Returns the state object for the attacking side (the shooter). */
  private attackingSide(isPlayerShot: boolean): SideState {
    return isPlayerShot ? this.playerSide : this.enemySide;
  }

  /** Returns the state object for the defending side (receives the shot). */
  private defendingSide(isPlayerShot: boolean): SideState {
    return isPlayerShot ? this.enemySide : this.playerSide;
  }

  /** Clears all mutable collections and arrays on a side, ready for a new game. */
  private clearSide(side: SideState): void {
    side.ships = [];
    side.items = [];
    side.obstacles = [];
    side.shotsMap.clear();
    side.shipPositions.clear();
    side.shipSizes.clear();
    side.shipHits.clear();
    side.itemPositions.clear();
    side.itemHits.clear();
    side.obstaclePositions.clear();
    side.collectedItems.clear();
    side.usedItems.clear();
  }

  /** Clears both sides and all shared scalars — single source of truth for a clean slate. */
  private clearState(): void {
    this.clearSide(this.playerSide);
    this.clearSide(this.enemySide);
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;
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
    playerObstacles: GameObstacle[] = [],
    enemyObstacles: GameObstacle[] = [],
  ): void {
    this.clearState();

    this.playerSide.ships = playerShips;
    this.enemySide.ships = enemyShips;
    this.playerSide.items = playerItems;
    this.enemySide.items = enemyItems;
    this.playerSide.obstacles = playerObstacles;
    this.enemySide.obstacles = enemyObstacles;

    this.cacheShipPositions(
      playerShips,
      this.playerSide.shipPositions,
      this.playerSide.shipSizes,
    );
    this.cacheShipPositions(
      enemyShips,
      this.enemySide.shipPositions,
      this.enemySide.shipSizes,
    );

    this.cacheItemPositions(playerItems, this.playerSide.itemPositions);
    this.cacheItemPositions(enemyItems, this.enemySide.itemPositions);

    this.cacheObstaclePositions(playerObstacles, this.playerSide.obstaclePositions);
    this.cacheObstaclePositions(enemyObstacles, this.enemySide.obstaclePositions);

    this.gameInitialized = true;
    this._version++;
  }

  /**
   * Reset the game to initial state
   */
  public resetGame(): void {
    this.clearState();
    this.gameInitialized = false;
    this._version++;
  }

  /**
   * Update the board dimensions.
   *
   * Does **not** re-initialize ship/item positions — call `initializeGame`
   * afterwards to apply the new bounds consistently.
   *
   * @param width  - Board width in cells.
   * @param height - Board height in cells.
   */
  public setBoardDimensions(width: number, height: number): void {
    this.boardWidth = width;
    this.boardHeight = height;
    this._version++;
  }

  /**
   * Execute a shot at a single target cell.
   *
   * Internal implementation detail — always call {@link executeShotPattern}
   * from outside this class; it handles pattern expansion, out-of-bounds
   * offsets, and already-shot cells before delegating here.
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

    // Check if the shot landed on an obstacle (only relevant when it's a miss).
    const obstacleInfo = !result.hit
      ? this.checkObstacleHit(x, y, isPlayerShot)
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
      ...(obstacleInfo && {
        obstacleHit: true,
        obstacleId: obstacleInfo.obstacleId,
      }),
    };

    const key = posKey(x, y);
    const attackingSide = this.attackingSide(isPlayerShot);
    attackingSide.shotsMap.set(key, shot);

    if (itemCollection?.itemFullyCollected && itemCollection.itemId !== undefined) {
      for (const s of attackingSide.shotsMap.values()) {
        if (s.collected && s.itemId === itemCollection.itemId) {
          s.itemFullyCollected = true;
        }
      }
    }

    if (result.hit && result.shipId >= 0) {
      const defendingSide = this.defendingSide(isPlayerShot);
      const currentHits = (defendingSide.shipHits.get(result.shipId) || 0) + 1;
      defendingSide.shipHits.set(result.shipId, currentHits);
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
      obstacleHit: obstacleInfo?.obstacleId !== undefined ? true : undefined,
      obstacleId: obstacleInfo?.obstacleId,
    };
  }

  /**
   * Check if a shot at `(x, y)` lands on an obstacle on the defending side.
   * Returns the obstacleId when hit, or null when no obstacle is present.
   * @private
   */
  private checkObstacleHit(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): { obstacleId: number } | null {
    const obstaclePositions = this.defendingSide(isPlayerShot).obstaclePositions;
    const obstacleId = obstaclePositions.get(posKey(x, y));
    return obstacleId !== undefined ? { obstacleId } : null;
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
        obstacleHit: shotResult.obstacleHit,
        obstacleId: shotResult.obstacleId,
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
   * Check if a shot at `(x, y)` hits a ship on the target board.
   * When `isPlayerShot` is `true`, the player is firing so we check the
   * enemy's ship positions; when `false`, the enemy is firing so we check
   * the player's positions.
   */
  private checkShot(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): { hit: boolean; shipId: number } {
    const shipPositions = this.defendingSide(isPlayerShot).shipPositions;
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
    return this.attackingSide(isPlayerShot).shotsMap.has(posKey(x, y));
  }

  /**
   * Check if a ship is completely destroyed
   * @param shipId - ID of the ship to check
   * @param isPlayerShot - True if checking enemy ship, false for player ship
   * @returns True if all ship cells have been hit
   */
  public isShipDestroyed(shipId: number, isPlayerShot: boolean): boolean {
    const side = this.defendingSide(isPlayerShot);
    if (shipId >= side.ships.length) return false;

    const hits = side.shipHits.get(shipId) || 0;
    const size = side.shipSizes.get(shipId);

    return size !== undefined && hits === size;
  }

  /**
   * Check if all ships of a player are destroyed
   * @param isPlayerShips - True to check player ships, false for enemy ships
   * @returns True if all ships are destroyed
   */
  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    const side = isPlayerShips ? this.playerSide : this.enemySide;

    if (side.ships.length === 0) {
      return this.gameInitialized;
    }

    return side.ships.every((_, shipId) =>
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
      let ownedCells = 0;

      cells.forEach(([x, y]) => {
        const key = posKey(x, y);
        if (!positionsMap.has(key)) {
          positionsMap.set(key, shipId);
          ownedCells++;
        }
      });

      sizesMap.set(shipId, ownedCells);
    });
  }

  /**
   * Cache obstacle positions for O(1) lookup.
   * @private
   */
  private cacheObstaclePositions(
    obstacles: GameObstacle[],
    positionsMap: Map<PositionKey, number>,
  ): void {
    obstacles.forEach((obstacle, obstacleId) => {
      const cells = getObstacleCellsFromObstacle(obstacle);
      cells.forEach(([x, y]) => {
        positionsMap.set(posKey(x, y), obstacleId);
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
    const defendingSide = this.defendingSide(isPlayerShot);
    const attackingSide = this.attackingSide(isPlayerShot);
    const itemPositions = defendingSide.itemPositions;
    const items = defendingSide.items;
    const itemHits = defendingSide.itemHits;
    const collectedSet = attackingSide.collectedItems;

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
    this.playerSide.ships = ships;
    this.playerSide.shipPositions.clear();
    this.playerSide.shipSizes.clear();
    this.cacheShipPositions(
      ships,
      this.playerSide.shipPositions,
      this.playerSide.shipSizes,
    );

    this.playerSide.shipHits.clear();
    for (const [key, shipId] of this.playerSide.shipPositions) {
      const shot = this.enemySide.shotsMap.get(key);
      if (shot) {
        if (!shot.hit) {
          shot.hit = true;
          shot.shipId = shipId;
        } else if (shot.shipId !== shipId) {
          shot.shipId = shipId;
        }
        this.playerSide.shipHits.set(shipId, (this.playerSide.shipHits.get(shipId) ?? 0) + 1);
      }
    }
    this._version++;
  }

  /**
   * Set enemy's ships
   * @param ships - Array of enemy ships
   */
  public setEnemyShips(ships: GameShip[]): void {
    this.enemySide.ships = ships;
    this.enemySide.shipPositions.clear();
    this.enemySide.shipSizes.clear();
    this.cacheShipPositions(
      ships,
      this.enemySide.shipPositions,
      this.enemySide.shipSizes,
    );

    this.enemySide.shipHits.clear();
    for (const [key, shipId] of this.enemySide.shipPositions) {
      const shot = this.playerSide.shotsMap.get(key);
      if (shot) {
        if (!shot.hit) {
          shot.hit = true;
          shot.shipId = shipId;
        } else if (shot.shipId !== shipId) {
          shot.shipId = shipId;
        }
        this.enemySide.shipHits.set(shipId, (this.enemySide.shipHits.get(shipId) ?? 0) + 1);
      }
    }
    this._version++;
  }

  /**
   * Set items on the player's board (collectible by the enemy).
   * @param items - Array of player items
   */
  public setPlayerItems(items: GameItem[]): void {
    this.playerSide.items = items;
    this.playerSide.itemPositions.clear();
    this.playerSide.itemHits.clear();
    this.enemySide.collectedItems.clear();
    this.enemySide.usedItems.clear();
    this.cacheItemPositions(items, this.playerSide.itemPositions);
    this._version++;
  }

  /**
   * Set items on the enemy's board (collectible by the player).
   * @param items - Array of enemy items
   */
  public setEnemyItems(items: GameItem[]): void {
    this.enemySide.items = items;
    this.enemySide.itemPositions.clear();
    this.enemySide.itemHits.clear();
    this.playerSide.collectedItems.clear();
    this.playerSide.usedItems.clear();
    this.cacheItemPositions(items, this.enemySide.itemPositions);
    this._version++;
  }

  /**
   * Atomically replace all player shots and recompute enemy ship hit counts.
   * Used for replay and multiplayer shot synchronisation.
   */
  public setPlayerShots(shots: Shot[]): void {
    this.playerSide.shotsMap.clear();
    this.enemySide.shipHits.clear();
    shots.forEach((shot) => {
      this.playerSide.shotsMap.set(posKey(shot.x, shot.y), shot);
      if (shot.hit && shot.shipId !== undefined) {
        const currentHits = this.enemySide.shipHits.get(shot.shipId) || 0;
        this.enemySide.shipHits.set(shot.shipId, currentHits + 1);
      }
    });
    this.shotCount = this.playerSide.shotsMap.size + this.enemySide.shotsMap.size;
    this._version++;
  }

  /**
   * Atomically replace all enemy shots and recompute player ship hit counts.
   * Used for replay and multiplayer shot synchronisation.
   */
  public setEnemyShots(shots: Shot[]): void {
    this.enemySide.shotsMap.clear();
    this.playerSide.shipHits.clear();
    shots.forEach((shot) => {
      this.enemySide.shotsMap.set(posKey(shot.x, shot.y), shot);
      if (shot.hit && shot.shipId !== undefined) {
        const currentHits = this.playerSide.shipHits.get(shot.shipId) || 0;
        this.playerSide.shipHits.set(shot.shipId, currentHits + 1);
      }
    });
    this.shotCount = this.playerSide.shotsMap.size + this.enemySide.shotsMap.size;
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
      playerShips: [...this.playerSide.ships],
      enemyShips: [...this.enemySide.ships],
      playerShots: Array.from(this.playerSide.shotsMap.values()),
      enemyShots: Array.from(this.enemySide.shotsMap.values()),
      isGameOver: this.isGameOver,
      winner: this.winner,
      boardWidth: this.boardWidth,
      boardHeight: this.boardHeight,
      shotCount: this.shotCount,
      areAllPlayerShipsDestroyed: this.areAllShipsDestroyed(true),
      areAllEnemyShipsDestroyed: this.areAllShipsDestroyed(false),
      playerItems: [...this.playerSide.items],
      enemyItems: [...this.enemySide.items],
      playerCollectedItems: Array.from(this.playerSide.collectedItems),
      enemyCollectedItems: Array.from(this.enemySide.collectedItems),
      playerUsedItems: Array.from(this.playerSide.usedItems.entries()).map(([itemId, shipId]) => ({ itemId, shipId })),
      enemyUsedItems: Array.from(this.enemySide.usedItems.entries()).map(([itemId, shipId]) => ({ itemId, shipId })),
      playerObstacles: [...this.playerSide.obstacles],
      enemyObstacles: [...this.enemySide.obstacles],
    };
  }

  /**
   * Mark a collected item as used (via onUse) to prevent double-activation.
   * @param itemId - The 0-based index in the side's items array.
   * @param isPlayerShot - true = player used an enemy item; false = enemy used a player item.
   */
  public markItemUsed(itemId: number, isPlayerShot: boolean, shipId?: number): void {
    this.attackingSide(isPlayerShot).usedItems.set(itemId, shipId);
    this._version++;
  }

  /**
   * Returns true if the item has already been activated via onUse.
   */
  public isItemUsed(itemId: number, isPlayerShot: boolean): boolean {
    return this.attackingSide(isPlayerShot).usedItems.has(itemId);
  }

  /**
   * Get player's ships
   * @returns Copy of player ships array
   */
  public getPlayerShips(): GameShip[] {
    return [...this.playerSide.ships];
  }

  /**
   * Get enemy's ships
   * @returns Copy of enemy ships array
   */
  public getEnemyShips(): GameShip[] {
    return [...this.enemySide.ships];
  }

  /**
   * Get player's shots
   * @returns Array of player shots
   */
  public getPlayerShots(): Shot[] {
    return Array.from(this.playerSide.shotsMap.values());
  }

  /**
   * Get enemy's shots
   * @returns Array of enemy shots
   */
  public getEnemyShots(): Shot[] {
    return Array.from(this.enemySide.shotsMap.values());
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
    return this.attackingSide(isPlayerShot).shotsMap.get(posKey(x, y));
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
    return (isPlayerShips ? this.playerSide : this.enemySide).shipPositions.has(posKey(x, y));
  }

  /**
   * Check if there's an obstacle at specific coordinates.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param isPlayerSide - True to check player board obstacles, false for enemy board
   * @returns True if there's an obstacle at that position
   */
  public hasObstacleAtPosition(
    x: number,
    y: number,
    isPlayerSide: boolean,
  ): boolean {
    return (isPlayerSide ? this.playerSide : this.enemySide).obstaclePositions.has(posKey(x, y));
  }

  /**
   * Get player's obstacles
   * @returns Copy of player obstacles array
   */
  public getPlayerObstacles(): GameObstacle[] {
    return [...this.playerSide.obstacles];
  }

  /**
   * Get enemy's obstacles
   * @returns Copy of enemy obstacles array
   */
  public getEnemyObstacles(): GameObstacle[] {
    return [...this.enemySide.obstacles];
  }

  /**
   * Set player's obstacles (replaces all obstacle positions on the player board).
   */
  public setPlayerObstacles(obstacles: GameObstacle[]): void {
    this.playerSide.obstacles = obstacles;
    this.playerSide.obstaclePositions.clear();
    this.cacheObstaclePositions(obstacles, this.playerSide.obstaclePositions);
    this._version++;
  }

  /**
   * Set enemy's obstacles (replaces all obstacle positions on the enemy board).
   */
  public setEnemyObstacles(obstacles: GameObstacle[]): void {
    this.enemySide.obstacles = obstacles;
    this.enemySide.obstaclePositions.clear();
    this.cacheObstaclePositions(obstacles, this.enemySide.obstaclePositions);
    this._version++;
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
   * Items the player has already activated via `onUse`, keyed by their 0-based
   * index in `enemyItems`. Each entry also records the optional `shipId` of the
   * ship the item was targeted at when activated.
   */
  playerUsedItems: { itemId: number; shipId?: number }[];

  /**
   * Items the enemy has already activated via `onUse`, keyed by their 0-based
   * index in `playerItems`. Each entry also records the optional `shipId` of the
   * ship the item was targeted at when activated.
   */
  enemyUsedItems: { itemId: number; shipId?: number }[];

  /**
   * Obstacles placed on the **player's** board.
   * These are permanent, indestructible terrain features — shots that land
   * on obstacle cells are recorded as misses but the obstacle persists.
   */
  playerObstacles: GameObstacle[];

  /**
   * Obstacles placed on the **enemy's** board.
   * These are permanent, indestructible terrain features — shots that land
   * on obstacle cells are recorded as misses but the obstacle persists.
   */
  enemyObstacles: GameObstacle[];
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
 * Raw result returned by the internal `executeShot` method.
 *
 * Used exclusively inside `GameEngine` — external callers always receive a
 * {@link ShotPatternResult} from `executeShotPattern`, which aggregates one
 * `ShotResult` per offset in the pattern.
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
  /** True when this shot landed on an obstacle cell (recorded as a miss but distinct from plain water). */
  obstacleHit?: boolean;
  /** The 0-based index of the obstacle that was hit (when obstacleHit is true). */
  obstacleId?: number;
}


