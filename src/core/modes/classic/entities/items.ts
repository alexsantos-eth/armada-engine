import { createEntitySet } from "../../../tools/constants";
import type { ItemTemplate } from "../../../types/constants";

export type { ItemTemplate } from "../../../types/constants";

export const HEALTH_KIT = Object.freeze({
  id: "health_kit",
  title: "Health Kit",
  description: "Grants hit-continuation on collect. Use to skip the enemy's turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 2,
}) as ItemTemplate;

export const ItemTemplateSet = createEntitySet<ItemTemplate>([
  HEALTH_KIT,
], HEALTH_KIT.id);

export const ITEM_TEMPLATES = ItemTemplateSet.map;
export const getItemTemplate = ItemTemplateSet.getById;
export const DEFAULT_ITEM_TEMPLATE = ItemTemplateSet.default;
