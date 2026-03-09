import type { ShipTemplate, ItemTemplate, ObstacleTemplate } from "./constants";
import type { ShotPattern } from "./shots";
import type { BoardViewConfig } from "./config";
import type { MatchRuleSet } from "./rulesets";

/**
 * Game constants for a mode
 */
export interface GameModeConstants {
  SHIPS: {
    MIN_DISTANCE: number;
    MAX_PLACEMENT_ATTEMPTS: number;
  };
  ITEMS: {
    MIN_DISTANCE_FROM_SHIPS: number;
    MAX_PLACEMENT_ATTEMPTS: number;
  };
  OBSTACLES: {
    MAX_PLACEMENT_ATTEMPTS: number;
  };
  GAME_LOGIC: {
    BATTLE: {
      RANDOM_TURN_THRESHOLD: number;
    };
    SHIP_GENERATION: {
      ORIENTATION_RANDOM_THRESHOLD: number;
      QUADRANT_SIZE_DIVISOR: number;
    };
  };
  BOARD: {
    MIN_SIZE: number;
    MAX_SIZE: number;
    DEFAULT_VIEW: BoardViewConfig;
  };
}

/**
 * A game mode defines a complete set of entities, rules, and defaults
 * for a specific gameplay variant.
 * 
 * Instead of manually specifying entity IDs and counts, you define
 * a mode once with all templates and default counts.
 */
export interface GameMode {
  /** Unique identifier for this game mode */
  id: string;
  
  /** Human-readable name */
  title: string;
  
  /** Brief description of this mode */
  description: string;

  /** Ship templates available in this mode */
  ships: ShipTemplate[];

  /** Item templates available in this mode */
  items: ItemTemplate[];

  /** Obstacle templates available in this mode */
  obstacles: ObstacleTemplate[];

  /** Shot patterns available in this mode */
  shotPatterns: ShotPattern[];

  /** Default board view configuration */
  boardView: BoardViewConfig;

  /**
   * Default entity counts for this mode.
   * Built from the templates' defaultCount values.
   */
  defaultCounts: {
    shipCounts: Record<string, number>;
    itemCounts: Record<string, number>;
    obstacleCounts: Record<string, number>;
  };

  /**
   * Game constants defining placement rules and generation parameters
   */
  constants: GameModeConstants;

  /**
   * Default ruleset for this game mode.
   * Defines turn management and game-over conditions.
   */
  ruleSet: MatchRuleSet;
}

