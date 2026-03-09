import { DEFAULT_BOARD_VIEW } from "./views";
import type { GameModeConstants } from "../../../types/modes";

/**
 * Game constants for the Classic game mode.
 *
 * These constants are frozen to prevent runtime mutations that could cause
 * desynchronization in multiplayer scenarios. Each game mode can define its own
 * constants, allowing different modes to have different placement rules, thresholds, etc.
 */
export const GAME_CONSTANTS = Object.freeze({
  SHIPS: {
    MIN_DISTANCE: 2,
    MAX_PLACEMENT_ATTEMPTS: 200,
  },
  ITEMS: {
    MIN_DISTANCE_FROM_SHIPS: 1,
    MAX_PLACEMENT_ATTEMPTS: 200,
  },
  OBSTACLES: {
    MAX_PLACEMENT_ATTEMPTS: 200,
  },
  GAME_LOGIC: {
    BATTLE: {
      RANDOM_TURN_THRESHOLD: 0.5,
    },
    SHIP_GENERATION: {
      ORIENTATION_RANDOM_THRESHOLD: 0.5,
      QUADRANT_SIZE_DIVISOR: 2,
    },
  },
  BOARD: {
    MIN_SIZE: 3,
    MAX_SIZE: 30,
    DEFAULT_VIEW: DEFAULT_BOARD_VIEW,
  },
} satisfies GameModeConstants);
