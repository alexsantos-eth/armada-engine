import type { ObstacleTemplate } from "../../../types/constants";
import { createEntitySet } from "../../../tools/constants";

export type { ObstacleTemplate } from "../../../types/constants";

export const ROCK_OBSTACLE = Object.freeze({
  id: "rock",
  title: "Rock",
  description: "A small 1-cell rock formation. Indestructible.",
  coords: [0, 0] as [number, number],
  width: 1,
  height: 1,
  defaultCount: 3,
}) satisfies ObstacleTemplate;

export const ISLAND_OBSTACLE = Object.freeze({
  id: "island",
  title: "Island",
  description: "A small 2-cell island formation. Indestructible.",
  coords: [0, 0] as [number, number],
  width: 2,
  height: 2,
  defaultCount: 1,
}) satisfies ObstacleTemplate;

export const ObstacleTemplateSet = createEntitySet<ObstacleTemplate>(
  [ROCK_OBSTACLE, ISLAND_OBSTACLE],
  ROCK_OBSTACLE.id,
);

export const OBSTACLES = ObstacleTemplateSet.values;
export const getObstacleTemplate = ObstacleTemplateSet.getById;
export const DEFAULT_OBSTACLE_TEMPLATE = ObstacleTemplateSet.default;
