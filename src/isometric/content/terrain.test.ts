import { describe, expect, it } from "vitest";
import { validateTerrainBands, validateTerrainVariants } from "../core/engine";
import { TERRAIN_APPEARANCE } from "./terrain";

const ASSET_SOURCES = import.meta.glob<string>("/public/assets/*/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("TERRAIN_APPEARANCE", () => {
  it("points every material to an existing block SVG", () => {
    Object.values(TERRAIN_APPEARANCE).forEach(({ textureSource }) => {
      expect(ASSET_SOURCES[`/public${textureSource}`]).toBeDefined();
    });
  });

  it("gives the grass valid variants with something on top, each an existing SVG", () => {
    const variants = TERRAIN_APPEARANCE.grass.variants ?? [];

    expect(variants.length).toBeGreaterThan(0);
    expect(validateTerrainVariants(variants)).toEqual([]);
    variants.forEach(({ textureSource }) => expect(ASSET_SOURCES[`/public${textureSource}`]).toBeDefined());
    // Most of the grass stays plain.
    expect(variants.reduce((sum, { chance }) => sum + chance, 0)).toBeLessThan(0.5);
  });

  it("keeps wildflowers, pebbles and mushrooms as clustered grass-top variations", () => {
    const sources = (TERRAIN_APPEARANCE.grass.variants ?? []).map(({ textureSource }) => textureSource);
    expect(sources).toEqual(expect.arrayContaining(["/assets/grass/grass_variants.svg"]));
    expect(new Set(sources)).toEqual(new Set(["/assets/grass/grass_variants.svg"]));
    expect(
      (TERRAIN_APPEARANCE.grass.variants ?? []).every(({ frame }) => frame?.width === 1024 && frame.height === 853),
    ).toBe(true);
    expect(sources.every((source) => source === "/assets/grass/grass_variants.svg")).toBe(true);
  });

  it("sinks only sand, half a block, and darkens only water with depth", () => {
    expect(TERRAIN_APPEARANCE.sand.topInset).toBe(0.5);
    expect(["grass", "ground", "water"].map((material) => TERRAIN_APPEARANCE[material as "grass"].topInset)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(Object.entries(TERRAIN_APPEARANCE).filter(([, { tint }]) => tint.kind === "depth")).toEqual([
      ["water", expect.anything()],
    ]);
  });

  it("animates light bands only on water, with valid bands that move less in deep water", () => {
    const bands = TERRAIN_APPEARANCE.water.bands;

    expect(Object.entries(TERRAIN_APPEARANCE).filter(([, appearance]) => appearance.bands)).toEqual([
      ["water", expect.anything()],
    ]);
    expect(bands && validateTerrainBands(bands)).toEqual([]);
    expect(bands?.deep).toBeLessThan(1);
  });
});
