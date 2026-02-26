import type {
  GameShip,
  GameItem,
  GameObstacle,
  Shot,
  Winner,
  GameTurn,
  ShotPattern,
  ShotPatternResult,
} from "./common";

/**
 * Read-only contract for consumers that only need to observe engine state.
 *
 * Use this type for callbacks, board projections, and UI queries — express
 * the minimum required capability (ISP). Anywhere write access is not needed,
 * prefer this over `IGameEngine`.
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
  getPlayerShotPatterns(): ShotPattern[];
  getEnemyShotPatterns(): ShotPattern[];
  getShotCount(): number;
  getWinner(): Winner;
  getBoardDimensions(): { width: number; height: number };
  isValidPosition(x: number, y: number): boolean;
  getShotAtPosition(x: number, y: number, isPlayerShot: boolean): Shot | undefined;
  hasShipAtPosition(x: number, y: number, isPlayerShips: boolean): boolean;
  hasObstacleAtPosition(x: number, y: number, isPlayerSide: boolean): boolean;
}

/**
 * Full read + write contract for the game engine compute layer.
 *
 * Program against this interface — not the concrete `GameEngine` class — so
 * alternative implementations (fog-of-war, deterministic replay, test doubles)
 * can be injected without touching call-sites.
 *
 * Extends `IGameEngineReader`; prefer the narrower interface wherever write
 * access is not required.
 */
export interface IGameEngine extends IGameEngineReader {
  initializeGame(
    playerShips: GameShip[],
    enemyShips: GameShip[],
    playerItems?: GameItem[],
    enemyItems?: GameItem[],
    playerObstacles?: GameObstacle[],
    enemyObstacles?: GameObstacle[],
    playerShotPatterns?: ShotPattern[],
    enemyShotPatterns?: ShotPattern[],
  ): void;
  resetGame(): void;
  setBoardDimensions(width: number, height: number): void;
  executeShotPattern(
    centerX: number,
    centerY: number,
    patternIdx: number,
    isPlayerShot: boolean,
  ): ShotPatternResult;
  setGameOver(winner: Winner): void;
  /** Replace all ships on the player's board and recompute positions. */
  setPlayerShips(ships: GameShip[]): void;
  /** Replace all ships on the enemy's board and recompute positions. */
  setEnemyShips(ships: GameShip[]): void;
  /** Replace items on the player's board (collectible by the enemy). */
  setPlayerItems(items: GameItem[]): void;
  /** Replace items on the enemy's board (collectible by the player). */
  setEnemyItems(items: GameItem[]): void;
  /**
   * Atomically replace all player shots and recompute enemy ship hit counts.
   * Used for replay and multiplayer shot synchronisation.
   */
  setPlayerShots(shots: Shot[]): void;
  /**
   * Atomically replace all enemy shots and recompute player ship hit counts.
   * Used for replay and multiplayer shot synchronisation.
   */
  setEnemyShots(shots: Shot[]): void;
  /** Replace obstacles on the player's board. */
  setPlayerObstacles(obstacles: GameObstacle[]): void;
  /** Replace obstacles on the enemy's board. */
  setEnemyObstacles(obstacles: GameObstacle[]): void;
  /** Replace the player's available shot patterns. */
  setPlayerShotPatterns(patterns: ShotPattern[]): void;
  /** Replace the enemy's available shot patterns. */
  setEnemyShotPatterns(patterns: ShotPattern[]): void;
  /** Mark a collected item as activated via `onUse` to prevent double-activation. */
  markItemUsed(itemId: number, isPlayerShot: boolean, shipId?: number): void;
}

/**
 * Immutable snapshot of the game engine at a given point in time.
 *
 * Returned by `GameEngine.getState()` after each mutation. All arrays are
 * shallow copies — mutating them has no effect on the engine's internal state.
 *
 * This interface is **turn-agnostic**: whose turn it is belongs to the
 * `matchMachine`. For a turn-aware snapshot see `MatchState` and `toMatchState`.
 */
