import type { EntityDefinition, EntityFormation } from "../core/types";

/*
 * Game content: the entities that populate the world. This is data, not engine code — the
 * engine receives it through `generateWorld({ entityDefinitions })` and validates it with
 * `validateEntityDefinitions()`. Add or tune entities here without touching `core/`.
 */

/**
 * Groves of three trees of the same kind, in an L rotated at random. Trees with this
 * formation roll `spawnChance` once per grove, so it is a third of the single-tree value.
 */
const TREE_GROVE_FORMATION: EntityFormation = {
  map: ["XX", "X."],
  rotate: true,
};

/**
 * What a tree blocks: only its trunk, a square of this side centred on its block (a fraction of
 * the block). Every tree's trunk is about the same width (~0.11–0.12 of a block in the assets),
 * with a little margin so the player does not seem to walk into the bark.
 */
export const TREE_TRUNK_COLLISION = 0.15;

/** Small patches of undergrowth, using the same footprint and rotation as a tree grove. */
const BUSH_PATCH_FORMATION: EntityFormation = {
  map: ["XX", "X."],
  rotate: true,
};

/** Three reserved house lots around an eight-cell cross for future paths and a small plaza. */
const SETTLEMENT_LOT = {
  regionSize: 64,
  offset: { x: 21, y: 21 },
} as const;

/**
 * What a pier blocks, block by block from the water end: the block over the water and the one
 * on the sand, but not its end on the grass, which is walked over.
 */
const PIER_COLLISION = [1, 1, 0] as const;

const HOUSE_COLOR_REPLACEMENTS = {
  "#8f442a": ["#815610", "#722018", "#1c4778"],
  "#93452c": ["#895c12", "#81271d", "#225487"],
  "#9e4b2f": ["#996816", "#972d20", "#28609a"],
  "#a24c31": ["#9e6d17", "#a13224", "#2f6ca6"],
  "#a54d31": ["#a27018", "#aa3828", "#3477b0"],
  "#a94f32": ["#a6751a", "#b43d2c", "#3c80bb"],
  "#c15b39": ["#c18920", "#cf4a35", "#4a98dc"],
  "#c55d3b": ["#c58e22", "#d65039", "#55a1e4"],
  "#c85e3b": ["#cc9625", "#dd563e", "#60a9eb"],
  "#cd613d": ["#d19c28", "#e05d43", "#6ab1ef"],
  "#cf623e": ["#d5a32b", "#e66349", "#73b9f2"],
  "#d4643f": ["#d9aa31", "#ed6d52", "#80c1f5"],
} as const;

/** Slate-blue roof of `house_balcony`: blue, red, green, ochre. */
const HOUSE_BALCONY_ROOF_COLOR_REPLACEMENTS = {
  "#4f78b0": ["#4f78b0", "#b5473a", "#3f8a6a", "#c08a2e"],
  "#4c74aa": ["#4c74aa", "#af4538", "#3d8566", "#b9852c"],
  "#4970a4": ["#4970a4", "#a84236", "#3b8063", "#b3802b"],
  "#3f5f8c": ["#3f5f8c", "#90392e", "#326e55", "#996e25"],
  "#3c5c87": ["#3c5c87", "#8b372c", "#316a51", "#946a23"],
  "#37537a": ["#37537a", "#7e3228", "#2c5f4a", "#855f20"],
} as const;

/** Violet roof of `tower`: violet, teal, red, blue. */
const TOWER_ROOF_COLOR_REPLACEMENTS = {
  "#7a5aa8": ["#7a5aa8", "#2f7d86", "#a8433f", "#3b5f9e"],
  "#7657a2": ["#7657a2", "#2d7981", "#a2413d", "#395c98"],
  "#71549c": ["#71549c", "#2c747c", "#9c3e3a", "#375893"],
  "#614886": ["#614886", "#26646b", "#863532", "#2f4c7e"],
  "#5e4581": ["#5e4581", "#245f67", "#813331", "#2d4979"],
  "#553e74": ["#553e74", "#20565d", "#742e2b", "#28426d"],
} as const;

/** Slate flat roof and parapet of the apartment blocks: slate, teal, brick, sand. */
const APARTMENTS_ROOF_COLOR_REPLACEMENTS = {
  "#6f7d8c": ["#6f7d8c", "#4f9a94", "#a5543f", "#c7a25f"],
  "#6b7987": ["#6b7987", "#4c948f", "#9f513d", "#c09c5c"],
  "#5d6875": ["#5d6875", "#42817b", "#8a4634", "#a6874f"],
  "#586470": ["#586470", "#3f7a76", "#834332", "#9e814c"],
  "#555f6b": ["#555f6b", "#3c7671", "#7e4031", "#987c49"],
  "#525c68": ["#525c68", "#3a716d", "#7a3e2f", "#937846"],
  "#4c5661": ["#4c5661", "#376b67", "#723a2c", "#8a7042"],
} as const;

