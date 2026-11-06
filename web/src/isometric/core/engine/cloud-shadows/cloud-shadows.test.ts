import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());

import { TilingSprite } from "pixi.js";
import { containers, createRenderer, resetHarness } from "../flow-check/scene-harness";
import { TILE_WIDTH } from "../constants";
import {
  CLOUD_SHADOW_ALPHA,
  CLOUD_SHADOW_SCALE,
  CLOUD_SHADOW_SOURCE,
  CLOUD_SHADOW_SPEED,
  CLOUD_SHADOW_TILE_UNITS,
  createCloudShadows,
} from "./cloud-shadows";

const setup = async (texture: unknown = { source: CLOUD_SHADOW_SOURCE }) => {
  const renderer = createRenderer();
  const stage = { addChild: vi.fn(), removeChild: vi.fn() };
  const app = { renderer, stage };
  const root = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } };
  const assets = { loadSvg: vi.fn(() => Promise.resolve(texture)) };
  const part = await createCloudShadows().setup({ app, root, assets } as never);
  const overlay = containers.find((container) => container instanceof TilingSprite);
  return { app, assets, overlay, part, renderer, root, stage };
};

describe("createCloudShadows", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("draws one screen-sized texture and drifts it without per-tile views", async () => {
    const { assets, overlay, part, renderer, stage } = await setup();
    expect(assets.loadSvg).toHaveBeenCalledWith(CLOUD_SHADOW_SOURCE);
    expect(overlay).toBeDefined();
    expect(stage.addChild).toHaveBeenCalledWith(overlay);
    expect(overlay?.width).toBe(renderer.screen.width);
    expect(overlay?.height).toBe(renderer.screen.height);
    expect(overlay?.alpha).toBe(CLOUD_SHADOW_ALPHA);

    part.start?.({} as never);
    part.update?.({ elapsedMs: 1000, tick: 0, alpha: 0 });
    expect(overlay?.tilePosition.x).toBeLessThan(0);
    expect(overlay?.tilePosition.y).toBeLessThan(0);
    expect(containers.filter((container) => container instanceof TilingSprite)).toHaveLength(1);

    renderer.screen.width = 900;
    renderer.screen.height = 600;
    renderer.emit("resize");
    expect(overlay?.width).toBe(900);
    expect(overlay?.height).toBe(600);
    part.destroy();
    expect(renderer.listeners.get("resize")?.size).toBe(0);
    expect(stage.removeChild).toHaveBeenCalledWith(overlay);
    expect(overlay?.destroy).toHaveBeenCalledOnce();
  });

  it("keeps the pattern anchored to the world camera transform", async () => {
    const { overlay, part, root } = await setup();
    root.position.x = 120;
    root.position.y = 80;
    root.scale.x = 2;
    root.scale.y = 2;
    part.start?.({} as never);
    expect(overlay?.tileScale.x).toBe(2 * CLOUD_SHADOW_SCALE);
    expect(overlay?.tileScale.y).toBe(2 * CLOUD_SHADOW_SCALE);
    expect(overlay?.tilePosition.x).toBe(120);
    expect(overlay?.tilePosition.y).toBe(80);
    part.destroy();
  });

  it("draws one tile of the pattern as one tile of the world, faint and drifting slowly", async () => {
    expect(CLOUD_SHADOW_TILE_UNITS * CLOUD_SHADOW_SCALE).toBe(TILE_WIDTH);
    expect(CLOUD_SHADOW_ALPHA).toBeLessThan(0.34);
    // Under a tenth of a tile per second, mostly sideways.
    expect(Math.hypot(CLOUD_SHADOW_SPEED.x, CLOUD_SHADOW_SPEED.y)).toBeLessThan(TILE_WIDTH / 10);
    expect(CLOUD_SHADOW_SPEED.y).toBeLessThan(CLOUD_SHADOW_SPEED.x);

    const { overlay, part } = await setup();
    part.start?.({} as never);
    part.update?.({ elapsedMs: 2000, tick: 0, alpha: 0 });
    expect(overlay?.tilePosition.x).toBeCloseTo(-2 * CLOUD_SHADOW_SPEED.x);
    expect(overlay?.tilePosition.y).toBeCloseTo(-2 * CLOUD_SHADOW_SPEED.y);
    part.destroy();
  });

  it("does not add an overlay when the texture is unavailable", async () => {
    const { overlay, part, stage } = await setup(null);
    expect(overlay).toBeUndefined();
    expect(stage.addChild).not.toHaveBeenCalled();
    part.destroy();
  });
});
