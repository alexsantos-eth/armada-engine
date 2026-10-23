import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Assets } from "pixi.js";
import { CAMERA_MAX_ZOOM } from "../camera";
import { TILE_METRICS } from "../constants";
import { getSvgResolution } from "../render";
import { WorldParts } from "../parts";
import { CLOCK_PART } from "../time";
import type { BuiltScene, SceneContext, SceneFrame, SceneModule, SceneModulePart } from "./module";
import type { ChunkCoord } from "../../types";
import type { WorldChunk } from "../world";
import { CHUNKS_SHOWN_PER_FRAME, SCENE_LAYER, UNBOUNDED_CAMERA_BOUNDS } from "./scene";
import { columnsOf, mountScene, resetHarness, TEST_TERRAIN, worldFrom } from "../flow-check/scene-harness";

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

const view = (name: string) => ({ name, cullable: false, destroy: vi.fn() }) as never;

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
    expect(context.columnAt).toBe(world.columnIndex);
    expect(context.columnAt.get(2, 0)).toBe(columnsOf(world)[2]);
    // (1, 0) is the sand shore: half a block lower; the rest and the outside, not at all.
    expect(context.topInsetAt(1, 0)).toBe(0.5);
    expect(context.topInsetAt(2, 0)).toBe(0);
    expect(context.topInsetAt(9, 9)).toBe(0);
    scene.destroy();
  });

  it("lets the camera of an unbounded world go anywhere but the far edges of the grid", async () => {
    const world = shore();
    const { module, seen } = probe("a");
    const { scene } = await mountScene({ ...world, bounds: undefined }, [module]);

    expect(seen.context?.bounds).toBe(UNBOUNDED_CAMERA_BOUNDS);
    expect(UNBOUNDED_CAMERA_BOUNDS.maxX).toBeGreaterThan(1_000_000);
    scene.destroy();
  });

  it("loads SVGs at the size they are drawn at the largest zoom, and unloads them with the scene", async () => {
    const { module, seen } = probe("a");
    const { scene } = await mountScene(shore(), [module], { resolution: 2 });
    const resolution = getSvgResolution(TILE_METRICS.tileWidth * CAMERA_MAX_ZOOM, 2);

    await expect(seen.context?.assets.loadSvg("/assets/a.svg")).resolves.toEqual({ source: "/assets/a.svg" });
    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/a.svg",
      parser: "svg",
      data: { resolution, autoGenerateMipmaps: true },
    });

    scene.destroy();
    expect(Assets.unload).toHaveBeenCalledWith("/assets/a.svg");
  });

  it("sets modules up in order, each seeing the services of those before it", async () => {
    const camera = { follow: vi.fn(), visibleChunks: () => [] };
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

  it("rejects a world without a clock before setting any module up", async () => {
    const first = probe("first");
    const world = shore();

    await expect(mountScene({ ...world, parts: WorldParts.create([], world) }, [first.module])).rejects.toThrow(
      'The world has no "clock" part',
    );
    expect(first.seen.context).toBeUndefined();
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
    world.parts.get(CLOCK_PART).tick = 42;
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

/** Columns in chunks `0…3` along x (and one at the far end of chunk 3), each a flat column at elevation 0. */
const strip = () => worldFrom([0, 40, 72, 104, 127].map((x) => ({ x, y: 0, elevation: 0 })));

/** A module that draws one view per chunk and records what it is asked. */
const chunkProbe = (log: string[] = []) => {
  const module: SceneModule = {
    id: "chunks",
    setup: () => ({
      showChunk: (chunk: WorldChunk) => {
        log.push(`show ${chunk.coord.cx}`);
        return {
          views: [{ view: view(`chunk ${chunk.coord.cx}`), depth: -chunk.coord.cx, layer: SCENE_LAYER.terrain }],
          destroy: () => log.push(`hide ${chunk.coord.cx}`),
        };
      },
      destroy: () => {},
    }),
  };
  return module;
};

/** A camera module whose view is whatever `visible` holds. */
const fakeCamera = (visible: { chunks: ChunkCoord[] }) => {
  const camera = { resize: vi.fn(), visibleChunks: vi.fn(() => visible.chunks) };
  const module: SceneModule = {
    id: "camera",
    setup: () => ({ provides: { camera: camera as never }, destroy: () => {} }),
  };
  return { camera, module };
};

const names = (children: unknown[]) => children.map((child) => (child as { name: string }).name);

/** A module `id` that draws one view per chunk: on the terrain layer for `ground`, on the object one otherwise. */
const layeredProbe = (id: string, log: string[]): SceneModule => ({
  id,
  setup: () => ({
    showChunk: ({ coord: { cx } }: WorldChunk) => {
      log.push(`${id} ${cx}`);
      return {
        views: [{ view: view(`${id} ${cx}`), depth: -cx, layer: id === "ground" ? 0 : 2 }],
        destroy: () => log.push(`un${id} ${cx}`),
      };
    },
    destroy: () => {},
  }),
});

/** Lets the chunk drawing a frame started run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createScene chunks", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("shows every loaded chunk without a camera, each module drawing its part before the modules start", async () => {
    const log: string[] = [];
    const { module: last } = probe("last", {}, log);
    const { root, scene } = await mountScene(strip(), [chunkProbe(log), last]);

    // In the order the world loaded them: around its centre first.
    expect(log).toEqual(["setup last", "show 1", "show 2", "show 3", "show 0", "start last"]);
    expect(names(root.children)).toEqual(["chunk 3", "chunk 2", "chunk 1", "chunk 0"]);
    expect(root.children.every(({ cullable }) => cullable)).toBe(true);
    expect(scene.shownChunks()).toHaveLength(4);
    scene.destroy();
    expect(log.slice(-5)).toEqual(["hide 0", "hide 3", "hide 2", "hide 1", "destroy last"]);
  });

  it("shows only the ready chunks the camera sees, and asks the app to stream them", async () => {
    const visible = { chunks: [{ cx: 1, cy: 0 }] };
    const { module: camera } = fakeCamera(visible);
    const stream = vi.fn();
    const world = strip();
    world.chunks.unload({ cx: 3, cy: 0 });
    const { root, scene } = await mountScene(world, [camera, chunkProbe()], { stream });

    // While built: everything the first view needs at once.
    expect(stream).toHaveBeenCalledWith([{ cx: 1, cy: 0 }], true);
    expect(names(root.children)).toEqual(["chunk 1"]);
    scene.destroy();
  });

  it("shows the chunks that come into view one per frame, nearest first, and culls them", async () => {
    const visible = { chunks: [{ cx: 0, cy: 0 }] };
    const { module: cameraModule, camera } = fakeCamera(visible);
    const log: string[] = [];
    const { ticker, root, scene } = await mountScene(strip(), [cameraModule, chunkProbe(log)]);
    log.length = 0;

    visible.chunks = [
      { cx: 0, cy: 0 },
      { cx: 1, cy: 0 },
      { cx: 2, cy: 0 },
    ];
    expect(CHUNKS_SHOWN_PER_FRAME).toBe(1);
    ticker.frame();
    // Still drawing chunk 1: nothing else starts.
    ticker.frame();
    await vi.waitFor(() => expect(names(root.children)).toEqual(["chunk 1", "chunk 0"]));
    expect(camera.resize).toHaveBeenCalledTimes(1);
    ticker.frame();
    await vi.waitFor(() => expect(names(root.children)).toEqual(["chunk 2", "chunk 1", "chunk 0"]));
    expect(log).toEqual(["show 1", "show 2"]);
    scene.destroy();
  });

  it("draws a chunk that comes into view after the start over frames, one module per frame", async () => {
    const visible = { chunks: [{ cx: 0, cy: 0 }] };
    const { module: camera } = fakeCamera(visible);
    const log: string[] = [];
    const ground = layeredProbe("ground", log);
    const { ticker, root, scene } = await mountScene(strip(), [ground, camera, layeredProbe("things", log)]);
    log.length = 0;

    visible.chunks = [
      { cx: 0, cy: 0 },
      { cx: 1, cy: 0 },
    ];
    ticker.frame();
    await settle();
    // The first module drew its part; the second waits for the next frame, and nothing shows yet.
    expect(log).toEqual(["ground 1"]);
    expect(scene.shownChunks()).toHaveLength(1);

    ticker.frame();
    await settle();
    expect(log).toEqual(["ground 1", "things 1"]);
    expect(scene.shownChunks()).toHaveLength(2);
    expect(names(root.children)).toEqual(["ground 1", "things 1", "ground 0", "things 0"]);
    scene.destroy();
  });

  it("stops drawing a chunk when the scene is destroyed between two of its modules", async () => {
    const visible = { chunks: [{ cx: 0, cy: 0 }] };
    const { module: camera } = fakeCamera(visible);
    const log: string[] = [];
    const { ticker, scene } = await mountScene(strip(), [
      camera,
      layeredProbe("ground", log),
      layeredProbe("things", log),
    ]);
    log.length = 0;

    visible.chunks = [{ cx: 1, cy: 0 }];
    ticker.frame();
    await settle();
    scene.destroy();
    await settle();

    // Chunk 0 is hidden with the scene; chunk 1's first part is freed, its second never drawn.
    expect(log).toEqual(["ground 1", "unthings 0", "unground 0", "unground 1"]);
  });

  it("hides a chunk once it is neither in view nor next to a chunk in view", async () => {
    const visible = { chunks: [0, 1, 2, 3].map((cx) => ({ cx, cy: 0 })) };
    const { module: camera } = fakeCamera(visible);
    const log: string[] = [];
    const { ticker, root, scene } = await mountScene(strip(), [camera, chunkProbe(log)]);
    log.length = 0;

    visible.chunks = [{ cx: 2, cy: 0 }];
    ticker.frame();

    expect(log).toEqual(["hide 0"]);
    expect(names(root.children)).toEqual(["chunk 3", "chunk 2", "chunk 1"]);
    scene.destroy();
  });

  it("hides a chunk whose ground the world unloaded", async () => {
    const log: string[] = [];
    const world = strip();
    const { ticker, root, scene } = await mountScene(world, [chunkProbe(log)]);
    log.length = 0;

    world.chunks.unload({ cx: 3, cy: 0 });
    ticker.frame();

    // Chunk 2 lost a neighbour: it is no longer ready.
    expect(log).toEqual(["hide 2", "hide 3"]);
    expect(names(root.children)).toEqual(["chunk 1", "chunk 0"]);
    scene.destroy();
  });

  it("leaves the views of a part that keeps them to it: out of the scene before its destroy()", async () => {
    const visible = { chunks: [0, 1].map((cx) => ({ cx, cy: 0 })) };
    const { module: camera } = fakeCamera(visible);
    const kept = view("kept");
    const dropped = view("dropped");
    const scene: { root?: { children: unknown[] } } = {};
    const given = vi.fn(() => expect(scene.root?.children).not.toContain(kept));
    const keeper: SceneModule = {
      id: "keeper",
      setup: () => ({
        showChunk: ({ coord }) =>
          coord.cx === 0
            ? { views: [{ view: kept, depth: 0, layer: SCENE_LAYER.terrain }], keepsViews: true, destroy: given }
            : { views: [{ view: dropped, depth: 1, layer: SCENE_LAYER.terrain }] },
        destroy: () => {},
      }),
    };
    const mounted = await mountScene(strip(), [camera, keeper]);
    scene.root = mounted.root;

    visible.chunks = [{ cx: 3, cy: 0 }];
    mounted.ticker.frame();

    expect(given).toHaveBeenCalledTimes(1);
    expect((kept as unknown as { destroy: () => void }).destroy).not.toHaveBeenCalled();
    expect((dropped as unknown as { destroy: () => void }).destroy).toHaveBeenCalled();
    expect(mounted.root.children).toEqual([]);
    mounted.scene.destroy();
  });

  it("drops a chunk drawn after the scene was destroyed", async () => {
    const visible = { chunks: [{ cx: 0, cy: 0 }] };
    const { module: camera } = fakeCamera(visible);
    let finish!: () => void;
    const gone = vi.fn();
    const drawn = { view: { name: "late", destroy: vi.fn() } as never, depth: 0, layer: SCENE_LAYER.terrain };
    const slow: SceneModule = {
      id: "slow",
      setup: () => ({
        showChunk: ({ coord }) =>
          coord.cx === 0
            ? {}
            : new Promise((resolve) => {
                finish = () => resolve({ views: [drawn], destroy: gone });
              }),
        destroy: () => {},
      }),
    };
    const { ticker, scene } = await mountScene(strip(), [camera, slow]);

    visible.chunks = [{ cx: 1, cy: 0 }];
    ticker.frame();
    await vi.waitFor(() => expect(finish).toBeDefined());
    scene.destroy();
    finish();

    await vi.waitFor(() => expect(gone).toHaveBeenCalled());
    expect((drawn.view as { destroy: () => void }).destroy).toHaveBeenCalled();
  });

  it("leaves the views of a chunk drawn after the scene was destroyed to a part that keeps them", async () => {
    const visible = { chunks: [{ cx: 0, cy: 0 }] };
    const { module: camera } = fakeCamera(visible);
    let finish!: () => void;
    const gone = vi.fn();
    const drawn = { view: { name: "late", destroy: vi.fn() } as never, depth: 0, layer: SCENE_LAYER.terrain };
    const slow: SceneModule = {
      id: "slow",
      setup: () => ({
        showChunk: ({ coord }) =>
          coord.cx === 0
            ? {}
            : new Promise((resolve) => {
                finish = () => resolve({ views: [drawn], keepsViews: true, destroy: gone });
              }),
        destroy: () => {},
      }),
    };
    const { ticker, scene } = await mountScene(strip(), [camera, slow]);

    visible.chunks = [{ cx: 1, cy: 0 }];
    ticker.frame();
    await vi.waitFor(() => expect(finish).toBeDefined());
    scene.destroy();
    finish();

    await vi.waitFor(() => expect(gone).toHaveBeenCalled());
    expect((drawn.view as { destroy: () => void }).destroy).not.toHaveBeenCalled();
  });

  it("adds and removes views in the draw order once built", async () => {
    const { module, seen } = probe("a", { views: [{ view: view("a"), depth: 1, layer: 0 }] });
    const { root, scene } = await mountScene(shore(), [module]);
    const built = seen.built as BuiltScene;
    const later = { view: { name: "later", cullable: false, destroy: vi.fn() } as never, depth: 0, layer: 0 as const };

    built.add([]);
    built.add([later]);
    expect(names(root.children)).toEqual(["later", "a"]);
    expect((later.view as { cullable: boolean }).cullable).toBe(true);

    built.placeAt(view("moving"), 0.5);
    expect(names(root.children)).toEqual(["later", "moving", "a"]);
    built.placeAt(root.children[1] as never, 2);
    expect(names(root.children)).toEqual(["later", "a", "moving"]);
    // Merged in after the views of its depth and layer already in, as a stable sort would.
    built.add([
      { view: view("front"), depth: 3, layer: 0 },
      { view: view("twin"), depth: 1, layer: 0 },
    ]);
    expect(names(root.children)).toEqual(["later", "a", "twin", "moving", "front"]);

    built.remove([]);
    built.remove([later]);
    expect(names(root.children)).toEqual(["a", "twin", "moving", "front"]);
    expect((later.view as { destroy: () => void }).destroy).toHaveBeenCalled();
    scene.destroy();
  });
});
