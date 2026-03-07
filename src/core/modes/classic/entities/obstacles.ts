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
  defaultCount: 2,
}) satisfies ObstacleTemplate;

export const ObstacleTemplateSet = createEntitySet<ObstacleTemplate>([
  ROCK_OBSTACLE,
], ROCK_OBSTACLE.id);

export const OBSTACLE_TEMPLATES = ObstacleTemplateSet.map;
export const getObstacleTemplate = ObstacleTemplateSet.getById;
export const DEFAULT_OBSTACLE_TEMPLATE = ObstacleTemplateSet.default;
