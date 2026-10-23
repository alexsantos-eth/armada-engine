import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("./testing/harness")).mockPixi());
vi.mock("../render", async () => (await import("./testing/harness")).mockRender());

import { Assets } from "pixi.js";
import { CAMERA_MAX_ZOOM } from "../camera";
import { TILE_METRICS } from "../constants";
import { addInDepthOrder, getSvgResolution } from "../render";
import type { BuiltScene, SceneContext, SceneFrame, SceneModule, SceneModulePart } from "./module";
import { indexAfter, SCENE_LAYER, sortViews } from "./scene";
import { mountScene, resetHarness, TEST_TERRAIN, worldFrom } from "./testing/harness";

/** A module that records what the scene does with it. */
const probe = (id: string, part: Partial<SceneModulePart> = {}, log: string[] = []) => {
  const seen: { context?: SceneContext; built?: BuiltScene; frames: SceneFrame[] } = { frames: [] };
  const module: SceneModule = {
    id,
    setup: (context) => {
      seen.context = context;
      log.push(`setup ${id}`);
      return {
        ...part,
        start: (built) => {
          seen.built = built;
          log.push(`start ${id}`);
        },
        update: (frame) => {
          seen.frames.push(frame);
          log.push(`update ${id}`);
        },
        destroy: vi.fn(() => log.push(`destroy ${id}`)),
      };
    },
  };
  return { module, seen };
};

const view = (name: string) => ({ name, cullable: false }) as never;

const shore = () =>
  worldFrom([
    { x: 0, y: 0, elevation: -1 },
    { x: 1, y: 0, elevation: 0 },
    { x: 2, y: 0, elevation: 0 },
    { x: 3, y: 1, elevation: 0 },
  ]);