/** Gold crown and antenna of `skyscraper`: gold, silver, red, blue. */
const SKYSCRAPER_ROOF_COLOR_REPLACEMENTS = {
  "#c9a43a": ["#c9a43a", "#b9bec4", "#c4553c", "#3f6fb0"],
  "#c29e38": ["#c29e38", "#b3b7bd", "#bd523a", "#3d6baa"],
  "#bb9936": ["#bb9936", "#acb1b6", "#b64f38", "#3b67a4"],
  "#a0822e": ["#a0822e", "#94979d", "#9d4430", "#32588c"],
  "#9a7d2c": ["#9a7d2c", "#8d9296", "#96412e", "#315587"],
  "#8c7128": ["#8c7128", "#818488", "#883b29", "#2c4d7a"],
} as const;

/** Terracotta roof and awning of the hotels: terracotta, blue, green, violet. */
const HOTEL_ROOF_COLOR_REPLACEMENTS = {
  "#c4553c": ["#c4553c", "#3f6f9e", "#5c8f4a", "#7a5aa8"],
  "#bd523a": ["#bd523a", "#3d6b98", "#598a47", "#7657a2"],
  "#bb5139": ["#bb5139", "#3c6a97", "#588847", "#7456a0"],
  "#b64f38": ["#b64f38", "#3a6793", "#558545", "#71549c"],
  "#b54e37": ["#b54e37", "#3a6792", "#558444", "#71539b"],
  "#ae4b35": ["#ae4b35", "#38638c", "#527f42", "#6c5095"],
  "#9c4430": ["#9c4430", "#32587d", "#49713a", "#614785"],
  "#96412e": ["#96412e", "#31567a", "#466e39", "#5e4581"],
  "#95412e": ["#95412e", "#305579", "#466d39", "#5d4480"],
  "#913f2c": ["#913f2c", "#2f5275", "#446937", "#5a437c"],
  "#8f3e2c": ["#8f3e2c", "#2e5173", "#446836", "#59427a"],
  "#883a29": ["#883a29", "#2c4d6e", "#406333", "#553e74"],
  "#823828": ["#823828", "#294a68", "#3d5e31", "#513b6f"],
} as const;

/** Copper terrace and roof of the office blocks: green copper, bronze, slate, red. */
const OFFICE_ROOF_COLOR_REPLACEMENTS = {
  "#4e8f78": ["#4e8f78", "#c27a3a", "#6f7d8c", "#a8433f"],
  "#4b8a74": ["#4b8a74", "#bb7638", "#6b7987", "#a2413d"],
  "#498570": ["#498570", "#b47136", "#677482", "#9c3e3b"],
  "#3e725f": ["#3e725f", "#9b612e", "#596470", "#863532"],
  "#3b6e5c": ["#3b6e5c", "#945e2c", "#56606b", "#813331"],
  "#366353": ["#366353", "#865528", "#4c5661", "#742f2b"],
} as const;

