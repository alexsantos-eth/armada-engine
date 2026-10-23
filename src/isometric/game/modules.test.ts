import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../core/engine/flow-check/scene-harness")).mockPixi());
vi.mock("../core/engine/render", async () => (await import("../core/engine/flow-check/scene-harness")).mockRender());
vi.mock("../core/engine/shadows/silhouette", async () =>
  (await import("../core/engine/flow-check/scene-harness")).mockSilhouette(),
);
vi.mock("../core/engine/shadows/received-shadow", async () =>
  (await import("../core/engine/flow-check/scene-harness")).mockReceivedShadow(),
);

import { createTestEntities, defaultWorld, mountScene, resetHarness } from "../core/engine/flow-check/scene-harness";
import { createSceneModules, createWorldSystems, findUnknownModules } from "./modules";

const SCENE_IDS = ["terrain", "entities", "shadows", "ambient-light", "player", "camera"];

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
      "ambient-light",
      "player",
    ]);
  });

  it.each(SCENE_IDS)("draws, runs and tears down the scene without %s", async (id) => {
    const world = defaultWorld(createTestEntities);
    const { ticker, root, scene } = await mountScene(world, createSceneModules(new Set([id])));

    world.clock.tick += 1000;
    world.player.x += 0.5;
    ticker.frame();
    ticker.frame();

    expect(root.children.length).toBeGreaterThan(0);
    scene.destroy();
    expect(ticker.listeners).toHaveLength(0);
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
