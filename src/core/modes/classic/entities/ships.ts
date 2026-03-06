import type { ShipTemplate } from "../../../types/constants";
import { createEntitySet } from "../../../tools/constants";

export type { ShipTemplate } from "../../../types/constants";

export const SMALL_SHIP = Object.freeze({
  id: "small",
  title: "Small Ship",
  description: "A compact 2-cell vessel.",
  coords: [0, 0],
  width: 2,
  height: 1,
  defaultCount: 1,
}) as ShipTemplate;

export const MEDIUM_SHIP = Object.freeze({
  id: "medium",
  title: "Medium Ship",
  description: "A standard 3-cell cruiser.",
  coords: [0, 0],
  width: 3,
  height: 1,
  defaultCount: 2,
}) as ShipTemplate;

export const LARGE_SHIP = Object.freeze({
  id: "large",
  title: "Large Ship",
  description: "A 4-cell battleship.",
  coords: [0, 0],
  width: 4,
  height: 1,
  defaultCount: 1,
}) as ShipTemplate;

export const XLARGE_SHIP = Object.freeze({
  id: "xlarge",
  title: "XLarge Ship",
  description: "A massive 5-cell carrier.",
  coords: [0, 0],
  width: 5,
  height: 1,
  defaultCount: 1,
}) as ShipTemplate;

export const ShipSet = createEntitySet<ShipTemplate>([
  SMALL_SHIP,
  MEDIUM_SHIP,
  LARGE_SHIP,
  XLARGE_SHIP,
], SMALL_SHIP.id);

export const SHIP_TEMPLATES = ShipSet.map;
export const getShipTemplate = ShipSet.getById;
export const DEFAULT_SHIP_TEMPLATE = ShipSet.default;
