import type { GameModeConstants } from "../../../types/modes";
import { TestBoardView } from "./views";

/**
 * Test mode game constants - simplified for testing
 */

export const TEST_GAME_CONSTANTS = Object.freeze({
  SHIPS: {
    MIN_DISTANCE: 2,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: {
      small: 1,
      medium: 1,
      large: 1,
      xlarge: 0,
    },
  },
  ITEMS: {
    MIN_DISTANCE_FROM_SHIPS: 1,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: {
      health_kit: 0,
      radar_device: 0,
    },
  },
  OBSTACLES: {
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: {
      rock: 0,
      mine: 0,
    },
  },
  SHOTS: {
    DEFAULT_PATTERN_IDS: ["single", "cross"],
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
    DEFAULT_VIEW: TestBoardView,
  },
} satisfies GameModeConstants);
