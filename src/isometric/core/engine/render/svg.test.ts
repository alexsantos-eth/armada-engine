import { describe, expect, it, vi } from "vitest";
import {
  createSvgColorVariant,
  getColorVariationCount,
  pickColorVariation,
  replaceSvgColors,
} from "./svg";

describe("replaceSvgColors", () => {
  it("replaces configured fill and stroke colors while preserving other colors", () => {
    const svg = '<path fill="#9f4b2f" stroke="#B05334"/><path fill="#ffffff"/>';

    expect(replaceSvgColors(svg, {
      "#9f4b2f": "#245c4a",
      "#b05334": "#2f735d",
    })).toBe('<path fill="#245c4a" stroke="#2f735d"/><path fill="#ffffff"/>');
  });

  it("selects a color from each configured variation list", () => {
    const svg = '<path fill="#9f4b2f"/><path fill="#9f4b2f" stroke="#B05334"/>';

    expect(replaceSvgColors(svg, {
      "#9f4b2f": ["#245c4a", "#d6a72c"],
      "#b05334": ["#2f735d", "#efc94c"],
    }, 1)).toBe('<path fill="#d6a72c"/><path fill="#d6a72c" stroke="#efc94c"/>');
  });

  it("uses the first variation by default and clamps out-of-range indexes", () => {
    const svg = '<path fill="#9f4b2f"/>';
    const replacements = { "#9f4b2f": ["#245c4a", "#d6a72c"] };

    expect(replaceSvgColors(svg, replacements)).toBe('<path fill="#245c4a"/>');
    expect(replaceSvgColors(svg, replacements, 7)).toBe('<path fill="#d6a72c"/>');
    expect(replaceSvgColors(svg, replacements, -3)).toBe('<path fill="#245c4a"/>');
  });

  it("returns an empty replacement for an empty variation list", () => {
    expect(replaceSvgColors('<path fill="#9f4b2f"/>', {
      "#9f4b2f": [],
    })).toBe('<path fill=""/>');
  });

  it("returns the original SVG when no replacements are configured", () => {
    const svg = '<path fill="#9f4b2f"/>';

    expect(replaceSvgColors(svg, {})).toBe(svg);
  });

  it("creates a data URL from a recolored SVG asset", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => '<path fill="#9f4b2f"/>',
    })));

    await expect(createSvgColorVariant("/assets/house/block.svg", {
      "#9f4b2f": "#245c4a",
    })).resolves.toBe(
      `data:image/svg+xml,${encodeURIComponent('<path fill="#245c4a"/>')}`,
    );

    vi.unstubAllGlobals();
  });

  it("keeps the source URL when no color variant is requested", async () => {
    await expect(createSvgColorVariant("/assets/house/block.svg", {}))
      .resolves.toBe("/assets/house/block.svg");
  });

  it("applies the requested variation to the data URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => '<path fill="#9f4b2f"/>',
    })));

    await expect(createSvgColorVariant("/assets/house/block.svg", {
      "#9f4b2f": ["#245c4a", "#d6a72c"],
    }, 1)).resolves.toBe(
      `data:image/svg+xml,${encodeURIComponent('<path fill="#d6a72c"/>')}`,
    );

    vi.unstubAllGlobals();
  });

  it("rejects when the SVG asset cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    await expect(createSvgColorVariant("/assets/house/block.svg", {
      "#9f4b2f": "#245c4a",
    })).rejects.toThrow("Unable to load SVG asset");

    vi.unstubAllGlobals();
  });
});

describe("getColorVariationCount", () => {
  it("counts the variations of the first list, or zero without lists", () => {
    expect(getColorVariationCount({ "#000000": "#ffffff" })).toBe(0);
    expect(getColorVariationCount({ "#000000": "#ffffff", "#111111": ["#a", "#b", "#c"] }))
      .toBe(3);
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