export interface GameEngineState {
  /** Shallow copy of all ships on the player's board. */
  playerShips: GameShip[];
  /** Shallow copy of all ships on the enemy's board. */
  enemyShips: GameShip[];
  /** All shots fired by the player (targeting the enemy board), in registration order. */
  playerShots: Shot[];
  /** All shots fired by the enemy (targeting the player board), in registration order. */
  enemyShots: Shot[];
  /** `true` once the game has ended by any means. */
  isGameOver: boolean;
  /** `"player"` | `"enemy"` | `null` while the game is still in progress. */
  winner: Winner;
  /** Width of the game board in cells. */
  boardWidth: number;
  /** Height of the game board in cells. */
  boardHeight: number;
  /** Total number of shots fired by both sides combined. */
  shotCount: number;
  /** `true` when every ship on the player's board has been fully sunk. */
  areAllPlayerShipsDestroyed: boolean;
  /** `true` when every ship on the enemy's board has been fully sunk. */
  areAllEnemyShipsDestroyed: boolean;
  /** Items placed on the player's board, collectible by the enemy. */
  playerItems: GameItem[];
  /** Items placed on the enemy's board, collectible by the player. */
  enemyItems: GameItem[];
  /**
   * Indices (into `enemyItems`) of items the player has fully collected
   * from the enemy board. An item is fully collected once all of its `part`
   * cells have been hit.
   */
  playerCollectedItems: number[];
  /**
   * Indices (into `playerItems`) of items the enemy has fully collected
   * from the player board.
   */
  enemyCollectedItems: number[];
  /**
   * Items the player has activated via `onUse`, keyed by their 0-based index
   * in `enemyItems`. Each entry also records the optional target `shipId`.
   */
  playerUsedItems: { itemId: number; shipId?: number }[];
  /**
   * Items the enemy has activated via `onUse`, keyed by their 0-based index
   * in `playerItems`. Each entry also records the optional target `shipId`.
   */
  enemyUsedItems: { itemId: number; shipId?: number }[];
  /**
   * Obstacles on the player's board — permanent, indestructible terrain.
   * Shots landing on obstacle cells are recorded as misses.
   */
  playerObstacles: GameObstacle[];
  /**
   * Obstacles on the enemy's board — permanent, indestructible terrain.
   * Shots landing on obstacle cells are recorded as misses.
   */
  enemyObstacles: GameObstacle[];
  /** Shot patterns available to the player for the current match. */
  playerShotPatterns: ShotPattern[];
  /** Shot patterns available to the enemy for the current match. */
  enemyShotPatterns: ShotPattern[];
}

/**
 * Turn-aware snapshot of the match state, produced by the `Match` layer.
 *
 * Extends `GameEngineState` with `currentTurn`, `isPlayerTurn`, and
 * `isEnemyTurn` — fields owned by `matchMachine`, not by `GameEngine`.
 *
 * Construct via `toMatchState(engine.getState(), currentTurn)`.
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
 * Raw result from the internal shot-execution layer.
 *
 * Used exclusively inside `GameEngine`. External callers always receive a
 * `ShotPatternResult` from `executeShotPattern`, which aggregates one
 * `ShotResult` per pattern offset.
 */
export interface ShotResult {
  success: boolean;
  error?: string;
  hit: boolean;
  shipId: number;
  shipDestroyed?: boolean;
  isGameOver?: boolean;
  winner?: Winner;
  /** `true` when this shot collected a part of an item. */
  collected?: boolean;
  /** The itemId of the collected item (when `collected` is `true`). */
  itemId?: number;
  /** `true` when all parts of the item have now been collected. */
  itemFullyCollected?: boolean;
  /** `true` when this shot landed on an obstacle cell (recorded as a miss). */
  obstacleHit?: boolean;
  /** 0-based index of the obstacle that was hit (when `obstacleHit` is `true`). */
  obstacleId?: number;
}

/**
 * Perspective-aware view of a single game snapshot for one active side.
 *
 * "own" refers to the **active side** (shooter / activator).
 * "opponent" refers to the **other side**.
 *
 * This is the single extension point for new player↔enemy data pairs (OCP):
 * adding a new game resource only requires updating `SidePerspective` and
 * `resolvePerspective` — all other consumers remain unchanged.
 */
export interface SidePerspective {
  ownShips: GameShip[];
  opponentShips: GameShip[];
  ownItems: GameItem[];
  opponentItems: GameItem[];
  ownCollectedItems: number[];
  opponentCollectedItems: number[];
  ownShots: Shot[];
  opponentShots: Shot[];
  ownObstacles: GameObstacle[];
  opponentObstacles: GameObstacle[];

  setOwnShips: (ships: GameShip[]) => void;
  setOpponentShips: (ships: GameShip[]) => void;
  setOwnItems: (items: GameItem[]) => void;
  setOpponentItems: (items: GameItem[]) => void;
  setOwnShots: (shots: Shot[]) => void;
  setOpponentShots: (shots: Shot[]) => void;
  setOwnObstacles: (obstacles: GameObstacle[]) => void;
  setOpponentObstacles: (obstacles: GameObstacle[]) => void;
}
