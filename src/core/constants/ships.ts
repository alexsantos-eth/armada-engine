import type { GameShip } from "../types/entities";
export type { ShipTemplate } from "../types/constants";
import type { ShipTemplate } from "../types/constants";

export const SMALL_SHIP: ShipTemplate = {
  id: "small",
  title: "Small Ship",
  description: "A compact 2-cell vessel.",
  coords: [0, 0],
  width: 2,
  height: 1,
  defaultCount: 1,
};

export const MEDIUM_SHIP: ShipTemplate = {
  id: "medium",
  title: "Medium Ship",
  description: "A standard 3-cell cruiser.",
  coords: [0, 0],
  width: 3,
  height: 1,
  defaultCount: 2,
  onDestroy: (ctx) => {
    console.log("Medium ship destroyed! Triggering explosion...");
    ctx.deleteAllEnemyObstacles()
  }
};

export const LARGE_SHIP: ShipTemplate = {
  id: "large",
  title: "Large Ship",
  description: "A 4-cell battleship.",
  coords: [0, 0],
  width: 4,
  height: 1,
  defaultCount: 1,
};

export const XLARGE_SHIP: ShipTemplate = {
  id: "xlarge",
  title: "XLarge Ship",
  description: "A massive 5-cell carrier.",
  coords: [0, 0],
  width: 5,
  height: 1,
  defaultCount: 1,
};

export const SHIP_TEMPLATES: Record<string, ShipTemplate> = {
  small: SMALL_SHIP,
  medium: MEDIUM_SHIP,
  large: LARGE_SHIP,
  xlarge: XLARGE_SHIP,
};

export function getShipTemplate(name: string): ShipTemplate {
  return SHIP_TEMPLATES[name] ?? SMALL_SHIP;
}

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
    onDestroy: template.onDestroy,
  };
}
