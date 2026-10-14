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
    id: "tree",
    textureSource: "/assets/tree/block_2.svg",
    height: 2,
    spawnChance: 0.03,
    surface: "grass",
  },
  {
    id: "statue",
    textureSource: "/assets/statue/block.svg",
    height: 2,
    spawnChance: 0.0005,
    surface: "grass",
  },
];