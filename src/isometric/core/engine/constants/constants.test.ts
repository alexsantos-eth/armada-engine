import { describe, expect, it } from "vitest";
import { BOX_HEIGHT, TILE_HEIGHT, TILE_METRICS, TILE_WIDTH, WIDTH } from "./constants";

describe("engine constants", () => {
  it("uses a static view width without reading window", () => {
    expect(typeof window).toBe("undefined");
    expect(WIDTH).toBe(1300);
    expect(TILE_WIDTH).toBe(40);
  });

  it("keeps the isometric block proportions consistent", () => {
    expect(TILE_HEIGHT).toBe(TILE_WIDTH / 2);
    expect(BOX_HEIGHT).toBe(TILE_WIDTH / 3);
    expect(TILE_METRICS).toEqual({
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
    });
  });
});
