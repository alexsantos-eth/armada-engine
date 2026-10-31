import { describe, expect, it } from "vitest";
import type { EntityDefinition } from "../../types";
import { EntityConfigError, validateEntityDefinitions } from "./validation";

const VALID: EntityDefinition = {
  id: "rock",
  textureSource: "/assets/rock/block.svg",
  height: 1,
  spawnChance: 0.1,
  surface: "grass",
};

const issuesOf = (definitions: readonly EntityDefinition[]): readonly string[] => {
  try {
    validateEntityDefinitions(definitions);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(EntityConfigError);
    return (error as EntityConfigError).issues;
  }
};

describe("validateEntityDefinitions", () => {
  it("accepts valid definitions, including every optional field", () => {
    expect(() =>
      validateEntityDefinitions([
        VALID,
        {
          ...VALID,
          id: "pier",
          length: 3,
          lengthAxis: "y",
          footprintSurfaces: ["water", "sand", "grass"],
          surfaceElevation: [0, 1],
          gap: 2,
          formation: { map: ["XX", "X."], minMembers: 2, rotate: true },
          patches: { field: "forest", scale: 20, threshold: 0.2, outside: 0.1 },
          settlementLot: { regionSize: 64, offset: { x: 24, y: 24 }, reservedPathWidth: 8 },
          contactShadow: false,
          reflectionSource: "/assets/pier/block_reflection.svg",
          colorReplacements: { "#9f4b2f": ["#111111", "#222222"], "#abc": ["#333", "#444"] },
          debug: true,
        },
        { ...VALID, id: "house", surfaceElevation: 0, colorReplacements: { "#000000": "#ffffff" } },
        { ...VALID, id: "tree", sway: { cut: 0.6, amplitude: 2, period: 3000 }, collision: 0.15 },
        { ...VALID, id: "dock", length: 3, collision: [1, 1, 0] },
      ]),
    ).not.toThrow();
    expect(() => validateEntityDefinitions([])).not.toThrow();
  });

  it("reports duplicated and empty ids", () => {
    expect(issuesOf([VALID, VALID, { ...VALID, id: " " }])).toEqual([
      'rock: id "rock" is declared more than once',
      "entity #2: id must not be empty",
    ]);
  });

  it("reports invalid numbers", () => {
    expect(
      issuesOf([
        {
          ...VALID,
          height: 0,
          length: 1.5,
          spawnChance: 2,
          gap: -1,
          surfaceElevation: [0.5],
        },
      ]),
    ).toEqual([
      "rock: height must be a positive integer (got 0)",
      "rock: length must be a positive integer (got 1.5)",
      "rock: spawnChance must be between 0 and 1 (got 2)",
      "rock: gap must be a non-negative integer (got -1)",
      "rock: surfaceElevation must contain integers (got 0.5)",
    ]);
    expect(issuesOf([{ ...VALID, spawnChance: Number.NaN, surfaceElevation: 1.5 }])).toEqual([
      "rock: spawnChance must be between 0 and 1 (got NaN)",
      "rock: surfaceElevation must contain integers (got 1.5)",
    ]);
  });

  it("reports invalid surfaces, axes and texture sources", () => {
    expect(
      issuesOf([
        {
          ...VALID,
          textureSource: "rock.svg",
          surface: "lava" as never,
          lengthAxis: "z" as never,
          length: 2,
          footprintSurfaces: ["grass", "snow" as never, "sand"],
        },
      ]),
    ).toEqual([
      'rock: textureSource must be an absolute SVG path such as "/assets/<name>/block.svg" (got "rock.svg")',
      'rock: surface must be one of grass, water, sand, ground, path (got "lava")',
      'rock: lengthAxis must be "x" or "y" (got "z")',
      "rock: footprintSurfaces lists 3 surfaces for a footprint of 2 blocks",
      'rock: footprintSurfaces[1] must be one of grass, water, sand, ground, path (got "snow")',
    ]);
  });

  it("reports invalid formations", () => {
    expect(
      issuesOf([
        { ...VALID, formation: { map: ["X?"] } },
        { ...VALID, id: "b", formation: { map: ["XX"], minMembers: 3 } },
        { ...VALID, id: "c", formation: { map: ["XX"], minMembers: 0 } },
      ]),
    ).toEqual([
      'rock: formation: Invalid formation map character "?" at row 0, column 1: use "X" or ".".',
      "b: formation.minMembers must be an integer between 1 and 2 (got 3)",
      "c: formation.minMembers must be an integer between 1 and 2 (got 0)",
    ]);
  });

  it("reports invalid patches", () => {
    expect(
      issuesOf([
        { ...VALID, patches: { field: " ", scale: 0, threshold: 1.5, outside: -0.1 } },
        { ...VALID, id: "b", patches: { field: "forest", scale: Infinity, threshold: Number.NaN, outside: 2 } },
        { ...VALID, id: "c", patches: { field: "forest", scale: 4, threshold: -1 } },
      ]),
    ).toEqual([
      "rock: patches.field must not be empty",
      "rock: patches.scale must be a positive number (got 0)",
      "rock: patches.threshold must be between -1 and 1 (got 1.5)",
      "rock: patches.outside must be between 0 and 1 (got -0.1)",
      "b: patches.scale must be a positive number (got Infinity)",
      "b: patches.threshold must be between -1 and 1 (got NaN)",
      "b: patches.outside must be between 0 and 1 (got 2)",
    ]);
  });

  it("reports invalid settlement lots", () => {
    expect(issuesOf([{ ...VALID, settlementLot: { regionSize: 0, offset: { x: 64, y: -1 } } }])).toEqual([
      "rock: settlementLot.regionSize must be a positive integer (got 0)",
      "rock: settlementLot.offset.x must be an integer inside the region (got 64)",
      "rock: settlementLot.offset.y must be an integer inside the region (got -1)",
    ]);
    expect(
      issuesOf([{ ...VALID, settlementLot: { regionSize: 8, offset: { x: 2, y: 2 }, reservedPathWidth: 8 } }]),
    ).toEqual(["rock: settlementLot.reservedPathWidth must be a positive integer smaller than the region (got 8)"]);
    const lot = { regionSize: 8, offset: { x: 2, y: 2 } };
    expect(
      issuesOf([
        { ...VALID, settlementLot: { ...lot, zone: { field: " ", scale: 0, below: 2 } } },
        { ...VALID, id: "b", settlementLot: { ...lot, zone: { field: "forest", scale: Infinity, below: Number.NaN } } },
        { ...VALID, id: "c", settlementLot: { ...lot, zone: { field: "forest", scale: 4, below: -1 } } },
      ]),
    ).toEqual([
      "rock: settlementLot.zone.field must not be empty",
      "rock: settlementLot.zone.scale must be a positive number (got 0)",
      "rock: settlementLot.zone.below must be between -1 and 1 (got 2)",
      "b: settlementLot.zone.scale must be a positive number (got Infinity)",
      "b: settlementLot.zone.below must be between -1 and 1 (got NaN)",
    ]);
  });

  it("reports invalid color replacements", () => {
    expect(
      issuesOf([
        {
          ...VALID,
          colorReplacements: {
            red: "#ff0000",
            "#000000": "blue",
            "#111111": [],
            "#222222": ["#aaaaaa", "#bbbbbb"],
            "#333333": ["#cccccc"],
          },
        },
      ]),
    ).toEqual([
      'rock: colorReplacements key "red" must be a hex color',
      'rock: colorReplacements["#000000"] must be hex colors (got "blue")',
      'rock: colorReplacements["#111111"] must not be an empty list',
      "rock: colorReplacements variation lists must all have the same length (got 2, 1)",
    ]);
  });

  it("reports a reflection SVG on one tile or that is not an absolute SVG path", () => {
    expect(issuesOf([{ ...VALID, reflectionSource: "/assets/rock/block_reflection.svg" }])).toEqual([
      "rock: reflectionSource is for entities of several tiles (got length 1)",
    ]);
    expect(issuesOf([{ ...VALID, length: 2, reflectionSource: "rock.png" }])).toEqual([
      'rock: reflectionSource must be an absolute SVG path such as "/assets/<name>/block_reflection.svg" (got "rock.png")',
    ]);
  });

  it("reports invalid sway", () => {
    expect(issuesOf([{ ...VALID, length: 2, sway: { cut: 0, amplitude: -1, period: 0 } }])).toEqual([
      "rock: sway is for single-tile entities (got length 2)",
      "rock: sway.cut must be between 0 and 1, both excluded (got 0)",
      "rock: sway.amplitude must be a non-negative number (got -1)",
      "rock: sway.period must be a positive number (got 0)",
    ]);
    expect(issuesOf([{ ...VALID, sway: { cut: 1, amplitude: Infinity, period: Number.NaN } }])).toEqual([
      "rock: sway.cut must be between 0 and 1, both excluded (got 1)",
      "rock: sway.amplitude must be a non-negative number (got Infinity)",
      "rock: sway.period must be a positive number (got NaN)",
    ]);
  });

  it("reports invalid collision", () => {
    expect(issuesOf([{ ...VALID, collision: 1.5 }])).toEqual(["rock: collision must be between 0 and 1 (got 1.5)"]);
    expect(issuesOf([{ ...VALID, length: 2, collision: [1, -0.1, Number.NaN] }])).toEqual([
      "rock: collision lists 3 sizes for a footprint of 2 blocks",
      "rock: collision[1] must be between 0 and 1 (got -0.1)",
      "rock: collision[2] must be between 0 and 1 (got NaN)",
    ]);
  });

  it("lists every issue at once in the error message", () => {
    expect(() => validateEntityDefinitions([{ ...VALID, height: 0, spawnChance: -1 }])).toThrow(
      "Invalid entity configuration:\n" +
        "- rock: height must be a positive integer (got 0)\n" +
        "- rock: spawnChance must be between 0 and 1 (got -1)",
    );
  });
});
