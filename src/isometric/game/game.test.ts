import { afterEach, describe, expect, it, vi } from "vitest";
import { TERRAIN_APPEARANCE } from "../content";
import {
  bindCameraControls,
  chunkOfPoint,
  CHUNKS_LOADED_PER_FRAME,
  CLOCK_PART,
  createScene,
  getWalkDirection,
  PLAYER_PART,
  STEP_MS,
  TICKS_PER_HOUR,
  type SceneModule,
  type SceneOptions,
  type World,
} from "../core/engine";
import { KEYBOARD_ZOOM_STEP } from "../input";
import type { ChunkRequest } from "./chunk-generator";
import type { ChunkWorker } from "./chunk-prefetch";
import { mountGame, type GameOptions } from "./game";
import { createSceneModules } from "./modules";
import { bindTouchControls } from "./touch-controls";
import type * as Modules from "./modules";

const mocks = vi.hoisted(() => ({
  /** Every teardown, in order, so a test can check what is undone first. */
  teardowns: [] as string[],
  /** When set, the next app's `init()` resolves only with it. */
  nextInit: undefined as Promise<void> | undefined,
}));
const { teardowns } = mocks;

/** A chunk worker that only records what it is asked; stopping it is a teardown. */
class FakeWorker {
  static last: FakeWorker | undefined;
  readonly requests: ChunkRequest[] = [];
  onmessage: ChunkWorker["onmessage"] = null;

  constructor() {
    FakeWorker.last = this;
  }

  postMessage(request: ChunkRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    teardowns.push("worker");
  }
}

vi.mock("pixi.js", () => {
  class Application {
    init = vi.fn(() => mocks.nextInit ?? Promise.resolve());
    canvas = { nodeName: "CANVAS", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    stage = { label: "stage" };
    renderer = { screen: { x: 0, y: 0, width: 800, height: 600 } };
    ticker = { add: vi.fn(), remove: vi.fn(() => mocks.teardowns.push("ticker")) };
    destroy = vi.fn(() => mocks.teardowns.push("app"));
  }
  // Made when the engine is imported (the matrix that places shadow sprites).
  class Matrix {}
  return { Application, Matrix, UPDATE_PRIORITY: { INTERACTION: 50, HIGH: 25, NORMAL: 0, LOW: -25, UTILITY: -50 } };
});

vi.mock("../core/engine", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createScene: vi.fn(() =>
    Promise.resolve({
      services: { camera: { zoomAt: vi.fn() } },
      shownChunks: () => [],
      destroy: vi.fn(() => mocks.teardowns.push("scene")),
    }),
  ),
  bindCameraControls: vi.fn(() => () => mocks.teardowns.push("pointer")),
}));

vi.mock("./touch-controls", () => ({
  bindTouchControls: vi.fn(() => () => mocks.teardowns.push("touch")),
}));

vi.mock("./modules", async (importOriginal) => {
  const original = await importOriginal<typeof Modules>();
  return { ...original, createSceneModules: vi.fn(original.createSceneModules) };
});

type Listener = (event: unknown) => void;

/** A window that records its listeners, so a test can press keys by hand. */
const createWindow = (search = "?seed=1337&hour=15", reducedMotion?: boolean, mobile?: boolean) => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    location: { search, reload: vi.fn() },
    ...(reducedMotion === undefined && mobile === undefined
      ? {}
      : {
          matchMedia: vi.fn((query: string) => ({
            matches: query.includes("reduce") ? reducedMotion === true : mobile === true,
          })),
        }),
    devicePixelRatio: mobile ? 3 : 2,
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    performance: { now: vi.fn(() => 0), memory: { usedJSHeapSize: 2 * 1024 * 1024 } },
    addEventListener: vi.fn((type: string, fn: Listener) =>
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
    ),
    removeEventListener: vi.fn((type: string, fn: Listener) => {
      if (listeners.get(type)?.delete(fn) && type === "keydown") teardowns.push("keyboard");
    }),
    press: (code: string) =>
      listeners
        .get("keydown")
        ?.forEach((fn) => fn({ code, altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() })),
    release: (code: string) => listeners.get("keyup")?.forEach((fn) => fn({ code })),
    blur: () => listeners.get("blur")?.forEach((fn) => fn({})),
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
};

