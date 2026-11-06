import { describe, expect, it } from "vitest";
import { compareDrawKeys, getDrawDepth } from "./order";

describe("pure scene order", () => {
  it("uses the anchor by default and moves a footprint tile along its axis", () => {
    const input = { x: 4, baseScreenY: 100, elevation: 1 };
    expect(getDrawDepth(input, 20)).toBeCloseTo(100.0014);
    expect(getDrawDepth(input, 20, 2, "x")).toBeCloseTo(80.0016);
    expect(getDrawDepth(input, 20, 2, "y")).toBeCloseTo(80.0014);
  });

  it("compares depth before layer and keeps equal keys equal", () => {
    expect(compareDrawKeys({ depth: -1, layer: 4 }, { depth: 0, layer: 0 })).toBeLessThan(0);
    expect(compareDrawKeys({ depth: 0, layer: 3 }, { depth: 0, layer: 1 })).toBeGreaterThan(0);
    expect(compareDrawKeys({ depth: 0, layer: 1 }, { depth: 0, layer: 1 })).toBe(0);
  });
});
