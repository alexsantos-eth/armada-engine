import type { ShipTemplate, ItemTemplate, ObstacleTemplate } from "./constants";
import type { ShotPattern } from "./shots";
import type { BoardViewConfig } from "./config";
import type { MatchRuleSet } from "./rulesets";
import type { CardTemplate } from "./cards";
import type { Commander } from "./commanders";

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
  CARDS: {
    /** Size of the starting deck */
    DECK_SIZE: number;
    /** Number of cards drawn at match start */
    INITIAL_HAND_SIZE: number;
    /** Cards drawn per turn during the Draw Phase */
    DRAW_PER_TURN: number;
    /** Starting energy at match start */
    INITIAL_ENERGY: number;
    /** Starting max energy at match start */
    INITIAL_MAX_ENERGY: number;
    /** Max energy gained per turn */
    ENERGY_GROWTH_PER_TURN: number;
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

  /** Card templates available in this mode. Empty array for non-TCG modes. */
  cards: CardTemplate[];

  /** Commander options available in this mode. Empty array if no commander system. */
  commanders: Commander[];
}

