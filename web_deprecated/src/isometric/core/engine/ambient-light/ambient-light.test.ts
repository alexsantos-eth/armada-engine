import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
import { rgbToTint } from "../render/color";
import { mountScene, resetHarness, worldFrom } from "../flow-check/scene-harness";
import { CLOCK_PART } from "../time";
import { createPhaseLighting, LIGHTING_PHASES } from "../lighting";
import { createAmbientLight } from "./ambient-light";

describe("createAmbientLight", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });
  it("holds authored daylight across clock changes and writes only when the packed tint changes", async () => {
    const world = worldFrom([{ x: 0, y: 0, elevation: 0 }]);
    const lighting = createPhaseLighting();
    const { ticker, root, scene } = await mountScene(world, [createAmbientLight(lighting)]);
    expect(root.tint).toBe(rgbToTint(LIGHTING_PHASES.day.ambient));
    const writes = root.tintWrites.length;
    world.parts.get(CLOCK_PART).tick += 24000;
    ticker.frame();
    expect(root.tintWrites).toHaveLength(writes);
    lighting.transitionTo("sunset", 0);
    ticker.frame();
    expect(root.tint).toBe(rgbToTint(LIGHTING_PHASES.sunset.ambient));
    expect(root.tintWrites).toHaveLength(writes + 1);
    ticker.frame();
    expect(root.tintWrites).toHaveLength(writes + 1);
    scene.destroy();
  });
  it("creates its own stable default light", async () => {
    const { root, scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 0 }]), [createAmbientLight()]);
    expect(root.tint).toBe(rgbToTint(LIGHTING_PHASES.day.ambient));
    scene.destroy();
  });
});
