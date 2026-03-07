import type { GameTurn, Winner } from "./game";
import type { Shot, ShotPattern, ShotPatternResult } from "./shots";
import type { GameShip, GameItem, GameObstacle } from "./entities";
import type { GameMode } from "./modes";

/**
 * String key used to address a single board cell in the engine's internal
 * position maps. Encoding as `"x,y"` makes O(1) `Map` lookups possible
 * without requiring a 2-D array.
 *
 * @example
 * const key: PositionKey = `${x},${y}`;
 */
export type PositionKey = string;

/**
 * Internal mutable state bucket owned by `GameEngine` for one side of the
 * match (player or enemy). Grouping both arrays and pre-computed `Map` lookups
 * here keeps O(1) access uniform across all game queries without exposing the
 * structure to external consumers.
 *
 * @remarks
 * This interface is intentionally not part of the public API surface. External
 * code should read state through `IGameEngineReader` and write through
 * `IGameEngine`.
 */
export interface SideState {
  /** Ship instances placed on this side's board. */
  ships: GameShip[];
  /** Collectible items placed on this side's board. */
  items: GameItem[];
  /** Indestructible obstacles placed on this side's board. */
  obstacles: GameObstacle[];
  /** Shot patterns available to the attacker on this side. */
  shotPatterns: ShotPattern[];
  /** O(1) lookup from a `PositionKey` to the `Shot` record filed at that cell. */
  shotsMap: Map<PositionKey, Shot>;
  /** O(1) lookup from a `PositionKey` to the `shipId` of the ship occupying that cell. */
  shipPositions: Map<PositionKey, number>;
  /** Total cell count per ship — maps `shipId` → number of cells in the ship's footprint. */
  shipSizes: Map<number, number>;
  /** Running hit tally per ship — maps `shipId` → number of cells already struck. */
  shipHits: Map<number, number>;
  /** O(1) lookup from a `PositionKey` to the `itemId` of the item part occupying that cell. */
  itemPositions: Map<PositionKey, number>;
  /** Running collection tally per item — maps `itemId` → number of parts already shot. */
  itemHits: Map<number, number>;
  /** O(1) lookup from a `PositionKey` to the `obstacleId` of the obstacle occupying that cell. */
  obstaclePositions: Map<PositionKey, number>;
  /** Set of `itemId` values whose every part-cell has been collected. */
  collectedItems: Set<number>;
  /** Maps `itemId` to the optional target `shipId` supplied when the item was activated. */
  usedItems: Map<number, number | undefined>;
}

/**
 * Read-only contract for consumers that need to observe but not mutate engine
 * state. Following the Interface Segregation Principle, prefer this narrower
 * type for callbacks, board projections, and UI queries over the broader
 * `IGameEngine` whenever mutation is not required.
 */