describe("createScene", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("adds one world container to the stage: a render group that takes no pointer events", async () => {
    const { root, scene } = await mountScene(shore(), []);

    expect(root.isRenderGroup).toBe(true);
    expect(root.eventMode).toBe("none");
    expect(root.children).toEqual([]);
    scene.destroy();
  });

  it("gives every module the world, its bounds, the projection and the terrain appearance", async () => {
    const world = shore();
    const { module, seen } = probe("a");
    const { scene } = await mountScene(world, [module]);
    const context = seen.context as SceneContext;

    expect(context.world).toBe(world);
    expect(context.bounds).toEqual({ minX: 0, minY: 0, maxX: 3, maxY: 1 });
    expect(context.projection).toEqual({
      tileWidth: TILE_METRICS.tileWidth,
      tileHeight: TILE_METRICS.tileHeight,
      elevationStep: TILE_METRICS.boxHeight,
      originX: 0,
      originY: 0,
    });
    expect(context.metrics).toBe(TILE_METRICS);
    expect(context.terrain).toBe(TEST_TERRAIN);
    expect(context.columnAt.get(2, 0)).toBe(world.columns[2]);
    // (1, 0) is the sand shore: half a block lower; the rest and the outside, not at all.
    expect(context.topInsetAt(1, 0)).toBe(0.5);
    expect(context.topInsetAt(2, 0)).toBe(0);
    expect(context.topInsetAt(9, 9)).toBe(0);
    scene.destroy();
  });

  it("loads SVGs at the size they are drawn at the largest zoom, and unloads them with the scene", async () => {
    const { module, seen } = probe("a");
    const { scene } = await mountScene(shore(), [module], { resolution: 2 });
    const resolution = getSvgResolution(TILE_METRICS.tileWidth * CAMERA_MAX_ZOOM, 2);

    await expect(seen.context?.assets.loadSvg("/assets/a.svg")).resolves.toEqual({ source: "/assets/a.svg" });
    expect(Assets.load).toHaveBeenCalledWith({ src: "/assets/a.svg", data: { resolution, autoGenerateMipmaps: true } });

    scene.destroy();
    expect(Assets.unload).toHaveBeenCalledWith("/assets/a.svg");
  });

  it("sets modules up in order, each seeing the services of those before it", async () => {
    const camera = { follow: vi.fn() };
    const first = probe("first", { provides: { camera: camera as never } });
    const reader: SceneModule = {
      id: "reader",
      requires: ["camera"],
      setup: ({ services }) => {
        expect(services.get("camera")).toBe(camera);
        expect(services.get("focus")).toBeUndefined();
        return { destroy: () => {} };
      },
    };

    const { scene } = await mountScene(shore(), [first.module, reader]);

    expect(scene.services.camera).toBe(camera);
    scene.destroy();
  });

  it("fails clearly when a required service is missing, destroying what was set up", async () => {
    const log: string[] = [];
    const first = probe("first", {}, log);
    const needy: SceneModule = { id: "needy", requires: ["entityViews"], setup: vi.fn() };

    await expect(mountScene(shore(), [first.module, needy])).rejects.toThrow(
      'Scene module "needy" requires the "entityViews" service',
    );
    expect(needy.setup).not.toHaveBeenCalled();
    expect(log).toEqual(["setup first", "destroy first"]);
  });

  it("rejects two modules with the same id before setting any up", async () => {
    const first = probe("twin");
    const second = probe("twin");

    await expect(mountScene(shore(), [first.module, second.module])).rejects.toThrow(
      'Scene module id "twin" is used twice',
    );
    expect(first.seen.context).toBeUndefined();
  });

  it("fails clearly when two modules provide the same service, destroying what was set up", async () => {
    const log: string[] = [];
    const first = probe("first", { provides: { camera: {} as never } }, log);
    const second = probe("second", { provides: { camera: {} as never } }, log);

    await expect(mountScene(shore(), [first.module, second.module])).rejects.toThrow(
      'Scene module "second" provides the "camera" service, already provided by "first"',
    );
    expect(log).toEqual(["setup first", "setup second", "destroy second", "destroy first"]);
  });

  it("destroys what was set up and unloads its assets when a module's setup fails", async () => {
    const log: string[] = [];
    const loader: SceneModule = {
      id: "loader",
      setup: async ({ assets }) => {
        await assets.loadSvg("/assets/x.svg");
        log.push("setup loader");
        return { destroy: () => log.push("destroy loader") };
      },
    };
    const broken: SceneModule = { id: "broken", setup: () => Promise.reject(new Error("no asset")) };

    await expect(mountScene(shore(), [loader, broken])).rejects.toThrow("no asset");
    expect(log).toEqual(["setup loader", "destroy loader"]);
    expect(Assets.unload).toHaveBeenCalledWith("/assets/x.svg");
  });

  it("adds every view once, by depth then layer, as cullable, without sortableChildren", async () => {
    const entity = view("entity");
    const block = view("block");
    const shadow = view("shadow");
    const back = view("back");
    const objects = probe("objects", { views: [{ view: entity, depth: 5, layer: SCENE_LAYER.object }] });
    const ground = probe("ground", {
      views: [
        { view: shadow, depth: 5, layer: SCENE_LAYER.ground },
        { view: block, depth: 5, layer: SCENE_LAYER.terrain },
        { view: back, depth: 1, layer: SCENE_LAYER.onObject },
      ],
    });

    const { root, scene } = await mountScene(shore(), [objects.module, ground.module]);

    expect(addInDepthOrder).toHaveBeenCalledTimes(1);
    expect(root.sortableChildren).toBe(false);
    expect(root.children).toEqual([back, block, shadow, entity]);
    expect(root.children.every(({ cullable }) => cullable)).toBe(true);
    scene.destroy();
  });

  it("starts modules in order once their views are in, so they can place moving views by depth", async () => {
    const log: string[] = [];
    const a = probe("a", { views: [{ view: view("a"), depth: 1, layer: 0 }] }, log);
    const b = probe("b", { views: [{ view: view("b"), depth: 3, layer: 0 }] }, log);
    const { root, scene } = await mountScene(shore(), [a.module, b.module]);
    const moving = view("moving");

    expect(log).toEqual(["setup a", "setup b", "start a", "start b"]);
    b.seen.built?.placeAt(moving, 2);
    expect(root.children.map((child) => (child as unknown as { name: string }).name)).toEqual(["a", "moving", "b"]);
    scene.destroy();
  });

  it("updates every module each frame, in order, from one listener between simulation and render", async () => {
    const log: string[] = [];
    const world = shore();
    world.clock.tick = 42;
    const a = probe("a", {}, log);
    const b = probe("b", {}, log);
    const { ticker, scene } = await mountScene(world, [a.module, b.module], { interpolation: () => 0.25 });
    log.length = 0;

    ticker.frame(20);

    expect(ticker.add).toHaveBeenCalledTimes(1);
    expect(ticker.add).toHaveBeenCalledWith(expect.any(Function), undefined, 0);
    expect(log).toEqual(["update a", "update b"]);
    expect(a.seen.frames).toEqual([{ tick: 42, elapsedMs: 20, alpha: 0.25 }]);
    scene.destroy();
  });

  it("draws the last tick when there is no interpolation", async () => {
    const a = probe("a");
    const { ticker, scene } = await mountScene(shore(), [a.module]);

    ticker.frame();
    expect(a.seen.frames[0].alpha).toBe(1);
    scene.destroy();
  });

  it("accepts modules that only draw: no start, update or services", async () => {
    const still: SceneModule = {
      id: "still",
      setup: () => ({ views: [{ view: view("still"), depth: 0, layer: 0 }], destroy: () => {} }),
    };
    const { ticker, root, scene } = await mountScene(shore(), [still]);

    ticker.frame();
    expect(root.children).toHaveLength(1);
    expect(scene.services).toEqual({});
    scene.destroy();
  });

  it("stops its frames, destroys modules in reverse order, then the world container", async () => {
    const log: string[] = [];
    const a = probe("a", {}, log);
    const b = probe("b", {}, log);
    const { ticker, root, scene } = await mountScene(shore(), [a.module, b.module]);
    log.length = 0;

    scene.destroy();

    expect(ticker.listeners).toHaveLength(0);
    expect(log).toEqual(["destroy b", "destroy a"]);
    expect(root.destroy).toHaveBeenCalledWith({ children: true });
  });
});

describe("sortViews", () => {
  it("sorts by depth, then layer, keeping the order of equals", () => {
    const views = [
      { view: view("c"), depth: 2, layer: 0 as const },
      { view: view("b2"), depth: 1, layer: 2 as const },
      { view: view("a"), depth: 1, layer: 0 as const },
      { view: view("b3"), depth: 1, layer: 2 as const },
    ];

    expect(sortViews(views).map(({ view: { name } }: { view: { name: string } }) => name)).toEqual([
      "a",
      "b2",
      "b3",
      "c",
    ]);
  });
});

describe("indexAfter", () => {
  it("finds the first index past a depth in ascending depths", () => {
    expect(indexAfter([], 3)).toBe(0);
    expect(indexAfter([1, 2, 2, 5], 0)).toBe(0);
    expect(indexAfter([1, 2, 2, 5], 2)).toBe(3);
    expect(indexAfter([1, 2, 2, 5], 9)).toBe(4);
  });
});
