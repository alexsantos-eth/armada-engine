import { describe, expect, it } from "vitest";
import { isWithinViewport } from "./culling";

describe("isWithinViewport", () => {
  it("culls points outside the viewport margin", () => {
    expect(isWithinViewport(0, 0, 100, 100)).toBe(true);
    expect(isWithinViewport(-120, 100, 100, 100)).toBe(true);
    expect(isWithinViewport(-121, 100, 100, 100)).toBe(false);
    expect(isWithinViewport(221, 100, 100, 100)).toBe(false);
  });
});
