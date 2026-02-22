import type { GameItem } from "../types/common";

/**
 * An item template — extends GameItem with metadata and a `defaultCount`
 * for how many of this variant appear in a default game.
 * Add new variants here and the rest of the engine picks them up automatically.
 */
export interface ItemTemplate extends GameItem {
  /** Unique string identifier for the item variant. */
  id: string;
  /** Human-readable name. */
  title: string;
  /** Description of the item and any effect it grants when collected. */
  description?: string;
  /** How many of this item variant are placed in a default game. */
  defaultCount: number;
}

/**
 * Health Kit — a single-cell healing supply.
 *
 * Layout:
 *   [H]
 */
export const HEALTH_KIT: ItemTemplate = {
  id: "health_kit",
  title: "Health Kit",
  description: "Restores one point of health when collected.",
  coords: [0, 0],
  part: 1,
  defaultCount: 2,
};

/**
 * Ammo Cache — a two-cell ammunition supply.
 *
 * Layout (horizontal):
 *   [A][A]
 */
export const AMMO_CACHE: ItemTemplate = {
  id: "ammo_cache",
  title: "Ammo Cache",
  description: "Grants extra ammunition when fully collected.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,
};

/**
 * Shield Module — a single-cell defensive upgrade.
 *
 * Layout:
 *   [S]
 */
export const SHIELD_MODULE: ItemTemplate = {
  id: "shield_module",
  title: "Shield Module",
  description: "Grants a one-hit shield when collected.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,
};

/**
 * Radar Device — a three-cell reconnaissance tool.
 *
 * Layout (horizontal):
 *   [R][R][R]
 */
export const RADAR_DEVICE: ItemTemplate = {
  id: "radar_device",
  title: "Radar Device",
  description: "Reveals a section of the enemy board when fully collected.",
  coords: [0, 0],
  part: 3,
  defaultCount: 1,
};

/**
 * All predefined item templates, keyed by variant name.
 */
export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  health_kit: HEALTH_KIT,
  ammo_cache: AMMO_CACHE,
  shield_module: SHIELD_MODULE,
  radar_device: RADAR_DEVICE,
};

/**
 * Get an item template by name.
 * @returns The matching ItemTemplate, or HEALTH_KIT if not found.
 */
export function getItemTemplate(name: string): ItemTemplate {
  return ITEM_TEMPLATES[name] ?? HEALTH_KIT;
}
