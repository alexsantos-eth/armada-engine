import type { TerrainAppearance } from "../core/types";

/*
 * Game content: how each terrain material is drawn. The engine receives it through the scene
 * (`createScene(app, world, modules, { terrain: TERRAIN_APPEARANCE })`).
 */

/** Darkening per level below the highest elevation, for blocks above water. */
const HEIGHT_TINT_STEP = 0.05;

/** Green-yellow light on the top levels of grass and ground. */
const LAND_TOP_TINT = 0xe8ffb0;

/** The terrain materials: grass and ground share the land tint, sand keeps its colour, water darkens with depth. */
export const TERRAIN_APPEARANCE: TerrainAppearance = {
  grass: {
    textureSource: "/assets/grass/block.svg",
    tint: { kind: "height", topTint: LAND_TOP_TINT, step: HEIGHT_TINT_STEP },
  },
  ground: {
    textureSource: "/assets/ground/block.svg",
    tint: { kind: "height", topTint: LAND_TOP_TINT, step: HEIGHT_TINT_STEP },
  },
  water: {
    textureSource: "/assets/water/block.svg",
    tint: { kind: "depth", step: 0.15 },
  },
  // Neutral: the same height darkening as grass, without the green cast. Its top is half a block lower.
  sand: {
    textureSource: "/assets/sand/block.svg",
    tint: { kind: "height", topTint: 0xffffff, step: HEIGHT_TINT_STEP },
    topInset: 0.5,
  },
};
