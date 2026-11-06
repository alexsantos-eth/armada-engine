import { describe, expect, it } from "vitest";
import type { EntityPatches } from "../../types";
import { Box, createNoiseField } from "../terrain";
import { createPatchChances, getPatchFactor, PATCH_EDGE } from "./patches";

const FOREST: EntityPatches = { field: "forest", scale: 8, threshold: 0.2 };

const columns = (minX: number, width: number) =>
  Array.from({ length: width }, (_, index) => new Box(minX + index, 3, { elevation: 1 }));

describe("getPatchFactor", () => {
  it("is outside below the threshold, whole past its edge and linear in between", () => {
    expect(getPatchFactor(FOREST, -1)).toBe(0);
    expect(getPatchFactor(FOREST, 0.2)).toBe(0);
    expect(getPatchFactor(FOREST, 0.2 + PATCH_EDGE / 2)).toBeCloseTo(0.5);
    expect(getPatchFactor(FOREST, 0.21 + PATCH_EDGE)).toBe(1);
    expect(getPatchFactor(FOREST, 1)).toBe(1);
    expect(getPatchFactor({ ...FOREST, outside: 0.2 }, -1)).toBeCloseTo(0.2);
    expect(getPatchFactor({ ...FOREST, outside: 0.2 }, 0.2 + PATCH_EDGE / 2)).toBeCloseTo(0.6);
  });
});

describe("createPatchChances", () => {
  it("samples the field of the world seed and the patch name at absolute positions", () => {
    const field = createNoiseField(5, "entity-patches:forest", { scale: 8 });
    const row = columns(-20, 60);
    const factors = createPatchChances(5)(FOREST, row);

    expect(Array.from(factors)).toEqual(row.map(({ x, y }) => Math.fround(getPatchFactor(FOREST, field(x, y)))));
    // Patches: some columns inside, some outside, the same in another call or another cut.
    expect(factors.some((factor) => factor === 0)).toBe(true);
    expect(factors.some((factor) => factor === 1)).toBe(true);
    expect(createPatchChances(5)(FOREST, row)).toEqual(factors);
    expect(createPatchChances(5)(FOREST, row.slice(10))).toEqual(factors.slice(10));
    expect(createPatchChances(6)(FOREST, row)).not.toEqual(factors);
  });

  it("shares a field between patches of one name and scale, whatever their threshold", () => {
    const chances = createPatchChances(5);
    const row = columns(0, 40);
    const open = { ...FOREST, threshold: -1 };

    expect(chances(open, row)).toEqual(createPatchChances(5)(open, row));
    expect(chances(FOREST, row)).toEqual(createPatchChances(5)(FOREST, row));
    // Another list of columns is sampled again.
    expect(chances(FOREST, columns(100, 40))).toEqual(createPatchChances(5)(FOREST, columns(100, 40)));
    expect(chances({ ...FOREST, field: "meadow" }, row)).not.toEqual(chances(FOREST, row));
  });
});
