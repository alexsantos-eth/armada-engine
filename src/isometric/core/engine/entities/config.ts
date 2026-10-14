import type { EntityDefinition } from "../../types";

export const ENTITY_CONFIG: EntityDefinition[] = [
  {
    id: "tree",
    textureSource: "/assets/tree/block.svg",
    height: 1,
    spawnChance: 0.03,
    surface: "grass",
  },
  {
    id: "statue",
    textureSource: "/assets/statue/block.svg",
    height: 1,
    spawnChance: 0.03,
    surface: "grass",
  },
];