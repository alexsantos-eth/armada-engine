import type { GameMode } from "../../types/modes";

import { SHIPS } from "./entities/ships";

import { ITEMS } from "./entities/items";

import { OBSTACLES } from "./entities/obstacles";

import { SHOTS } from "./entities/shots";

import { StandardBoardView } from "./entities/views";

import { GAME_CONSTANTS } from "./entities/game";

import { ClassicRuleSet } from "./entities/rulesets";
import { buildDefaultCounts } from "../../tools/modes";

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
export const CLASSIC_MODE = Object.freeze({
  id: "classic",
  title: "Classic Mode",
  description:
    "Traditional gameplay with all standard ships, items, and obstacles",

  ships: SHIPS,

  items: ITEMS,

  obstacles: OBSTACLES,

  shotPatterns: SHOTS,

  constants: GAME_CONSTANTS,

  boardView: StandardBoardView,

  ruleSet: ClassicRuleSet,

  defaultCounts: {
    shipCounts: buildDefaultCounts(SHIPS),
    itemCounts: buildDefaultCounts(ITEMS),
    obstacleCounts: buildDefaultCounts(OBSTACLES),
  },
}) satisfies GameMode;