export interface IGameEngineReader {
  /**
   * Returns an immutable snapshot of the current game state.
   * All arrays are shallow copies — mutations have no effect on internal state.
   */
  getState(): GameEngineState;
  /**
   * Monotonically increasing counter incremented on every engine mutation.
   * Consumers can compare cached versions against this value to decide whether
   * a derived structure (board rendering, AI state) needs to be recomputed.
   */
  getVersion(): number;
  /** `true` if the cell at `(x, y)` has already been fired upon from the given perspective. */
  isCellShot(x: number, y: number, isPlayerShot: boolean): boolean;
  /** `true` if every cell of the given ship has been struck. */
  isShipDestroyed(shipId: number, isPlayerShot: boolean): boolean;
  /** `true` if every ship on the specified board has been fully sunk. */
  areAllShipsDestroyed(isPlayerShips: boolean): boolean;
  /** `true` if the item's `onUse` handler has been activated at least once. */
  isItemUsed(itemId: number, isPlayerShot: boolean): boolean;
  /** Shallow copy of all ships placed on the player's board. */
  getPlayerShips(): readonly GameShip[];
  /** Shallow copy of all ships placed on the enemy's board. */
  getEnemyShips(): readonly GameShip[];
  /** Ordered list of shots fired by the player (targeting the enemy board). */
  getPlayerShots(): readonly Shot[];
  /** Ordered list of shots fired by the enemy (targeting the player board). */
  getEnemyShots(): readonly Shot[];
  /** Obstacles placed on the player's board. */
  getPlayerObstacles(): readonly GameObstacle[];
  /** Obstacles placed on the enemy's board. */
  getEnemyObstacles(): readonly GameObstacle[];
  /** Shot patterns available to the player for the current match. */
  getPlayerShotPatterns(): readonly ShotPattern[];
  /** Shot patterns available to the enemy for the current match. */
  getEnemyShotPatterns(): readonly ShotPattern[];
  /** Total number of shots fired by both sides combined. */
  getShotCount(): number;
  /** Current match winner; `null` while the game is still in progress. */
  getWinner(): Winner;
  /** Current board width and height in cells. */
  getBoardDimensions(): { width: number; height: number };
  /** `true` if `(x, y)` falls within the board boundaries. */
  isValidPosition(x: number, y: number): boolean;
  /** Returns the `Shot` record at `(x, y)` if that cell has been fired upon, otherwise `undefined`. */
  getShotAtPosition(x: number, y: number, isPlayerShot: boolean): Shot | undefined;
  /** `true` if a ship occupies cell `(x, y)` on the specified side's board. */
  hasShipAtPosition(x: number, y: number, isPlayerShips: boolean): boolean;
  /** `true` if an obstacle occupies cell `(x, y)` on the specified side's board. */
  hasObstacleAtPosition(x: number, y: number, isPlayerSide: boolean): boolean;
  /** Gets the game mode being used for this engine instance. */
  getGameMode(): GameMode;
}

/**
 * Full read + write contract for the game engine compute layer.
 *
 * Program against this interface rather than the concrete `GameEngine` class
 * so that alternative implementations — fog-of-war variants, deterministic
 * replay engines, or test doubles — can be injected without modifying
 * call-sites.
 *
 * Extends `IGameEngineReader`; prefer the narrower interface wherever write
 * access is not required.
 */
