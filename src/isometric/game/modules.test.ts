import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../core/engine/flow-check/scene-harness")).mockPixi());
vi.mock("../core/engine/render", async () => (await import("../core/engine/flow-check/scene-harness")).mockRender());
vi.mock("../core/engine/shadows/silhouette", async () =>
  (await import("../core/engine/flow-check/scene-harness")).mockSilhouette(),
);
vi.mock("../core/engine/shadows/received-shadow", async () =>
  (await import("../core/engine/flow-check/scene-harness")).mockReceivedShadow(),
);

import { Culler } from "pixi.js";
import { CLOCK_PART, PLAYER_PART, TICKS_PER_HOUR, WORLD_START_TICK } from "../core/engine";
import { createTestEntities, defaultWorld, mountScene, resetHarness } from "../core/engine/flow-check/scene-harness";
import { createSceneModules, createWorldParts, createWorldSystems, findUnknownModules } from "./modules";

const SCENE_IDS = ["terrain", "entities", "foliage-wind", "shadows", "ambient-light", "player", "camera"];

describe("createSceneModules", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("lists the scene modules so each comes after the services it uses", () => {
    expect(createSceneModules().map(({ id }) => id)).toEqual(SCENE_IDS);
  });

  it("creates new modules on every call", () => {
    expect(createSceneModules()[0]).not.toBe(createSceneModules()[0]);
  });

  it("leaves out the disabled modules", () => {
    expect(createSceneModules(new Set(["shadows", "camera"])).map(({ id }) => id)).toEqual([
      "terrain",
      "entities",
      "foliage-wind",
      "ambient-light",
      "player",
    ]);
  });

  it("culls with the camera unless culling is off", async () => {
    const culled = await mountScene(defaultWorld(), createSceneModules());
    expect(Culler.shared.cull).toHaveBeenCalled();
    culled.scene.destroy();
    vi.mocked(Culler.shared.cull).mockClear();

    const unculled = await mountScene(defaultWorld(), createSceneModules(new Set(), { cull: false }));
    expect(Culler.shared.cull).not.toHaveBeenCalled();
    unculled.scene.destroy();
  });

  it.each(SCENE_IDS)("draws, runs and tears down the scene without %s", async (id) => {
    const world = defaultWorld(createTestEntities);
    const { ticker, root, scene } = await mountScene(world, createSceneModules(new Set([id])));

    world.parts.get(CLOCK_PART).tick += 1000;
    world.parts.get(PLAYER_PART).x += 0.5;
    ticker.frame();
    ticker.frame();

    expect(root.children.length).toBeGreaterThan(0);
    scene.destroy();
    expect(ticker.listeners).toHaveLength(0);
  });
});

describe("createWorldParts", () => {
  it("registers the clock and the player, in that order", () => {
    expect(createWorldParts().map(({ id }) => id)).toEqual([CLOCK_PART.id, PLAYER_PART.id]);
  });

  it("starts the clock of a new world at the given tick, or at the world start tick", () => {
    expect(createWorldParts()[0].create(defaultWorld())).toEqual({ tick: WORLD_START_TICK });
    expect(createWorldParts(TICKS_PER_HOUR)[0].create(defaultWorld())).toEqual({ tick: TICKS_PER_HOUR });
  });
});

describe("createWorldSystems", () => {
  it("runs the player, unless it is disabled", () => {
    expect(createWorldSystems().map(({ id }) => id)).toEqual(["player"]);
    expect(createWorldSystems(new Set(["player"]))).toEqual([]);
  });
});

describe("findUnknownModules", () => {
  it("lists the disabled ids that name no scene module nor game system", () => {
    expect(findUnknownModules(new Set(["shadows", "player", "shadow", "fog"]))).toEqual(["shadow", "fog"]);
    expect(findUnknownModules(new Set())).toEqual([]);
  });
});
