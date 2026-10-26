import { describe, expect, it } from "vitest";
import { validateTerrainBands } from "../core/engine";
import { TERRAIN_APPEARANCE } from "./terrain";

const ASSET_SOURCES = import.meta.glob<string>("/public/assets/*/block.svg", {
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
