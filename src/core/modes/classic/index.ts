import type { GameMode } from "../../types/modes";
import { buildDefaultCounts } from "../../types/modes";

import {
  SMALL_SHIP,
  MEDIUM_SHIP,
  LARGE_SHIP,
  XLARGE_SHIP,
} from "./entities/ships";

import {
  HEALTH_KIT,
} from "./entities/items";

import {
  ROCK_OBSTACLE,
} from "./entities/obstacles";

import {
  SINGLE_SHOT,
  CROSS_SHOT,
  LARGE_CROSS_SHOT,
  HORIZONTAL_LINE_SHOT,
  VERTICAL_LINE_SHOT,
  SQUARE_SHOT,
  DIAGONAL_X_SHOT,
  SMALL_SQUARE_SHOT,
  T_SHAPE_SHOT,
  L_SHAPE_SHOT,
} from "./entities/shots";

import { StandardBoardView } from "./entities/views";

import { GAME_CONSTANTS } from "./entities/game";

import { ClassicRuleSet } from "./entities/rulesets";

/**
 * Classic Game Mode
 * 
 * The standard gameplay mode with all traditional entities:
 * - 4 ship types (small, medium, large, xlarge)
 * - Health kit items
 * - Rock obstacles
 * - Full set of shot patterns
 * - 5x5 standard board
 */
export const CLASSIC_MODE: GameMode = {
  id: "classic",
  title: "Classic Mode",
  description: "Traditional gameplay with all standard ships, items, and obstacles",

  ships: [
    SMALL_SHIP,
    MEDIUM_SHIP,
    LARGE_SHIP,
    XLARGE_SHIP,
  ],

  items: [
    HEALTH_KIT,
  ],

  obstacles: [
    ROCK_OBSTACLE,
  ],

  shotPatterns: [
    SINGLE_SHOT,
    CROSS_SHOT,
    LARGE_CROSS_SHOT,
    HORIZONTAL_LINE_SHOT,
    VERTICAL_LINE_SHOT,
    SQUARE_SHOT,
    DIAGONAL_X_SHOT,
    SMALL_SQUARE_SHOT,
    T_SHAPE_SHOT,
    L_SHAPE_SHOT,
  ],

  boardView: StandardBoardView,

  defaultCounts: {
    shipCounts: buildDefaultCounts([
      SMALL_SHIP,
      MEDIUM_SHIP,
      LARGE_SHIP,
      XLARGE_SHIP,
    ]),
    itemCounts: buildDefaultCounts([
      HEALTH_KIT,
    ]),
    obstacleCounts: buildDefaultCounts([
      ROCK_OBSTACLE,
    ]),
  },

  constants: GAME_CONSTANTS,

  ruleSet: ClassicRuleSet,
};
