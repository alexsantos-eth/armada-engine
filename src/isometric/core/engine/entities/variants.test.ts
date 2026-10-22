import { describe, expect, it, vi } from "vitest";
import { getColorVariationCount, pickColorVariation } from "./variants";

describe("getColorVariationCount", () => {
  it("counts the variations of the first list, or zero without lists", () => {
    expect(getColorVariationCount({ "#000000": "#ffffff" })).toBe(0);
    expect(getColorVariationCount({ "#000000": "#ffffff", "#111111": ["#a", "#b", "#c"] })).toBe(3);
    expect(getColorVariationCount(undefined)).toBe(0);
  });
});

describe("pickColorVariation", () => {
  it("returns 0 without variation lists and does not consume random", () => {
    const random = vi.fn(() => 0.5);

    expect(pickColorVariation({ "#000000": "#ffffff" }, random)).toBe(0);
    expect(pickColorVariation(undefined, random)).toBe(0);
    expect(random).not.toHaveBeenCalled();
  });

  it("picks an index within the variation count", () => {
    const replacements = { "#000000": ["#a", "#b", "#c"] };

    expect(pickColorVariation(replacements, () => 0)).toBe(0);
    expect(pickColorVariation(replacements, () => 0.5)).toBe(1);
    expect(pickColorVariation(replacements, () => 0.9999)).toBe(2);
    expect(pickColorVariation(replacements, () => 1)).toBe(2);
  });
});