const createContainer = () => ({ appendChild: vi.fn() });

/** Player sounds that only record what they are asked to play. */
const createSounds = () => ({ play: vi.fn(), loop: vi.fn(), destroy: vi.fn() });

/** A promise the test resolves by hand, to unmount while the game is still starting. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

const mount = (search?: string, extra: Partial<GameOptions> & { reducedMotion?: boolean; mobile?: boolean } = {}) => {
  const { reducedMotion, mobile, ...more } = extra;
  const window = createWindow(search, reducedMotion, mobile);
  const container = createContainer();
  const onClockChange = vi.fn();
  const log = vi.fn();
  const game = mountGame(container as never, {
    window: window as never,
    onClockChange,
    log,
    random: () => 0.5,
    chunkWorker: () => new FakeWorker(),
    sounds: createSounds,
    ...more,
  });
  return { window, container, onClockChange, log, game };
};

type MockApp = {
  init: ReturnType<typeof vi.fn>;
  canvas: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  stage: object;
  renderer: { screen: { width: number; height: number } };
  ticker: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  destroy: ReturnType<typeof vi.fn>;
};

type MockScene = {
  services: { camera: { zoomAt: ReturnType<typeof vi.fn> } };
  destroy: ReturnType<typeof vi.fn>;
};

/** The app, world, modules, scene options and scene of the last game that reached its scene. */
const started = () => {
  const [app, world, modules, options] = vi.mocked(createScene).mock.lastCall as unknown as [
    MockApp,
    World,
    SceneModule[],
    SceneOptions,
  ];
  const scene = vi.mocked(createScene).mock.results.at(-1)!.value as Promise<MockScene>;
  return { app, world, modules, options, scene };
};

/** The simulation listener the game added to the app's ticker. */
const onTick = (app: MockApp) => app.ticker.add.mock.lastCall![0] as (ticker: { elapsedMS: number }) => void;

