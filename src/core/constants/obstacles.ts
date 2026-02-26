import type { ObstacleTemplate } from "../types/constants";
import { createEntitySet } from "../tools/constants";

export type { ObstacleTemplate } from "../types/constants";

export const ROCK_OBSTACLE: ObstacleTemplate = {
  id: "rock",
  title: "Rock",
  description: "A small 1-cell rock formation. Indestructible.",
  coords: [0, 0],
  width: 1,
  height: 1,
  defaultCount: 2,
};

export const REEF_OBSTACLE: ObstacleTemplate = {
  id: "reef",
  title: "Reef",
  description: "A 2-cell horizontal reef. Indestructible.",
  coords: [0, 0],
  width: 2,
  height: 1,
  defaultCount: 1,
};

export const ISLAND_OBSTACLE: ObstacleTemplate = {
  id: "island",
  title: "Island",
  description: "A 2×2 island formation. Indestructible.",
  coords: [0, 0],
  width: 2,
  height: 2,
  defaultCount: 0,
};


export const ObstacleTemplateSet = createEntitySet<ObstacleTemplate>([
  ROCK_OBSTACLE,
  REEF_OBSTACLE,
  ISLAND_OBSTACLE,
], ROCK_OBSTACLE.id);

export const OBSTACLE_TEMPLATES = ObstacleTemplateSet.map;
export const getObstacleTemplate = ObstacleTemplateSet.getById;
export const DEFAULT_OBSTACLE_TEMPLATE = ObstacleTemplateSet.default;
