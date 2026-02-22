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
