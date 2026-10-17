import { describe, expect, it } from "vitest";
import { rgbToTint } from "./color";

describe("rgbToTint", () => {
  it.each([
    [{ r: 1, g: 1, b: 1 }, 0xffffff],
    [{ r: 0, g: 0, b: 0 }, 0x000000],
    [{ r: 1, g: 0.5, b: 0 }, 0xff8000],
    [{ r: 0.3, g: 0.36, b: 0.6 }, 0x4d5c99],
  ])("converts %o to a Pixi tint", (rgb, tint) => {
    expect(rgbToTint(rgb)).toBe(tint);
  });

  it("clamps channels outside [0, 1]", () => {
    expect(rgbToTint({ r: 2, g: -1, b: 0.5 })).toBe(0xff0080);
  });
});
