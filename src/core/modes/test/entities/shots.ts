import type { ShotPattern } from "../../../types/shots";

/**
 * Test mode shot patterns - basic patterns for testing
 */

export const TEST_SINGLE_SHOT = Object.freeze({
  id: "single",
  title: "Test Single Shot",
  description: "Single shot for testing",
  offsets: [{ dx: 0, dy: 0 }],
} satisfies ShotPattern);

export const TEST_CROSS_SHOT = Object.freeze({
  id: "cross",
  title: "Test Cross Shot",
  description: "Cross pattern for testing",
  offsets: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ],
} satisfies ShotPattern);
