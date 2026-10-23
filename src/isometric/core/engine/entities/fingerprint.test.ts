import { describe, expect, it } from "vitest";
import type { EntityDefinition } from "../../types";
import { fingerprintEntityDefinitions } from "./fingerprint";

const ROCK: EntityDefinition = {
  id: "rock",
  textureSource: "/assets/rock/block.svg",
  height: 1,
  spawnChance: 0.3,
  surface: "grass",
};
const TREE: EntityDefinition = {
  id: "tree",
  textureSource: "/assets/tree/block.svg",
  height: 2,
  spawnChance: 0.1,
  surface: "grass",
  colorReplacements: { "#000000": ["#111111", "#222222"] },
};

describe("fingerprintEntityDefinitions", () => {
  it("is eight hex digits, the same for equal definitions", () => {
    const fingerprint = fingerprintEntityDefinitions([ROCK, TREE]);

    expect(fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprintEntityDefinitions([{ ...ROCK }, structuredClone(TREE)])).toBe(fingerprint);
    expect(fingerprintEntityDefinitions([])).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes with anything that changes what is generated", () => {
    const fingerprint = fingerprintEntityDefinitions([ROCK, TREE]);
    const changed = [
      [ROCK],
      [ROCK, TREE, { ...ROCK, id: "stone" }],
      [{ ...ROCK, spawnChance: 0.31 }, TREE],
      [ROCK, { ...TREE, gap: 1 }],
      [ROCK, { ...TREE, colorReplacements: { "#000000": ["#111111", "#333333"] } }],
      // The first definition that claims a column keeps it: the order matters too.
      [TREE, ROCK],
    ];

    changed.forEach((definitions) => expect(fingerprintEntityDefinitions(definitions)).not.toBe(fingerprint));
  });

  it("ignores optional fields left undefined", () => {
    expect(fingerprintEntityDefinitions([{ ...ROCK, gap: undefined }])).toBe(fingerprintEntityDefinitions([ROCK]));
  });
});
