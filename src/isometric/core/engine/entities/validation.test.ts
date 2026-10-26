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
          colorReplacements: { "#9f4b2f": ["#111111", "#222222"], "#abc": ["#333", "#444"] },
          debug: true,
        },
        { ...VALID, id: "house", surfaceElevation: 0, colorReplacements: { "#000000": "#ffffff" } },
        { ...VALID, id: "tree", sway: { cut: 0.6, amplitude: 2, period: 3000 } },
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
      'rock: surface must be one of grass, water, sand (got "lava")',
      'rock: lengthAxis must be "x" or "y" (got "z")',
      "rock: footprintSurfaces lists 3 surfaces for a footprint of 2 blocks",
      'rock: footprintSurfaces[1] must be one of grass, water, sand (got "snow")',
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

  it("lists every issue at once in the error message", () => {
    expect(() => validateEntityDefinitions([{ ...VALID, height: 0, spawnChance: -1 }])).toThrow(
      "Invalid entity configuration:\n" +
        "- rock: height must be a positive integer (got 0)\n" +
        "- rock: spawnChance must be between 0 and 1 (got -1)",
    );
  });
});