/** Every entity the world generator can place, in placement priority order. */
export const ENTITY_CONFIG: readonly EntityDefinition[] = [
  {
    id: "pier_x_reverse",
    textureSource: "/assets/pier/block_1x3_over_water.svg",
    height: 1,
    length: 3,
    lengthAxis: "x",
    footprintSurfaces: ["water", "sand", "grass"],
    gap: 10,
    spawnChance: 0.2,
    surface: "sand",
    surfaceElevation: 0,
    collision: PIER_COLLISION,
  },
  {
    id: "pier_y_reverse",
    textureSource: "/assets/pier/block_3x1_over_water.svg",
    height: 1,
    length: 3,
    lengthAxis: "y",
    footprintSurfaces: ["water", "sand", "grass"],
    gap: 10,
    spawnChance: 0.2,
    surface: "sand",
    surfaceElevation: 0,
    collision: PIER_COLLISION,
  },
  {
    id: "tree",
    textureSource: "/assets/tree/block.svg",
    height: 2,
    spawnChance: 0.01,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.58, amplitude: 1.5, period: 3400 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_2",
    textureSource: "/assets/tree/block_2.svg",
    height: 2,
    spawnChance: 0.015,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.69, amplitude: 1.5, period: 3800 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_3",
    textureSource: "/assets/tree/block_3.svg",
    height: 2,
    spawnChance: 0.006,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.76, amplitude: 1, period: 3000 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_4",
    textureSource: "/assets/tree/block_4.svg",
    height: 2,
    spawnChance: 0.01,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.61, amplitude: 2, period: 4200 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_5",
    textureSource: "/assets/tree/block_5.svg",
    height: 2,
    spawnChance: 0.01,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.67, amplitude: 2, period: 3200 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_6",
    textureSource: "/assets/tree/block_6.svg",
    height: 2,
    spawnChance: 0.01,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.61, amplitude: 1.5, period: 3600 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_7",
    textureSource: "/assets/tree/block_7.svg",
    height: 2,
    spawnChance: 0.004,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.72, amplitude: 1, period: 2800 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "tree_8",
    textureSource: "/assets/tree/block_8.svg",
    height: 2,
    spawnChance: 0.004,
    gap: 1,
    surface: "grass",
    sway: { cut: 0.74, amplitude: 1.5, period: 3000 },
    collision: TREE_TRUNK_COLLISION,
    formation: TREE_GROVE_FORMATION,
  },
  {
    id: "statue",
    textureSource: "/assets/statue/block.svg",
    height: 2,
    spawnChance: 0.0005,
    surface: "grass",
  },
  {
    id: "house",
    textureSource: "/assets/house/block.svg",
    height: 1,
    length: 1,
    spawnChance: 0.9,
    gap: 2,
    surface: "grass",
    surfaceElevation: [1, 2],
    colorReplacements: HOUSE_COLOR_REPLACEMENTS,
    settlementLot: SETTLEMENT_LOT,
  },
  {
    id: "house_2x1",
    textureSource: "/assets/house/block_2x1.svg",
    height: 2,
    length: 1,
    spawnChance: 0.9,
    gap: 2,
    surface: "grass",
    surfaceElevation: [1, 2],
    colorReplacements: HOUSE_COLOR_REPLACEMENTS,
    settlementLot: { regionSize: 64, offset: { x: 39, y: 21 } },
  },
  {
    id: "house_balcony",
    textureSource: "/assets/house/block_balcony.svg",
    height: 2,
    length: 1,
    gap: 2,
    spawnChance: 0.9,
    surface: "grass",
    surfaceElevation: [1, 2],
    colorReplacements: HOUSE_BALCONY_ROOF_COLOR_REPLACEMENTS,
    settlementLot: { regionSize: 64, offset: { x: 21, y: 39 } },
  },
  {
    id: "tower",
    textureSource: "/assets/building/block_tower.svg",
    height: 3,
    length: 1,
    gap: 1,
    spawnChance: 0.01,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: TOWER_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "apartments_x",
    textureSource: "/assets/building/block_apartments_1x2.svg",
    height: 3,
    length: 2,
    lengthAxis: "x",
    gap: 2,
    spawnChance: 0.008,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: APARTMENTS_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "apartments_y",
    textureSource: "/assets/building/block_apartments_2x1.svg",
    height: 3,
    length: 2,
    lengthAxis: "y",
    gap: 2,
    spawnChance: 0.008,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: APARTMENTS_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "skyscraper",
    textureSource: "/assets/building/block_skyscraper.svg",
    height: 6,
    length: 1,
    gap: 2,
    spawnChance: 0.004,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: SKYSCRAPER_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "hotel_x",
    textureSource: "/assets/building/block_hotel_1x2.svg",
    height: 4,
    length: 2,
    lengthAxis: "x",
    gap: 2,
    spawnChance: 0.004,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: HOTEL_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "hotel_y",
    textureSource: "/assets/building/block_hotel_2x1.svg",
    height: 4,
    length: 2,
    lengthAxis: "y",
    gap: 2,
    spawnChance: 0.004,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: HOTEL_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "office_x",
    textureSource: "/assets/building/block_office_1x3.svg",
    height: 5,
    length: 3,
    lengthAxis: "x",
    gap: 2,
    spawnChance: 0.003,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: OFFICE_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "office_y",
    textureSource: "/assets/building/block_office_3x1.svg",
    height: 5,
    length: 3,
    lengthAxis: "y",
    gap: 2,
    spawnChance: 0.003,
    surface: "grass",
    surfaceElevation: 0,
    colorReplacements: OFFICE_ROOF_COLOR_REPLACEMENTS,
  },
  {
    id: "boat",
    textureSource: "/assets/boat/block_2.svg",
    height: 1,
    length: 2,
    gap: 10,
    lengthAxis: "y",
    spawnChance: 0.01,
    surfaceElevation: -1,
    surface: "water",
  },
  {
    id: "bush",
    textureSource: "/assets/bush/block.svg",
    height: 1,
    length: 1,
    spawnChance: 0.008,
    gap: 1,
    surfaceElevation: 0,
    surface: "grass",
    formation: BUSH_PATCH_FORMATION,
  },
];
