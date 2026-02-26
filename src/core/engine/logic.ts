import { getShipCellsFromShip, getObstacleCellsFromObstacle } from "../tools/ship/calculations";
import { ShotError } from "./errors";
import type { GameShip, GameItem, GameObstacle, Shot, Winner, GameTurn, ShotPattern, ShotPatternResult } from "../types/common";
import type { GameConfig } from "../types/config";
import type { IGameEngine, GameEngineState, MatchState, ShotResult } from "../types/engine";

export type { IGameEngineReader, IGameEngine, GameEngineState, MatchState, ShotResult } from "../types/engine";

import { BOARD_DEFAULT_HEIGHT, BOARD_DEFAULT_WIDTH } from "../constants/views";
import { DEFAULT_SHOT_PATTERN } from "../constants";

type PositionKey = string;
const posKey = (x: number, y: number): PositionKey => `${x},${y}`;

interface SideState {
  ships: GameShip[];
  items: GameItem[];
  obstacles: GameObstacle[];
  shotPatterns: ShotPattern[];
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
    shotPatterns: [],
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

  private attackingSide(isPlayerShot: boolean): SideState {
    return isPlayerShot ? this.playerSide : this.enemySide;
  }

  private defendingSide(isPlayerShot: boolean): SideState {
    return isPlayerShot ? this.enemySide : this.playerSide;
  }

