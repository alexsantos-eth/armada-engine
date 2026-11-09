import { describe, expect, it } from "vitest";
import {
  CONNECTION_MASKS,
  createVariantPicker,
  hashColumn,
  VARIANT_PATCH_FILL,
  validateTerrainConnections,
  validateTerrainVariants,
} from "./variants";

const VARIANTS = [
  { textureSource: "/assets/grass/block_flowers.svg", chance: 0.1 },
  { textureSource: "/assets/grass/block_leaves.svg", chance: 0.2 },
];

describe("validateTerrainVariants", () => {
  it("accepts valid variants, and none", () => {
    expect(validateTerrainVariants(VARIANTS)).toEqual([]);
    expect(validateTerrainVariants([])).toEqual([]);
  });

  it("reports bad sources, chances out of [0, 1] and chances that add up to more than 1", () => {
    expect(
      validateTerrainVariants([
        { textureSource: "flowers.png", chance: 0.5 },
        { textureSource: "/assets/a.svg", chance: -0.1 },
        { textureSource: "/assets/b.svg", chance: 0.8 },
        { textureSource: "/assets/sheet.svg", chance: 0, frame: { x: -1, y: 0, width: 0, height: 10 } },
      ]),
    ).toEqual([
      'variants[0].textureSource must be an absolute SVG path (got "flowers.png")',
      "variants[1].chance must be in [0, 1] (got -0.1)",
      "variants[3].frame must have non-negative coordinates and positive dimensions",
      "the chances of the variants add up to more than 1 (got 1.2000000000000002)",
    ]);
  });
});

describe("validateTerrainConnections", () => {
  const frames = Array.from({ length: CONNECTION_MASKS }, (_, mask) => ({ x: mask * 10, y: 0, width: 10, height: 10 }));

  it("accepts an SVG sheet with one valid frame per mask", () => {
    expect(CONNECTION_MASKS).toBe(16);
    expect(validateTerrainConnections({ textureSource: "/assets/path/tiles.svg", frames })).toEqual([]);
  });

  it("reports a wrong source, a missing mask and invalid frames", () => {
    const broken = [...frames.slice(0, 14), { x: -1, y: 0, width: 10, height: 10 }];
    expect(validateTerrainConnections({ textureSource: "path.png", frames: broken })).toEqual([
      'connections.textureSource must be an absolute SVG path (got "path.png")',
      "connections.frames must have one frame per mask, 16 (got 15)",
      "connections.frames[14] must have non-negative coordinates and positive dimensions",
    ]);
  });
});

describe("hashColumn", () => {
  it("is deterministic, in [0, 1), and depends on the seed and on both coordinates", () => {
    expect(hashColumn(1337, 4, -9)).toBe(hashColumn(1337, 4, -9));
    expect(hashColumn(1337, 4, -9)).not.toBe(hashColumn(7, 4, -9));
    expect(hashColumn(1337, 4, -9)).not.toBe(hashColumn(1337, -9, 4));
    for (let x = -50; x < 50; x += 1) {
      const value = hashColumn(1337, x, x * 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("createVariantPicker", () => {
  const SIZE = 240;
  /** The variant of every column of a SIZE × SIZE square away from the calibration grid. */
  const pickAll = (variants: Parameters<typeof createVariantPicker>[0], seed = 1337) => {
    const pick = createVariantPicker(variants, seed, "test");
    return Array.from({ length: SIZE * SIZE }, (_, index) =>
      pick(1000 + (index % SIZE), -700 + Math.floor(index / SIZE)),
    );
  };
  const shares = (picks: number[], count: number) =>
    Array.from({ length: count + 1 }, (_, index) => picks.filter((pick) => pick === index - 1).length / picks.length);

  it("gives each variant about its chance of the columns, and the rest the material's own", () => {
    const [none, flowers, leaves] = shares(pickAll(VARIANTS), 2);

    expect(none).toBeCloseTo(0.7, 1);
    expect(flowers).toBeCloseTo(0.1, 1);
    expect(leaves).toBeCloseTo(0.2, 1);
  });

  it("groups them: a decorated column mostly has decorated neighbours of the same kind", () => {
    const picks = pickAll(VARIANTS);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -2 : picks[y * SIZE + x]);
    let decorated = 0;
    let sameAround = 0;
    let decoratedAround = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const pick = at(x, y);
        if (pick < 0) continue;
        decorated += 1;
        const around = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1), at(x - 1, y - 1), at(x + 1, y + 1)];
        decoratedAround += around.filter((other) => other >= 0).length / around.length;
        sameAround +=
          around.filter((other) => other === pick).length / Math.max(1, around.filter((o) => o >= 0).length);
      }
    }

    // Scattered at random, 30 % of the neighbours would be decorated; in clumps, many more.
    expect(decoratedAround / decorated).toBeGreaterThan(0.45);
    // And nearly always of the same kind as their neighbours.
    expect(sameAround / decorated).toBeGreaterThan(0.8);
  });

  it("is deterministic and depends on the seed", () => {
    expect(pickAll(VARIANTS)).toEqual(pickAll(VARIANTS));
    expect(pickAll(VARIANTS, 7)).not.toEqual(pickAll(VARIANTS));
  });

  it("keeps the material's own texture without chances, and gives the rest to the last variant that shows", () => {
    expect(pickAll([]).every((pick) => pick === -1)).toBe(true);
    expect(pickAll([{ ...VARIANTS[0], chance: 0 }]).every((pick) => pick === -1)).toBe(true);
    const picks = pickAll([VARIANTS[0], { ...VARIANTS[1], chance: 0 }]);

    expect(picks.some((pick) => pick === 0)).toBe(true);
    expect(picks.every((pick) => pick !== 1)).toBe(true);
  });

  it("decorates every clump when the chances are more than a clump can hold", () => {
    const [none] = shares(pickAll([{ ...VARIANTS[0], chance: 0.9 }]), 1);

    expect(none).toBeCloseTo(1 - VARIANT_PATCH_FILL, 1);
  });
});
