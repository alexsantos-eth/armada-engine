import { describe, expect, it } from "vitest";
import { replaceSvgColors } from "./svg";

describe("replaceSvgColors", () => {
  it("replaces configured fill and stroke colors while preserving other colors", () => {
    const svg = '<path fill="#9f4b2f" stroke="#B05334"/><path fill="#ffffff"/>';

    expect(replaceSvgColors(svg, {
      "#9f4b2f": "#245c4a",
      "#b05334": "#2f735d",
    })).toBe('<path fill="#245c4a" stroke="#2f735d"/><path fill="#ffffff"/>');
  });

  it("returns the original SVG when no replacements are configured", () => {
    const svg = '<path fill="#9f4b2f"/>';

    expect(replaceSvgColors(svg, {})).toBe(svg);
  });
});
