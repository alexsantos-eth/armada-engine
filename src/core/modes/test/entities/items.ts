import type { ItemTemplate } from "../../../types/constants";

/**
 * Test mode items - simplified versions for unit testing
 */

export const TEST_HEALTH_KIT = Object.freeze({
  id: "health_kit",
  title: "Test Health Kit",
  description: "Health kit for testing",
  coords: [0, 0] as [number, number],
  part: 1,
  defaultCount: 0,
}) satisfies ItemTemplate;

export const TEST_RADAR_DEVICE = Object.freeze({
  id: "radar_device",
  title: "Test Radar Device",
  description: "Radar device for testing",
  coords: [0, 0] as [number, number],
  part: 1,
  defaultCount: 0,
}) satisfies ItemTemplate;
