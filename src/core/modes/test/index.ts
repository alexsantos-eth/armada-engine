import type { GameMode } from "../../types/modes";
import { buildDefaultCounts } from "../../types/modes";

import {
  TEST_SMALL_SHIP,
  TEST_MEDIUM_SHIP,
  TEST_LARGE_SHIP,
  TEST_XLARGE_SHIP,
} from "./entities/ships";

import {
  TEST_HEALTH_KIT,
  TEST_RADAR_DEVICE,
} from "./entities/items";

import {
  TEST_ROCK,
  TEST_MINE,
} from "./entities/obstacles";

import {
  TEST_SINGLE_SHOT,
  TEST_CROSS_SHOT,
} from "./entities/shots";

import { TestBoardView } from "./entities/views";
import { TEST_GAME_CONSTANTS } from "./entities/game";
import { TestRuleSet } from "./entities/rulesets";

/**
 * Test Game Mode
 * 
 * A simplified game mode specifically for unit testing.
 * Contains minimal entities with sensible defaults for test scenarios.
 * 
 * This mode should NOT be used in production - it's only for tests.
 */
export const TEST_MODE: GameMode = {
  id: "test",
  title: "Test Mode",
  description: "Simplified mode for unit testing",

  ships: [
    TEST_SMALL_SHIP,
    TEST_MEDIUM_SHIP,
    TEST_LARGE_SHIP,
    TEST_XLARGE_SHIP,
  ],

  items: [
    TEST_HEALTH_KIT,
    TEST_RADAR_DEVICE,
  ],

  obstacles: [
    TEST_ROCK,
    TEST_MINE,
  ],

  shotPatterns: [
    TEST_SINGLE_SHOT,
    TEST_CROSS_SHOT,
  ],

  boardView: TestBoardView,

  defaultCounts: {
    shipCounts: buildDefaultCounts([
      TEST_SMALL_SHIP,
      TEST_MEDIUM_SHIP,
      TEST_LARGE_SHIP,
      TEST_XLARGE_SHIP,
    ]),
    itemCounts: buildDefaultCounts([
      TEST_HEALTH_KIT,
      TEST_RADAR_DEVICE,
    ]),
    obstacleCounts: buildDefaultCounts([
      TEST_ROCK,
      TEST_MINE,
    ]),
  },

  constants: TEST_GAME_CONSTANTS,

  ruleSet: TestRuleSet,
};
