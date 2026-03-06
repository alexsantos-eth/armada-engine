import { SHIP_TEMPLATES } from "./ships";
import { ITEM_TEMPLATES } from "./items";
import { OBSTACLE_TEMPLATES } from "./obstacles";
import { DEFAULT_BOARD_VIEW } from "./views";
import { SHOT_PATTERNS } from "./shots";

export const GAME_CONSTANTS = {
  SHIPS: {
    MIN_DISTANCE: 2,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: Object.fromEntries(
      Object.entries(SHIP_TEMPLATES).map(([key, t]) => [key, (t as { defaultCount: number }).defaultCount]),
    ) as Record<string, number>,
  },
  ITEMS: {
    MIN_DISTANCE_FROM_SHIPS: 1,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: Object.fromEntries(
      Object.entries(ITEM_TEMPLATES).map(([key, t]) => [key, (t as { defaultCount: number }).defaultCount]),
    ) as Record<string, number>,
  },
  OBSTACLES: {
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: Object.fromEntries(
      Object.entries(OBSTACLE_TEMPLATES).map(([key, t]) => [
        key,
        (t as { defaultCount: number }).defaultCount,
      ]),
    ) as Record<string, number>,
  },
  SHOTS: {
    DEFAULT_PATTERN_IDS: Object.keys(SHOT_PATTERNS),
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
};
