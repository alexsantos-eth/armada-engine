import type { ShipTemplate } from "../../../types/constants";

/**
 * Test mode ships - simplified versions for unit testing
 */

export const TEST_SMALL_SHIP = Object.freeze({
  id: "small",
  title: "Test Small Ship",
  description: "Small 2-cell ship for testing",
  coords: [0, 0] as [number, number],
  width: 2,
  height: 1,
  defaultCount: 1,
}) satisfies ShipTemplate;

export const TEST_MEDIUM_SHIP = Object.freeze({
  id: "medium",
  title: "Test Medium Ship",
  description: "Medium 3-cell ship for testing",
  coords: [0, 0] as [number, number],
  width: 3,
  height: 1,
  defaultCount: 1,
}) satisfies ShipTemplate;

export const TEST_LARGE_SHIP = Object.freeze({
  id: "large",
  title: "Test Large Ship",
  description: "Large 4-cell ship for testing",
  coords: [0, 0] as [number, number],
  width: 4,
  height: 1,
  defaultCount: 1,
}) satisfies ShipTemplate;

export const TEST_XLARGE_SHIP = Object.freeze({
  id: "xlarge",
  title: "Test XLarge Ship",
  description: "Extra large 5-cell ship for testing",
  coords: [0, 0] as [number, number],
  width: 5,
  height: 1,
  defaultCount: 0,
}) satisfies ShipTemplate;
