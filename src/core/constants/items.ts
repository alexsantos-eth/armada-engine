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

export const HEALTH_KIT: ItemTemplate = {
  id: "health_kit",
  title: "Health Kit",
  description: "Grants hit-continuation on collect. Use to skip the enemy's turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx) {
    ctx.addShip(1, 1, [0, 0]);
  },
};


export const AMMO_CACHE: ItemTemplate = {
  id: "ammo_cache",
  title: "Ammo Cache",
  description: "Grants hit-continuation on collect. No activation required.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx) {
    if (ctx.enemyShips.length > 0) {
      ctx.setEnemyShips(ctx.enemyShips.slice(0, -1));
    }
  },
};


export const SHIELD_MODULE: ItemTemplate = {
  id: "shield_module",
  title: "Shield Module",
  description: "Forces alternating turns on collect. Use to cancel the enemy's turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx) {
    ctx.toggleTurn();
  },
};

export const RADAR_DEVICE: ItemTemplate = {
  id: "radar_device",
  title: "Radar Device",
  description: "Clears all opponent items on collect. Use for a bonus shot.",
  coords: [0, 0],
  part: 2,
  defaultCount: 1,

  onUse(ctx) {
    ctx.setPlayerItems([]);
  },
};

/**
 * All predefined item templates, keyed by variant id.
 */
export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  health_kit: HEALTH_KIT,
  ammo_cache: AMMO_CACHE,
  shield_module: SHIELD_MODULE,
  radar_device: RADAR_DEVICE,
};

/**
 * Get an item template by id.
 * @returns The matching ItemTemplate, or HEALTH_KIT if not found.
 */
export function getItemTemplate(name: string): ItemTemplate {
  return ITEM_TEMPLATES[name] ?? HEALTH_KIT;
}
