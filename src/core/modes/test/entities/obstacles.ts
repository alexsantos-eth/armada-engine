import type { ObstacleTemplate } from "../../../types/constants";

/**
 * Test mode obstacles - simplified versions for unit testing
 */

export const TEST_ROCK = Object.freeze({
  id: "rock",
  title: "Test Rock",
  description: "Rock obstacle for testing",
  coords: [0, 0] as [number, number],
  width: 1,
  height: 1,
  defaultCount: 0,
}) satisfies ObstacleTemplate;

export const TEST_MINE = Object.freeze({
  id: "mine",
  title: "Test Mine",
  description: "Mine obstacle for testing",
  coords: [0, 0] as [number, number],
  width: 1,
  height: 1,
  defaultCount: 0,
}) satisfies ObstacleTemplate;