export interface IGameEngine extends IGameEngineReader {
  /**
   * Seeds both sides with their ships, items, obstacles, and shot patterns,
   * then derives all internal position maps. Must be called exactly once per
   * match before any mutation or state query that depends on board layout.
   *
   * @param playerShips - Ships placed on the player's board.
   * @param enemyShips - Ships placed on the enemy's board.
   * @param playerItems - Collectible items placed on the player's board (targeted by the enemy).
   * @param enemyItems - Collectible items placed on the enemy's board (targeted by the player).
   * @param playerObstacles - Indestructible terrain on the player's board.
   * @param enemyObstacles - Indestructible terrain on the enemy's board.
   * @param playerShotPatterns - Attack patterns available to the player.
   * @param enemyShotPatterns - Attack patterns available to the enemy.
   */
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
  /**
   * Clears all ships, items, obstacles, shots, and derived position maps,
   * returning the engine to a blank pre-initialised state. Call before
   * starting a new match on the same instance.
   */
  resetGame(): void;
  /**
   * Sets the board dimensions used when validating positions and resolving
   * shot patterns. Typically called before `initializeGame` or between
   * consecutive matches when the board size changes.
   */
  setBoardDimensions(width: number, height: number): void;
  /**
   * Applies the shot pattern at the given centre coordinate, registers every
   * resolved cell as a shot on the appropriate side's board, and returns the
   * aggregated outcome. Out-of-bounds offsets are silently skipped.
   *
   * @param centerX - 0-based column index used as the pattern's anchor.
   * @param centerY - 0-based row index used as the pattern's anchor.
   * @param patternIdx - 0-based index into the attacker's `shotPatterns` array.
   * @param isPlayerShot - `true` when the player is attacking (targets the enemy board).
   */
  executeShotPattern(
    centerX: number,
    centerY: number,
    patternIdx: number,
    isPlayerShot: boolean,
  ): ShotPatternResult;
  /** Immediately ends the match and declares `winner` as the victor. */
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
 * Immutable snapshot of the entire engine state at a single point in time.
 *
 * Produced by `IGameEngineReader.getState()` after every mutation. Arrays are
 * shallow copies — mutating them has no effect on internal engine state.
 *
 * This interface is **turn-agnostic**; turn ownership belongs to
 * `matchMachine`. For a turn-aware snapshot extend this via `MatchState` and
 * construct it with `toMatchState`.
 */
export interface GameEngineState {
  /** Shallow copy of all ships on the player's board. */
  readonly playerShips: readonly GameShip[];
  /** Shallow copy of all ships on the enemy's board. */
  readonly enemyShips: readonly GameShip[];
  /** All shots fired by the player (targeting the enemy board), in registration order. */
  readonly playerShots: readonly Shot[];
  /** All shots fired by the enemy (targeting the player board), in registration order. */
  readonly enemyShots: readonly Shot[];
  /** `true` once the game has ended by any means. */
  readonly isGameOver: boolean;
  /** `"player"` | `"enemy"` | `null` while the game is still in progress. */
  readonly winner: Winner;
  /** Width of the game board in cells. */
  readonly boardWidth: number;
  /** Height of the game board in cells. */
  readonly boardHeight: number;
  /** Total number of shots fired by both sides combined. */
  readonly shotCount: number;
  /** `true` when every ship on the player's board has been fully sunk. */
  readonly areAllPlayerShipsDestroyed: boolean;
  /** `true` when every ship on the enemy's board has been fully sunk. */
  readonly areAllEnemyShipsDestroyed: boolean;
  /** Items placed on the player's board, collectible by the enemy. */
  readonly playerItems: readonly GameItem[];
  /** Items placed on the enemy's board, collectible by the player. */
  readonly enemyItems: readonly GameItem[];
  /**
   * 0-based indices into `enemyItems` for items the player has fully collected
   * from the enemy board. An item is considered fully collected once every
   * one of its declared `part` cells has been hit.
   */
  readonly playerCollectedItems: readonly number[];
  /**
   * 0-based indices into `playerItems` for items the enemy has fully collected
   * from the player's board.
   */
  readonly enemyCollectedItems: readonly number[];
  /**
   * Items the player has activated through their `onUse` handler (collected
   * from the enemy board). Each entry pairs the `itemId` with the optional
   * `shipId` the item was targeted at when activated.
   */
  readonly playerUsedItems: readonly { readonly itemId: number; readonly shipId?: number }[];
  /**
   * Items the enemy has activated through their `onUse` handler (collected
   * from the player's board). Each entry pairs the `itemId` with the optional
   * `shipId` the item was targeted at when activated.
   */
  readonly enemyUsedItems: readonly { readonly itemId: number; readonly shipId?: number }[];
  /**
   * Obstacles on the player's board — permanent, indestructible terrain.
   * Shots landing on obstacle cells are recorded as misses.
   */
  readonly playerObstacles: readonly GameObstacle[];
  /**
   * Obstacles on the enemy's board — permanent, indestructible terrain.
   * Shots landing on obstacle cells are recorded as misses.
   */
  readonly enemyObstacles: readonly GameObstacle[];
  /** Shot patterns available to the player for the current match. */
  readonly playerShotPatterns: readonly ShotPattern[];
  /** Shot patterns available to the enemy for the current match. */
  readonly enemyShotPatterns: readonly ShotPattern[];
}

/**
 * Turn-aware snapshot of the full match state, produced by the `Match` layer.
 *
 * Augments `GameEngineState` with turn ownership fields (`currentTurn`,
 * `isPlayerTurn`, `isEnemyTurn`) that live in `matchMachine` rather than the
 * engine. Construct via `toMatchState(engine.getState(), currentTurn)`.
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
 * Outcome record for a single cell resolved during shot-pattern execution.
 *
 * This is an internal type consumed exclusively by `GameEngine`. External
 * callers always receive a `ShotPatternResult` from `executeShotPattern`,
 * which aggregates one `ShotResult` per resolved pattern offset.
 */
export interface ShotResult {
  /** `true` when the shot was successfully registered. `false` if the cell was already shot or the coordinates are out of bounds. */
  success: boolean;
  /** Human-readable reason for failure; present only when `success` is `false`. */
  error?: string;
  /** `true` when the targeted cell contains a ship part. `false` for misses, already-shot cells, and obstacle hits. */
  hit: boolean;
  /** The `shipId` of the ship whose cell was struck; `0` when no ship occupies the targeted cell. */
  shipId: number;
  /** `true` when this hit was the final blow that fully destroyed the ship identified by `shipId`. */
  shipDestroyed?: boolean;
  /** `true` when this shot triggered the end-of-game condition (e.g. all enemy ships sunk). */
  isGameOver?: boolean;
  /** The winning side when `isGameOver` is `true`; omitted while the match is still in progress. */
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
 * Symmetrical, perspective-aware projection of a game snapshot for one active
 * side. "own" always refers to the **active side** (the shooter or item
 * activator); "opponent" refers to the other side.
 *
 * This is the designated extension point for new symmetric game resources
 * (Open/Closed Principle): introducing a new pair of player↔enemy collections
 * only requires updating `SidePerspective` and `resolvePerspective` — all
 * downstream consumers remain unchanged.
 */
export interface SidePerspective {
  /** Ships placed on the active side's board. */
  readonly ownShips: readonly GameShip[];
  /** Ships placed on the opponent's board. */
  readonly opponentShips: readonly GameShip[];
  /** Collectible items placed on the active side's board. */
  readonly ownItems: readonly GameItem[];
  /** Collectible items placed on the opponent's board. */
  readonly opponentItems: readonly GameItem[];
  /** 0-based indices into `opponentItems` for items the active side has fully collected. */
  readonly ownCollectedItems: readonly number[];
  /** 0-based indices into `ownItems` for items the opponent has fully collected. */
  readonly opponentCollectedItems: readonly number[];
  /** Shots fired by the active side (targeting the opponent's board). */
  readonly ownShots: readonly Shot[];
  /** Shots received by the active side (fired by the opponent). */
  readonly opponentShots: readonly Shot[];
  /** Obstacles on the active side's board. */
  readonly ownObstacles: readonly GameObstacle[];
  /** Obstacles on the opponent's board. */
  readonly opponentObstacles: readonly GameObstacle[];

  /** Replaces ships on the active side's board and recomputes all derived position maps. */
  setOwnShips: (ships: GameShip[]) => void;
  /** Replaces ships on the opponent's board and recomputes all derived position maps. */
  setOpponentShips: (ships: GameShip[]) => void;
  /** Replaces collectible items on the active side's board (targeted by the opponent). */
  setOwnItems: (items: GameItem[]) => void;
  /** Replaces collectible items on the opponent's board (targeted by the active side). */
  setOpponentItems: (items: GameItem[]) => void;
  /** Atomically overwrites the active side's shot history and recomputes opponent ship hit counts. */
  setOwnShots: (shots: Shot[]) => void;
  /** Atomically overwrites the opponent's shot history and recomputes active side ship hit counts. */
  setOpponentShots: (shots: Shot[]) => void;
  /** Replaces indestructible terrain on the active side's board. */
  setOwnObstacles: (obstacles: GameObstacle[]) => void;
  /** Replaces indestructible terrain on the opponent's board. */
  setOpponentObstacles: (obstacles: GameObstacle[]) => void;
}
