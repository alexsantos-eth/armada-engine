import type { GameShip } from "../types/common";

/**
 * A ship template — extends GameShip with a `defaultCount` for how many
 * of this variant appear in a default game. Add new variants here and the
 * rest of the engine picks them up automatically.
 */
export interface ShipTemplate extends GameShip {
  /** How many of this ship variant are placed in a default game. */
  defaultCount: number;
}

/**
 * Small ship — occupies 2 cells in a single row.
 *
 * Layout (horizontal):
 *   X X
 */
export const SMALL_SHIP: ShipTemplate = {
  coords: [0, 0],
  width: 2,
  height: 2,
  defaultCount: 1,
};

/**
 * Medium ship — occupies 3 cells in a single row.
 *
 * Layout (horizontal):
 *   X X X
 */
export const MEDIUM_SHIP: ShipTemplate = {
  coords: [0, 0],
  width: 3,
  height: 1,
  defaultCount: 2,
};

/**
 * Large ship — occupies 4 cells in a single row.
 *
 * Layout (horizontal):
 *   X X X X
 */
export const LARGE_SHIP: ShipTemplate = {
  coords: [0, 0],
  width: 4,
  height: 1,
  defaultCount: 1,
};

/**
 * XLarge ship — occupies 5 cells in a single row.
 *
 * Layout (horizontal):
 *   X X X X X
 */
export const XLARGE_SHIP: ShipTemplate = {
  coords: [0, 0],
  width: 5,
  height: 1,
  defaultCount: 1,
};

/**
 * All predefined ship templates, keyed by variant name.
 * To add a new variant, add an entry here — DEFAULT_COUNTS will update automatically.
 */
export const SHIP_TEMPLATES: Record<string, ShipTemplate> = {
  small: SMALL_SHIP,
  medium: MEDIUM_SHIP,
  large: LARGE_SHIP,
  xlarge: XLARGE_SHIP,
};

/**
 * Get a ship template by name.
 * @returns The matching ShipTemplate, or SMALL_SHIP if not found
 */
export function getShipTemplate(name: string): ShipTemplate {
  return SHIP_TEMPLATES[name] ?? SMALL_SHIP;
}

/**
 * Place a ship template at specific coordinates.
 * @param template - Source template (width/height are copied)
 * @param x - Top-left X coordinate
 * @param y - Top-left Y coordinate
 * @param shipId - Optional ship ID
 * @returns A new GameShip positioned at (x, y)
 *
 * @example
 * const ship = createShip(MEDIUM_SHIP, 3, 5);
 * // { coords: [3, 5], width: 3, height: 1 }
 */
export function createShip(
  template: GameShip,
  x: number,
  y: number,
  shipId?: number,
): GameShip {
  return {
    coords: [x, y],
    width: template.width,
    height: template.height,
    shipId,
  };
}
