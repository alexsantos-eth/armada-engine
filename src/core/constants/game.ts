import { SHIP_TEMPLATES } from "./ships";
import { ITEM_TEMPLATES } from "./items";

export const GAME_CONSTANTS = {
  SHIPS: {
    MIN_DISTANCE: 2,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: Object.fromEntries(
      Object.entries(SHIP_TEMPLATES).map(([key, t]) => [key, t.defaultCount]),
    ) as Record<string, number>,
  },
  ITEMS: {
    MIN_DISTANCE_FROM_SHIPS: 1,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: Object.fromEntries(
      Object.entries(ITEM_TEMPLATES).map(([key, t]) => [key, t.defaultCount]),
    ) as Record<string, number>,
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
    DEFAULT_WIDTH: 5,
    DEFAULT_HEIGHT: 5,
    MIN_SIZE: 3,
    MAX_SIZE: 30,
  },
};
