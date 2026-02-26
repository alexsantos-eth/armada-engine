import type { Winner, GameTurn } from "./game";

export interface Shot {
  x: number;
  y: number;
  hit: boolean;
  shipId?: number;
  /**
   * Index of the pattern in the attacker's `playerShotPatterns` / `enemyShotPatterns`
   * array at the time the shot was fired. `0` for the first (default) pattern.
   */
  patternId?: number;
  patternCenterX?: number;
  patternCenterY?: number;
  /** True when this shot collected a part of an item instead of being a plain miss. */
  collected?: boolean;
  /** The index-based id of the collected item (when collected is true). */
  itemId?: number;
  /** True when this shot caused the item to be fully collected. */
  itemFullyCollected?: boolean;
  /**
   * True when this shot landed on an obstacle cell.
   * The shot is still recorded as a miss (`hit: false`) — obstacles are indestructible —
   * but this flag lets the UI distinguish an obstacle bounce from a plain water miss.
   */
  obstacleHit?: boolean;
  /** The 0-based index of the obstacle that was hit (when obstacleHit is true). */
  obstacleId?: number;
}

/**
 * Represents an offset from a center position for shot patterns.
 */
export interface ShotOffset {
  /** Horizontal offset (positive = right, negative = left) */
  dx: number;
  /** Vertical offset (positive = down, negative = up) */
  dy: number;
}

/**
 * Defines a shot pattern with multiple offsets.
 */
export interface ShotPattern {
  /** Unique identifier for the pattern */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Description of the pattern */
  description?: string;
  /** Array of offsets from the target position */
  offsets: ShotOffset[];
}

/**
 * Result of executing a shot pattern.
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

export interface ShotRecord {
  x: number;
  y: number;
  hit: boolean;
  shipId?: string;
  turn: GameTurn;
  timestamp: number;
}