  private clearSide(side: SideState): void {
    side.ships = [];
    side.items = [];
    side.obstacles = [];
    side.shotPatterns = [];
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

  private clearState(): void {
    this.clearSide(this.playerSide);
    this.clearSide(this.enemySide);
    this.isGameOver = false;
    this.winner = null;
    this.shotCount = 0;
  }

  public initializeGame(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    playerItems: GameItem[] = [],
    enemyItems: GameItem[] = [],
    playerObstacles: GameObstacle[] = [],
    enemyObstacles: GameObstacle[] = [],
    playerShotPatterns: ShotPattern[] = [],
    enemyShotPatterns: ShotPattern[] = [],
  ): void {
    this.clearState();

    this.playerSide.ships = playerShips;
    this.enemySide.ships = enemyShips;
    this.playerSide.items = playerItems;
    this.enemySide.items = enemyItems;
    this.playerSide.obstacles = playerObstacles;
    this.enemySide.obstacles = enemyObstacles;
    this.playerSide.shotPatterns = playerShotPatterns.length > 0 ? playerShotPatterns : [DEFAULT_SHOT_PATTERN];
    this.enemySide.shotPatterns = enemyShotPatterns.length > 0 ? enemyShotPatterns : [DEFAULT_SHOT_PATTERN];

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

  public resetGame(): void {
    this.clearState();
    this.gameInitialized = false;
    this._version++;
  }

  public setBoardDimensions(width: number, height: number): void {
    this.boardWidth = width;
    this.boardHeight = height;
    this._version++;
  }

  private executeShot(
    x: number,
    y: number,
    isPlayerShot: boolean,
    patternInfo?: { patternId: number; centerX: number; centerY: number },
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

    const obstacleInfo = !result.hit
      ? this.checkObstacleHit(x, y, isPlayerShot)
      : null;

    const shot: Shot = {
      x,
      y,
      hit: result.hit,
      shipId: result.shipId >= 0 ? result.shipId : undefined,
      patternId: patternInfo?.patternId ?? 0,
      patternCenterX: patternInfo?.centerX ?? x,
      patternCenterY: patternInfo?.centerY ?? y,
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

  private checkObstacleHit(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): { obstacleId: number } | null {
    const obstaclePositions = this.defendingSide(isPlayerShot).obstaclePositions;
    const obstacleId = obstaclePositions.get(posKey(x, y));
    return obstacleId !== undefined ? { obstacleId } : null;
  }

  public executeShotPattern(
    centerX: number,
    centerY: number,
    patternIdx: number = 0,
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

    const attackingPatterns = this.attackingSide(isPlayerShot).shotPatterns;
    if (patternIdx < 0 || patternIdx >= attackingPatterns.length) {
      return {
        success: false,
        error: ShotError.PatternNotAvailable,
        shots: [],
        isGameOver: this.isGameOver,
        winner: this.winner,
      };
    }
    const pattern = attackingPatterns[patternIdx];
    const resolvedPatternId = patternIdx;

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
        { patternId: resolvedPatternId, centerX, centerY },
      );

      shots.push({
        x: targetX,
        y: targetY,
        hit: shotResult.hit,
        shipId: shotResult.shipId >= 0 ? shotResult.shipId : undefined,
        shipDestroyed: shotResult.shipDestroyed,
        executed: true,
        patternId: resolvedPatternId,
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

  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.attackingSide(isPlayerShot).shotsMap.has(posKey(x, y));
  }

  public isShipDestroyed(shipId: number, isPlayerShot: boolean): boolean {
    const side = this.defendingSide(isPlayerShot);
    if (shipId >= side.ships.length) return false;

    const hits = side.shipHits.get(shipId) || 0;
    const size = side.shipSizes.get(shipId);

    return size !== undefined && hits === size;
  }

  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    const side = isPlayerShips ? this.playerSide : this.enemySide;

    if (side.ships.length === 0) {
      return this.gameInitialized;
    }

    return side.ships.every((_, shipId) =>
      this.isShipDestroyed(shipId, !isPlayerShips),
    );
  }

  public setGameOver(winner: Winner): void {
    this.winner = winner;
    this.isGameOver = true;
    this._version++;
  }

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

  public setPlayerItems(items: GameItem[]): void {
    this.playerSide.items = items;
    this.playerSide.itemPositions.clear();
    this.playerSide.itemHits.clear();
    this.enemySide.collectedItems.clear();
    this.enemySide.usedItems.clear();
    this.cacheItemPositions(items, this.playerSide.itemPositions);
    this._version++;
  }

  public setEnemyItems(items: GameItem[]): void {
    this.enemySide.items = items;
    this.enemySide.itemPositions.clear();
    this.enemySide.itemHits.clear();
    this.playerSide.collectedItems.clear();
    this.playerSide.usedItems.clear();
    this.cacheItemPositions(items, this.enemySide.itemPositions);
    this._version++;
  }

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
      playerShotPatterns: [...this.playerSide.shotPatterns],
      enemyShotPatterns: [...this.enemySide.shotPatterns],
    };
  }

  public markItemUsed(itemId: number, isPlayerShot: boolean, shipId?: number): void {
    this.attackingSide(isPlayerShot).usedItems.set(itemId, shipId);
    this._version++;
  }

  public isItemUsed(itemId: number, isPlayerShot: boolean): boolean {
    return this.attackingSide(isPlayerShot).usedItems.has(itemId);
  }

  public getPlayerShips(): GameShip[] {
    return [...this.playerSide.ships];
  }

  public getEnemyShips(): GameShip[] {
    return [...this.enemySide.ships];
  }

  public getPlayerShots(): Shot[] {
    return Array.from(this.playerSide.shotsMap.values());
  }

  public getEnemyShots(): Shot[] {
    return Array.from(this.enemySide.shotsMap.values());
  }

  public getShotCount(): number {
    return this.shotCount;
  }

  public getWinner(): Winner {
    return this.winner;
  }

  public getBoardDimensions(): { width: number; height: number } {
    return { width: this.boardWidth, height: this.boardHeight };
  }

  public isValidPosition(x: number, y: number): boolean {
    return x >= 0 && x < this.boardWidth && y >= 0 && y < this.boardHeight;
  }

  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    return this.attackingSide(isPlayerShot).shotsMap.get(posKey(x, y));
  }

  public hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean {
    return (isPlayerShips ? this.playerSide : this.enemySide).shipPositions.has(posKey(x, y));
  }

  public hasObstacleAtPosition(
    x: number,
    y: number,
    isPlayerSide: boolean,
  ): boolean {
    return (isPlayerSide ? this.playerSide : this.enemySide).obstaclePositions.has(posKey(x, y));
  }

  public getPlayerObstacles(): GameObstacle[] {
    return [...this.playerSide.obstacles];
  }

  public getEnemyObstacles(): GameObstacle[] {
    return [...this.enemySide.obstacles];
  }

  public getPlayerShotPatterns(): ShotPattern[] {
    return [...this.playerSide.shotPatterns];
  }

  public getEnemyShotPatterns(): ShotPattern[] {
    return [...this.enemySide.shotPatterns];
  }

  public setPlayerShotPatterns(patterns: ShotPattern[]): void {
    this.playerSide.shotPatterns = patterns;
    this._version++;
  }

  public setEnemyShotPatterns(patterns: ShotPattern[]): void {
    this.enemySide.shotPatterns = patterns;
    this._version++;
  }

  public setPlayerObstacles(obstacles: GameObstacle[]): void {
    this.playerSide.obstacles = obstacles;
    this.playerSide.obstaclePositions.clear();
    this.cacheObstaclePositions(obstacles, this.playerSide.obstaclePositions);
    this._version++;
  }

  public setEnemyObstacles(obstacles: GameObstacle[]): void {
    this.enemySide.obstacles = obstacles;
    this.enemySide.obstaclePositions.clear();
    this.cacheObstaclePositions(obstacles, this.enemySide.obstaclePositions);
    this._version++;
  }
  
  public getVersion(): number {
    return this._version;
  }
}

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
