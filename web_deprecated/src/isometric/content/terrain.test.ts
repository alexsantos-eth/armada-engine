import { describe, expect, it } from "vitest";
import { validateTerrainConnections, validateTerrainVariants } from "../core/engine";
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

  it("joins path blocks with sixteen frames of one sheet, each a block's canvas in the generated atlas", () => {
    const connections = TERRAIN_APPEARANCE.path.connections;
    const sheet = ASSET_SOURCES[`/public${connections?.textureSource}`];

    expect(connections && validateTerrainConnections(connections)).toEqual([]);
    expect(sheet).toContain('viewBox="0 -341 4096 3412"');
    connections?.frames.forEach((frame, mask) => {
      expect(frame).toEqual({ x: (mask % 4) * 1024, y: Math.floor(mask / 4) * 853, width: 1024, height: 853 });
      expect(sheet).toContain(`<g id="path-${mask}" transform="translate(${frame.x} ${frame.y})">`);
    });
  });

  it("tints a path's grass edges with the grass zones around it", () => {
    const { field, ...tints } = TERRAIN_APPEARANCE.path.noiseTints ?? {};
    expect(field).toBe("grass");
    expect(tints).toEqual(TERRAIN_APPEARANCE.grass.noiseTints);
    expect(TERRAIN_APPEARANCE.path.tint).toEqual(TERRAIN_APPEARANCE.grass.tint);
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

  it("paints grass zones by noise in visible tones: darker, plain and yellower", () => {
    const colors = TERRAIN_APPEARANCE.grass.noiseTints?.colors ?? [];
    const channels = (color: number) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];

    expect(TERRAIN_APPEARANCE.grass.noiseTints?.scale).toBeGreaterThan(0);
    expect(colors).toContain(0xffffff);
    // Darker: every channel well under white. Yellower: red kept, blue well under green.
    expect(colors.some((color) => channels(color).every((channel) => channel < 0xe0))).toBe(true);
    expect(colors.some((color) => channels(color)[0] === 0xff && channels(color)[2] < channels(color)[1] - 0x30)).toBe(
      true,
    );
    // Ground keeps a subtler palette of its own.
    expect(TERRAIN_APPEARANCE.ground.noiseTints).not.toEqual(TERRAIN_APPEARANCE.grass.noiseTints);
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
});
