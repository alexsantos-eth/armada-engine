import { createEntitySet } from "../tools/constants";
import type { ItemTemplate } from "../types/constants";
import type { ItemActionContext } from "../types/entities";

export type { ItemTemplate } from "../types/constants";

export const HEALTH_KIT = Object.freeze({
  id: "health_kit",
  title: "Health Kit",
  description: "Grants hit-continuation on collect. Use to skip the enemy's turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx: ItemActionContext) {
    ctx.setBoardViewPlayerSide(['playerShips'])
    ctx.setBoardViewEnemySide(['enemyShips'])
  },
}) as ItemTemplate;

export const AMMO_CACHE = Object.freeze({
  id: "ammo_cache",
  title: "Ammo Cache",
  description: "Grants hit-continuation on collect. No activation required.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx: ItemActionContext) {
    if (ctx.enemyShips.length > 0) {
      const last = ctx.enemyShips[ctx.enemyShips.length - 1];
      ctx.deleteEnemyShip(last.shipId ?? ctx.enemyShips.length - 1);
    }
  },
}) as ItemTemplate;

export const SHIELD_MODULE = Object.freeze({
  id: "shield_module",
  title: "Shield Module",
  description: "Forces alternating turns on collect. Use to cancel the enemy's turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx: ItemActionContext) {
    ctx.toggleTurn();
  },
}) as ItemTemplate;

export const RADAR_DEVICE = Object.freeze({
  id: "radar_device",
  title: "Radar Device",
  description: "Clears all opponent items on collect. Use for a bonus shot.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx: ItemActionContext) {
    ctx.deleteAllEnemyObstacles();
  },
}) as ItemTemplate;


export const ItemTemplateSet = createEntitySet<ItemTemplate>([
  HEALTH_KIT,
  AMMO_CACHE,
  SHIELD_MODULE,
  RADAR_DEVICE,
], HEALTH_KIT.id);

export const ITEM_TEMPLATES = ItemTemplateSet.map;
export const getItemTemplate = ItemTemplateSet.getById;
export const DEFAULT_ITEM_TEMPLATE = ItemTemplateSet.default;