afterEach(() => {
  teardowns.length = 0;
  mocks.nextInit = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("mountGame", () => {
  it("fills the window with the canvas and appends it to the container", async () => {
    const { container, window, game } = mount();
    await game.ready;
    const { app } = started();

    expect(app.init).toHaveBeenCalledWith({
      resizeTo: window,
      background: "#111111",
      antialias: true,
      resolution: 2,
      autoDensity: true,
    });
    expect(container.appendChild).toHaveBeenCalledWith(app.canvas);
    expect(started().options.svgDetail).toBeUndefined();
  });

  it("draws phones with the mobile profile: canvas at most at 2×, no antialiasing, SVGs at their drawn size", async () => {
    const { window, game, log } = mount("?seed=1&perf", { mobile: true });
    await game.ready;
    const { app, options } = started();
    expect(log).toHaveBeenCalledWith("Armada perf: a report every 5 s, culling on, mobile profile");

    expect(window.devicePixelRatio).toBe(3);
    expect(app.init).toHaveBeenCalledWith(expect.objectContaining({ antialias: false, resolution: 2 }));
    expect(options.svgDetail).toBe(1);
    expect(options.releaseSvgPixels).toBe(true);

    // Chunks are kept loaded only 2 chunks around each focus, as the building load too.
    const world = started().world;
    const stream = vi.spyOn(world.chunks, "stream");
    options.stream?.([{ cx: 0, cy: 0 }], true);
    options.stream?.([{ cx: 0, cy: 0 }], false);
    expect(stream.mock.calls[0][1]).toEqual({ keepRadius: 2 });
    expect(stream.mock.calls[1][1]).toMatchObject({ keepRadius: 2 });

    // The SVGs' pixels are only on the GPU: a restored WebGL context reloads the page.
    const [type, reload] = app.canvas.addEventListener.mock.lastCall as [string, () => void];
    expect(type).toBe("webglcontextrestored");
    reload();
    expect(window.location.reload).toHaveBeenCalled();
    game.destroy();
    expect(app.canvas.removeEventListener).toHaveBeenCalledWith("webglcontextrestored", reload);

    // `?mobile=off` keeps a phone on the desktop profile, at its full pixel ratio.
    const forced = mount("?seed=1&mobile=off", { mobile: true });
    await forced.game.ready;
    expect(started().app.init).toHaveBeenCalledWith(expect.objectContaining({ antialias: true, resolution: 3 }));
    expect(started().options).toMatchObject({ svgDetail: undefined, releaseSvgPixels: false });
    expect(started().app.canvas.addEventListener).not.toHaveBeenCalled();
  });

  it("generates the world of the URL's seed and hour, logs the seed and renders it", async () => {
    const { log, game } = mount("?seed=1337&hour=15");
    await game.ready;
    const { world, modules, options } = started();

    expect(log).toHaveBeenCalledWith("Armada world seed: 1337");
    expect(world.seed).toBe(1337);
    expect(world.parts.get(CLOCK_PART).tick).toBe(15 * TICKS_PER_HOUR);
    expect(modules.map(({ id }) => id)).toEqual([
      "surface-bands",
      "terrain",
      "entities",
      "foliage-wind",
      "player",
      "ambient-light",
      "shadows",
      "camera",
      "cloud-shadows",
    ]);
    expect(options.terrain).toBe(TERRAIN_APPEARANCE);
    expect(options.interpolation?.()).toBe(0);
  });

  it("keeps loaded the chunks the camera sees and those around the player", async () => {
    const { game } = mount("?seed=7");
    await game.ready;
    const { world, options } = started();
    const home = chunkOfPoint(world.parts.get(PLAYER_PART));
    const far = { cx: home.cx + 10, cy: home.cy };

    // While the scene is built: everything the view needs, at once.
    options.stream?.([far], true);
    expect(world.chunks.has(far)).toBe(true);
    expect(world.chunks.has(home)).toBe(true);
    expect(world.chunks.has({ cx: home.cx + 5, cy: home.cy })).toBe(false);

    // On frames: a few chunks per frame, the ground around the player first.
    const next = { cx: home.cx - 10, cy: home.cy };
    options.stream?.([next], false);
    expect(world.chunks.isReady(next)).toBe(false);
    const frames = Math.ceil(9 / CHUNKS_LOADED_PER_FRAME) - 1;
    for (let frame = 0; frame < frames; frame += 1) options.stream?.([next], false);
    expect(world.chunks.isReady(next)).toBe(true);
    expect(world.chunks.isReady(home)).toBe(true);
  });

  it("asks the chunk worker for the chunks ahead on frames, never while the scene is built", async () => {
    const { game } = mount("?seed=7");
    await game.ready;
    const { world, options } = started();
    const worker = FakeWorker.last as FakeWorker;
    const away = { cx: chunkOfPoint(world.parts.get(PLAYER_PART)).cx + 20, cy: 0 };

    options.stream?.([away], true);
    expect(worker.requests).toEqual([]);
    options.stream?.([{ cx: away.cx + 10, cy: 0 }], false);

    expect(worker.requests.length).toBeGreaterThan(0);
    expect(worker.requests.every(({ seed }) => seed === 7)).toBe(true);
  });

  it("measures frames with ?perf: profiles the scene and reports what it shows", async () => {
    const { game, log, window } = mount("?seed=1&perf");
    await game.ready;
    const { app, options } = started();
    expect(log).toHaveBeenCalledWith("Armada perf: a report every 5 s, culling on, desktop profile");
    expect(options.profiler?.now).toBeTypeOf("function");

    // The monitor's listeners: the first of a frame and the last, after the render.
    const listeners = app.ticker.add.mock.calls.map(([fn, , priority]) => ({ fn, priority })) as Array<{
      fn: (ticker: { elapsedMS: number }) => void;
      priority: number;
    }>;
    const first = listeners.find(({ priority }) => priority === 50)!;
    const last = listeners.find(({ priority }) => priority === -50)!;
    first.fn({ elapsedMS: 5000 });
    last.fn({ elapsedMS: 5000 });
    const report = (log.mock.lastCall as [string])[0];
    expect(report).toContain("chunks 0");
    expect(report).toContain("js heap 2.0 MB");
    expect(window.performance.now).toHaveBeenCalled();

    game.destroy();
    expect(app.ticker.remove).toHaveBeenCalledWith(first.fn);
    expect(app.ticker.remove).toHaveBeenCalledWith(last.fn);
  });

  it("profiles nothing without ?perf, and draws everything with ?cull=off", async () => {
    const { game, log } = mount("?seed=1&cull=off&perf");
    await game.ready;
    expect(log).toHaveBeenCalledWith("Armada perf: a report every 5 s, culling off, desktop profile");
    game.destroy();

    const plain = mount("?seed=1");
    await plain.game.ready;
    expect(started().options.profiler).toBeUndefined();
  });

  it("leaves out the modules and systems the URL disables", async () => {
    const { game, log } = mount("?seed=1&modules=-shadows,-player,-fog");
    await game.ready;
    const { app, world, modules } = started();
    expect(log).toHaveBeenCalledWith("Armada ?modules= names no module: fog");
    world.parts.get(PLAYER_PART).walk = { x: 1, y: 0 };

    onTick(app)({ elapsedMS: 1000 });

    expect(modules.map(({ id }) => id)).toEqual([
      "surface-bands",
      "terrain",
      "entities",
      "foliage-wind",
      "ambient-light",
      "camera",
      "cloud-shadows",
    ]);
    expect(world.parts.get(PLAYER_PART).previous).toEqual({
      x: world.parts.get(PLAYER_PART).x,
      y: world.parts.get(PLAYER_PART).y,
      elevation: world.parts.get(PLAYER_PART).elevation,
      inset: 0,
      height: 0,
    });
  });

  it("draws a new seed from `random` when the URL has none", async () => {
    const { log, game } = mount("");
    await game.ready;

    expect(started().world.seed).toBe(2147483648);
    expect(log).toHaveBeenCalledWith("Armada world seed: 2147483648");
  });

  it("defaults to Math.random for the seed, console.info for the log and a Web Worker for the chunks", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.last = undefined;
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const game = mountGame(createContainer() as never, { window: createWindow("") as never, onClockChange: vi.fn() });
    await game.ready;

    expect(random).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("Armada world seed: 1073741824");
    expect(FakeWorker.last).toBeInstanceOf(FakeWorker);
    vi.unstubAllGlobals();
  });

  it("runs the simulation before the render on every frame and shows the clock when it ticks", async () => {
    const { onClockChange, game } = mount("?seed=1&hour=15&timeScale=60");
    await game.ready;
    const { app, world, options } = started();

    expect(app.ticker.add).toHaveBeenCalledWith(expect.any(Function), undefined, 25);
    expect(onClockChange).toHaveBeenLastCalledWith("Día 1 · 15:00 · ×60");
    expect(onClockChange).toHaveBeenCalledTimes(1);

    onTick(app)({ elapsedMS: STEP_MS / 120 });
    expect(onClockChange).toHaveBeenCalledTimes(1);
    expect(options.interpolation?.()).toBeCloseTo(0.5);

    onTick(app)({ elapsedMS: STEP_MS / 120 });
    expect(world.parts.get(CLOCK_PART).tick).toBe(15 * TICKS_PER_HOUR + 1);
    expect(onClockChange).toHaveBeenCalledTimes(2);
  });

  it("walks, runs and jumps the player with the keyboard and zooms at the centre of the view", async () => {
    const { window, game } = mount();
    await game.ready;
    const { world, scene } = started();
    const { camera } = (await scene).services;

    window.press("KeyW");
    expect(world.parts.get(PLAYER_PART).walk).toEqual(
      getWalkDirection({ up: true, down: false, left: false, right: false }),
    );

    window.press("Space");
    expect(world.parts.get(PLAYER_PART).wantsJump).toBe(true);
    expect(world.parts.get(PLAYER_PART).jumpHeld).toBe(true);
    window.release("Space");
    expect(world.parts.get(PLAYER_PART).jumpHeld).toBe(false);
    window.press("ShiftLeft");
    expect(world.parts.get(PLAYER_PART).running).toBe(true);
    window.blur();
    expect(world.parts.get(PLAYER_PART).jumpBufferTicks).toBe(0);
    expect(world.parts.get(PLAYER_PART).running).toBe(false);

    window.press("Equal");
    expect(camera.zoomAt).toHaveBeenCalledWith(KEYBOARD_ZOOM_STEP, { x: 400, y: 300 });
  });

  it("puts a joystick and a jump button over the canvas on phones, driving the player like the keyboard", async () => {
    const { game } = mount("?seed=1337", { mobile: true });
    await game.ready;
    const { app, world } = started();

    expect(bindTouchControls).toHaveBeenCalledWith(app.stage, app.renderer, expect.any(Object), app.canvas);
    const controls = vi.mocked(bindTouchControls).mock.lastCall![2];
    controls.walk({ up: false, down: false, left: true, right: false });
    expect(world.parts.get(PLAYER_PART).walk).toEqual(
      getWalkDirection({ up: false, down: false, left: true, right: false }),
    );
    controls.run(true);
    expect(world.parts.get(PLAYER_PART).running).toBe(true);
    controls.jumpHeld(true);
    controls.jump();
    expect(world.parts.get(PLAYER_PART).wantsJump).toBe(true);
    expect(world.parts.get(PLAYER_PART).jumpHeld).toBe(true);

    game.destroy();
    expect(teardowns).toEqual(["ticker", "touch", "keyboard", "pointer", "scene", "worker", "app"]);
  });

  it("shows no touch controls on desktop, and shows them there with ?mobile", async () => {
    const { game } = mount("?seed=1337");
    await game.ready;
    expect(bindTouchControls).not.toHaveBeenCalled();
    game.destroy();

    const forced = mount("?seed=1337&mobile");
    await forced.game.ready;
    expect(bindTouchControls).toHaveBeenCalledTimes(1);
  });

  it("gives the player a jetpack with ?jetpack, and none without it", async () => {
    for (const [search, jetpack] of [
      ["?seed=7&jetpack", true],
      ["?seed=7", false],
    ] as const) {
      const { game } = mount(search);
      await game.ready;
      expect(started().world.parts.get(PLAYER_PART).jetpack).toBe(jetpack);
      game.destroy();
    }
  });

  it("jumps with the keys of its options and plays the player's sounds, unless ?sound=off", async () => {
    for (const [search, heard] of [
      ["?seed=1337", true],
      ["?seed=1337&sound=off", false],
    ] as const) {
      const sounds = createSounds();
      const { window, game } = mount(search, { sounds: () => sounds, keys: { jump: ["KeyK"] } });
      await game.ready;
      const { app, world } = started();
      window.press("Space");
      expect(world.parts.get(PLAYER_PART).wantsJump).toBe(false);
      window.press("KeyK");
      onTick(app)({ elapsedMS: STEP_MS });
      expect(world.parts.get(PLAYER_PART).feedback.jumps).toBe(1);
      expect(sounds.play).toHaveBeenCalledTimes(heard ? 1 : 0);
      if (heard) expect(sounds.play).toHaveBeenCalledWith("jump");
      game.destroy();
      expect(sounds.destroy).toHaveBeenCalledTimes(heard ? 1 : 0);
      if (heard) expect(sounds.loop).toHaveBeenLastCalledWith(undefined);
      else expect(sounds.loop).not.toHaveBeenCalled();
    }
  });

  it("plays the player's sounds with Strudel unless told otherwise", async () => {
    const { game } = mount("?seed=1337", { sounds: undefined });
    await game.ready;
    game.destroy();
  });

  it("sets the player's effects from the URL, off for a player who prefers reduced motion", async () => {
    const options = async (search: string, reducedMotion?: boolean) => {
      const { game } = mount(search, { reducedMotion });
      await game.ready;
      game.destroy();
      return vi.mocked(createSceneModules).mock.lastCall?.[1]?.player;
    };

    expect(await options("?seed=1")).toEqual({ effects: true });
    expect(await options("?seed=1", false)).toEqual({ effects: true });
    expect(await options("?seed=1", true)).toEqual({ effects: false });
    expect(await options("?seed=1&effects=off")).toEqual({ effects: false });
  });

  it("does not queue a jump while the simulation is frozen", async () => {
    const { window, game } = mount("?seed=1337&timeScale=0");
    await game.ready;
    const { world } = started();
    window.press("Space");
    expect(world.parts.get(PLAYER_PART).jumpBufferTicks).toBe(0);
  });

  it("moves the camera with the pointer on the stage", async () => {
    const { game } = mount();
    await game.ready;
    const { app, scene } = started();

    expect(bindCameraControls).toHaveBeenCalledWith(
      app.stage,
      app.renderer.screen,
      (await scene).services.camera,
      app.canvas,
    );
  });

  it("walks but binds no camera controls when the scene has no camera", async () => {
    vi.mocked(createScene).mockResolvedValueOnce({ services: {}, shownChunks: () => [], destroy: vi.fn() });
    const { window, game } = mount();
    await game.ready;
    const { world } = started();

    window.press("Equal");
    window.press("KeyD");

    expect(bindCameraControls).not.toHaveBeenCalled();
    expect(world.parts.get(PLAYER_PART).walk).toEqual(
      getWalkDirection({ up: false, down: false, left: false, right: true }),
    );
  });

  it("undoes everything in reverse order when destroyed, once", async () => {
    const { window, game } = mount();
    await game.ready;
    const { app } = started();

    game.destroy();
    game.destroy();

    expect(teardowns).toEqual(["ticker", "keyboard", "pointer", "scene", "worker", "app"]);
    expect(app.ticker.remove).toHaveBeenCalledWith(onTick(app));
    expect(app.destroy).toHaveBeenCalledWith(true);
    expect(window.listenerCount()).toBe(0);
  });

  it("waits for Pixi to initialise before destroying an app unmounted while starting", async () => {
    const init = deferred<void>();
    mocks.nextInit = init.promise;
    const { container, game } = mount();

    game.destroy();
    expect(teardowns).toEqual([]);

    init.resolve();
    await game.ready;

    expect(teardowns).toEqual(["app"]);
    expect(container.appendChild).not.toHaveBeenCalled();
    expect(createScene).not.toHaveBeenCalled();
  });

  it("destroys the scene, then the app, when unmounted while the scene loads", async () => {
    const loading = deferred<Awaited<ReturnType<typeof createScene>>>();
    vi.mocked(createScene).mockReturnValueOnce(loading.promise);
    const { window, game } = mount();
    await vi.waitFor(() => expect(createScene).toHaveBeenCalled());

    game.destroy();
    expect(teardowns).toEqual([]);

    const destroyScene = vi.fn(() => teardowns.push("scene"));
    loading.resolve({ services: { camera: {} as never }, shownChunks: () => [], destroy: destroyScene });
    await game.ready;

    expect(teardowns).toEqual(["scene", "worker", "app"]);
    expect(bindCameraControls).not.toHaveBeenCalled();
    expect(window.listenerCount()).toBe(0);
  });

  it("still tears down what started when starting fails", async () => {
    vi.mocked(createScene).mockReturnValueOnce(Promise.reject(new Error("asset failed")));
    const { game } = mount();

    await expect(game.ready).rejects.toThrow("asset failed");
    game.destroy();

    expect(teardowns).toEqual(["worker", "app"]);
  });
});
