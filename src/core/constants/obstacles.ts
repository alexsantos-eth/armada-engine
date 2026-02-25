import type { GameObstacle } from "../types/common";

/**
 * An obstacle template — extends GameObstacle with metadata and a `defaultCount`
 * for how many of this variant are placed per board in a default game.
 * Add new variants here and the rest of the engine picks them up automatically.
 */
export interface ObstacleTemplate extends GameObstacle {
  /** Unique string identifier for the obstacle variant. */
  id: string;
  /** Human-readable name. */
  title: string;
  /** Description of the obstacle. */
  description?: string;
  /** How many of this obstacle variant are placed per board in a default game. */
  defaultCount: number;
}

/**
 * Rock — a compact 1×1 indestructible obstacle.
 *
 * Layout:
 *   X
 */
export const ROCK_OBSTACLE: ObstacleTemplate = {
  id: "rock",
  title: "Rock",
  description: "A small 1-cell rock formation. Indestructible.",
  coords: [0, 0],
  width: 1,
  height: 1,
  defaultCount: 2,
};

/**
 * Reef — a horizontal 2×1 indestructible obstacle.
 *
 * Layout:
 *   X X
 */
export const REEF_OBSTACLE: ObstacleTemplate = {
  id: "reef",
  title: "Reef",
  description: "A 2-cell horizontal reef. Indestructible.",
  coords: [0, 0],
  width: 2,
  height: 1,
  defaultCount: 1,
};

/**
 * Island — a 2×2 indestructible obstacle that blocks a larger area.
 *
 * Layout:
 *   X X
 *   X X
 */
export const ISLAND_OBSTACLE: ObstacleTemplate = {
  id: "island",
  title: "Island",
  description: "A 2×2 island formation. Indestructible.",
  coords: [0, 0],
  width: 2,
  height: 2,
  defaultCount: 0,
};

/**
 * All predefined obstacle templates, keyed by variant id.
 * Add new entries here to register them with the engine.
 */
export const OBSTACLE_TEMPLATES: Record<string, ObstacleTemplate> = {
  rock: ROCK_OBSTACLE,
  reef: REEF_OBSTACLE,
  island: ISLAND_OBSTACLE,
};
