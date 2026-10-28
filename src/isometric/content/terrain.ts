import type { TerrainAppearance } from "../core/types";

/*
 * Game content: how each terrain material is drawn. The engine receives it through the scene
 * (`createScene(app, world, modules, { terrain: TERRAIN_APPEARANCE })`).
 */

/** Darkening per level below the highest elevation, for blocks above water. */
const HEIGHT_TINT_STEP = 0.05;

/** Green-yellow light on the top levels of grass and ground. */
const LAND_TOP_TINT = 0xe8ffb0;
/** Color multipliers chosen by broad seeded noise, so neighboring columns share subtle land tones. */
const LAND_NOISE_TINTS = {
  scale: 11,
  colors: [0xffffff, 0xfff5d8, 0xe5f3bd, 0xe5e9a8],
} as const;

/**
 * The terrain materials: grass and ground share the land tint (grass with flowers, sprouts or
 * fallen leaves on some columns), sand keeps its colour, water darkens with depth and has bands of
 * light drifting across it.
 */
export const TERRAIN_APPEARANCE: TerrainAppearance = {
  grass: {
    textureSource: "/assets/grass/block.svg",
    tint: { kind: "height", topTint: LAND_TOP_TINT, step: HEIGHT_TINT_STEP },
    noiseTints: LAND_NOISE_TINTS,
    // Ground cover is grouped by the seeded noise picker (grass clutter assets use `artifacts/grass_clutter.py`).
    variants: [
      { textureSource: "/assets/grass/block_flowers.svg", chance: 0.05 },
      { textureSource: "/assets/grass/block_flowers_2.svg", chance: 0.04 },
      { textureSource: "/assets/grass/block_wildflowers_red.svg", chance: 0.025 },
      { textureSource: "/assets/grass/block_wildflowers_white.svg", chance: 0.025 },
      { textureSource: "/assets/grass/block_sprouts.svg", chance: 0.07 },
      { textureSource: "/assets/grass/block_leaves.svg", chance: 0.04 },
      { textureSource: "/assets/grass/block_pebbles.svg", chance: 0.035 },
      { textureSource: "/assets/grass/block_mushrooms.svg", chance: 0.015 },
      { textureSource: "/assets/grass/block_bushes.svg", chance: 0.02 },
    ],
  },
  ground: {
    textureSource: "/assets/ground/block.svg",
    tint: { kind: "height", topTint: LAND_TOP_TINT, step: HEIGHT_TINT_STEP },
    noiseTints: LAND_NOISE_TINTS,
  },
  water: {
    textureSource: "/assets/water/block.svg",
    tint: { kind: "depth", step: 0.15 },
    // Soft light drifting across the water: three bands every two tiles, two tiles in 9 s; under
    // the first level, fainter and slower.
    bands: { count: 3, width: 0.45, alpha: 0.16, period: 9000, deepBelow: -1, deep: 0.45 },
  },
  // Neutral: the same height darkening as grass, without the green cast. Its top is half a block lower.
  sand: {
    textureSource: "/assets/sand/block.svg",
    tint: { kind: "height", topTint: 0xffffff, step: HEIGHT_TINT_STEP },
    topInset: 0.5,
  },
};
