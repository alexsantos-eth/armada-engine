import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../scene/testing/harness")).mockPixi());
vi.mock("../render", async () => (await import("../scene/testing/harness")).mockRender());

import { rgbToTint } from "../render/color";
import { mountScene, resetHarness, worldFrom } from "../scene/testing/harness";
import { DEFAULT_SKY_PALETTE, getSunState, TICKS_PER_DAY } from "../time";
import { createAmbientLight } from "./ambient-light";

const atHour = (hour: number) => {
  const world = worldFrom([{ x: 0, y: 0, elevation: 0 }]);
  world.clock.tick = (hour / 24) * TICKS_PER_DAY;
  return world;
};

describe("createAmbientLight", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("tints the world container with the ambient light of the current hour", async () => {
    const noon = await mountScene(atHour(12), [createAmbientLight()]);
    const midnight = await mountScene(atHour(0), [createAmbientLight()]);

    expect(noon.root.tint).toBe(0xffffff);
    expect(midnight.root.tint).toBe(rgbToTint(DEFAULT_SKY_PALETTE[0].color));
    noon.scene.destroy();
    midnight.scene.destroy();
  });

  it("writes the tint again only on frames where the clock advanced", async () => {
    const world = atHour(6);
    const { ticker, root, scene } = await mountScene(world, [createAmbientLight()]);
    const writes = root.tintWrites.length;

    ticker.frame();
    expect(root.tintWrites).toHaveLength(writes);

    world.clock.tick += TICKS_PER_DAY / 4;
    ticker.frame();
    expect(root.tintWrites).toHaveLength(writes + 1);
    expect(root.tint).toBe(rgbToTint(getSunState(world.clock.tick).ambient));
    scene.destroy();
  });
});
