export type { ObstacleTemplate } from "../types/constants";
import type { ObstacleTemplate } from "../types/constants";

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

export const OBSTACLE_TEMPLATES: Record<string, ObstacleTemplate> = {
  rock: ROCK_OBSTACLE,
  reef: REEF_OBSTACLE,
  island: ISLAND_OBSTACLE,
};
