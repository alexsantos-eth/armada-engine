export type GameTurn = "PLAYER_TURN" | "ENEMY_TURN";
export type PlayerName = "player" | "enemy";
export type Winner = PlayerName | null;
export type CellState = "EMPTY" | "SHIP" | "HIT" | "MISS" | "ITEM" | "COLLECTED";

/**
 * A single cell in a rich board, combining the visual state with the full
 * shot metadata (when the cell has been fired upon).
 */
export interface Cell {
  /** Visual state of the cell (same as the flat Board). */
  state: CellState;
  /**
   * Full shot details when this cell was fired upon.
   * Undefined for cells that have not been shot yet (state "EMPTY", "SHIP", "ITEM").
   */
  shot?: Shot;
}

/**
 * A 2D board where every cell carries both its CellState and the underlying
 * Shot data. Useful for UIs that need to know *how* a cell was hit
 * (e.g. which pattern, whichship was sunk, whether an item was collected…).
 */
export type Board = Cell[][];

/**
 * Context passed to item event handlers (`onCollect` and `onUse`).
 * Provides read access to the current game state and write access to the
 * most common mutation surfaces (ships, items, turn).
 *
 * `setRuleSet` is typed as `unknown` here to avoid a circular dependency
 * with the engine layer. Import and cast to `MatchRuleSet` in your handler:
 *
 * ```typescript
 * import type { MatchItemActionContext } from '../engine/match';
 * // MatchItemActionContext extends ItemActionContext with setRuleSet: (ruleSet: MatchRuleSet) => void
 * ```
 */
export interface ItemActionContext {
  /** The item that triggered the event. */
  item: GameItem;
  /** `true` = player fired the shot that collected this item; `false` = enemy did. */
  isPlayerShot: boolean;
  /**
   * The shot that caused the collect event.
   * `undefined` when the context is built for an `onUse` event that was
   * triggered manually (not from a shot).
   */
  shot?: Shot;
  /** Snapshot of the current turn at the moment the event fires. */
  currentTurn: GameTurn;
  /** Player ships at the moment of the event. */
  playerShips: GameShip[];
  /** Enemy ships at the moment of the event. */
  enemyShips: GameShip[];
  /** Items placed on the player board at the moment of the event. */
  playerItems: GameItem[];
  /** Items placed on the enemy board at the moment of the event. */
  enemyItems: GameItem[];
  /**
   * Indices (into `playerItems`) of items **you** have collected.
   *
   * In `GameEngineState` (fixed perspective): items the player collected
   * from the enemy board (indices into `enemyItems`).
   *
   * In `ItemActionContext` (collector's perspective): items you collected
   * from the opponent's board (indices into `enemyItems`).
   */
  playerCollectedItems: number[];
  /**
   * Indices (into `enemyItems`) of items your **opponent** has collected.
   *
   * In `GameEngineState` (fixed perspective): items the enemy collected
   * from the player board (indices into `playerItems`).
   *
   * In `ItemActionContext` (collector's perspective): items the opponent
   * collected from your board (indices into `playerItems`).
   */
  enemyCollectedItems: number[];
  /** All shots fired by the player at the moment of the event. */
  playerShots: Shot[];
  /** All shots fired by the enemy at the moment of the event. */
  enemyShots: Shot[];
  /** Width of the game board in cells. */
  boardWidth: number;
  /** Height of the game board in cells. */
  boardHeight: number;
  /** Replace the player's ships (takes effect immediately). */
  setPlayerShips: (ships: GameShip[]) => void;
  /** Replace the enemy's ships (takes effect immediately). */
  setEnemyShips: (ships: GameShip[]) => void;
  /** Replace the player's items (resets hit/collected state for that board). */
  setPlayerItems: (items: GameItem[]) => void;
  /** Replace the enemy's items (resets hit/collected state for that board). */
  setEnemyItems: (items: GameItem[]) => void;
  /** Replace the player's recorded shots. */
  setPlayerShots: (shots: Shot[]) => void;
  /** Replace the enemy's recorded shots. */
  setEnemyShots: (shots: Shot[]) => void;
  /** Immediately toggles the active turn (player↔enemy). */
  toggleTurn: () => void;
  /**
   * Place a new 1×1 (or custom-sized) ship on the player's board at the first
   * free position that is neither occupied by an existing ship nor already shot.
   *
   * @param width     Ship width in cells (default 1).
   * @param height    Ship height in cells (default 1).
   * @param preferred Optional preferred top-left corner; tried before scanning.
   * @returns `true` if the ship was placed, `false` if no free slot was found.
   */
  addShip: (width?: number, height?: number, preferred?: [number, number]) => boolean;
  /**
   * Swap the active ruleset.
   * Typed as `unknown` to avoid a circular import from the engine layer.
   * Use `MatchItemActionContext` (from `engine/match`) for full typing.
   */
  setRuleSet: (ruleSet: unknown) => void;
}

