import { describe, expect, it } from "vitest";
import { PLAYER_APPEARANCE } from "./player";

const ASSET_SOURCES = import.meta.glob<string>("/public/assets/player/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("PLAYER_APPEARANCE", () => {
  it("points to a one-tile, one-block asset in the two-diamond template", () => {
    const svg = ASSET_SOURCES[`/public${PLAYER_APPEARANCE.textureSource}`];

    expect(svg).toBeDefined();
    expect(svg).toContain('viewBox="0 -341 1024 853"');
    expect(svg).not.toContain("data-tiles");
    expect(PLAYER_APPEARANCE.height).toBe(1);
  });

  it("casts no shadow of its own: the engine owns shadows", () => {
    expect(ASSET_SOURCES[`/public${PLAYER_APPEARANCE.textureSource}`]?.toLowerCase()).not.toContain("#1e2a10");
  });
});