/**
 * A collectible item placed on the board.
 * It occupies `part` cells in a horizontal row starting at `coords`.
 * When all cells are shot, the item is fully collected.
 */
export interface GameItem {
  coords: [number, number];
  /** Number of cells (parts) that must be shot to fully collect this item. */
  part: number;
  itemId?: number;
  /** Template identifier (matches ItemTemplate.id), used for cross-board equalization. */
  templateId?: string;
  /**
   * Called once when all parts of this item have been fully collected.
   * Use this to apply immediate effects (repeat the turn, alter ships, change ruleset…).
   *
   * For full type safety on `ctx.setRuleSet`, use `MatchItemActionContext`
   * from `src/core/engine/match` in your handler implementation.
   */
  onCollect?: (ctx: ItemActionContext) => void;
  /**
   * An optional stored effect that can be triggered by the UI via
   * `match.useItem(itemId, isPlayerShot)` at any point after collection.
   *
   * The engine does **not** call this automatically — it is a manual,
   * UI-driven action (e.g. "activate shield", "deploy radar scan").
   */
  onUse?: (ctx: ItemActionContext) => void;
}

/**
 * A 2D rectangular ship on the board.
 * Its footprint is a `width × height` rectangle with top-left corner at `coords`.
 */
export interface GameShip {
  coords: [number, number];
  /** Number of columns occupied (≥ 1). */
  width: number;
  /** Number of rows occupied (≥ 1). */
  height: number;
  shipId?: number;
}

export interface Shot {
  x: number;
  y: number;
  hit: boolean;
  shipId?: number;
  patternId?: string; 
  patternCenterX?: number; 
  patternCenterY?: number;
  /** True when this shot collected a part of an item instead of being a plain miss. */
  collected?: boolean;
  /** The index-based id of the collected item (when collected is true). */
  itemId?: number;
  /** True when this shot caused the item to be fully collected. */
  itemFullyCollected?: boolean;
}

/**
 * Represents an offset from a center position for shot patterns
 */
export interface ShotOffset {
  /** Horizontal offset (positive = right, negative = left) */
  dx: number;
  /** Vertical offset (positive = down, negative = up) */
  dy: number;
}

/**
 * Defines a shot pattern with multiple offsets
 */
export interface ShotPattern {
  /** Unique identifier for the pattern */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the pattern */
  description?: string;
  /** Array of offsets from the target position */
  offsets: ShotOffset[];
}

/**
 * Result of executing a shot pattern
 */
export interface ShotPatternResult {
  /** Whether the pattern was executed successfully */
  success: boolean;
  /** Error message if execution failed */
  error?: string;
  /** Array of individual shot results */
  shots: Array<
    {
      shipDestroyed?: boolean;
      executed: boolean; // False if shot was out of bounds or already taken
    } & Shot
  >;

  /** Whether the game is over after this pattern */
  isGameOver: boolean;
  /** Winner if game is over */
  winner: Winner;
}

export interface ShipPlacement {
  ship: GameShip;
  cells: [number, number][];
}

export interface ShotRecord {
  x: number;
  y: number;
  hit: boolean;
  shipId?: string;
  turn: GameTurn;
  timestamp: number;
}

export interface BattleResult {
  winner: Winner;
  totalTurns: number;
  playerShots: number;
  enemyShots: number;
  playerHits: number;
  enemyHits: number;
  shipPlacements: { player: ShipPlacement[]; enemy: ShipPlacement[] };
  shotHistory: ShotRecord[];
}

export type PlayerRole = "host" | "guest";
