import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_APPEARANCE } from "../content";
import {
  bindCameraControls,
  createIsometricScene,
  getWalkDirection,
  STEP_MS,
  TICKS_PER_HOUR,
  type IsometricSceneOptions,
  type World,
} from "../core/engine";
import { KEYBOARD_ZOOM_STEP } from "../input";
import { mountGame } from "./game";

const mocks = vi.hoisted(() => ({
  /** Every teardown, in order, so a test can check what is undone first. */
  teardowns: [] as string[],
  /** When set, the next app's `init()` resolves only with it. */
  nextInit: undefined as Promise<void> | undefined,
}));
const { teardowns } = mocks;

vi.mock("pixi.js", () => {
  class Application {
    init = vi.fn(() => mocks.nextInit ?? Promise.resolve());
    canvas = { nodeName: "CANVAS" };
    stage = { label: "stage" };
    renderer = { screen: { x: 0, y: 0, width: 800, height: 600 } };
    ticker = { add: vi.fn(), remove: vi.fn(() => mocks.teardowns.push("ticker")) };
    destroy = vi.fn(() => mocks.teardowns.push("app"));
  }
  return { Application, UPDATE_PRIORITY: { HIGH: 50, NORMAL: 0, LOW: -25 } };
});

vi.mock("../core/engine", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createIsometricScene: vi.fn(() =>
    Promise.resolve({
      camera: { zoomAt: vi.fn() },
      destroy: vi.fn(() => mocks.teardowns.push("scene")),
    }),
  ),
  bindCameraControls: vi.fn(() => () => mocks.teardowns.push("pointer")),
}));

type Listener = (event: unknown) => void;

/** A window that records its listeners, so a test can press keys by hand. */
const createWindow = (search = "?seed=1337&hour=15") => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    location: { search },
    devicePixelRatio: 2,
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
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
};

const createContainer = () => ({ appendChild: vi.fn() });

/** A promise the test resolves by hand, to unmount while the game is still starting. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

const mount = (search?: string) => {
  const window = createWindow(search);
  const container = createContainer();
  const onClockChange = vi.fn();
  const log = vi.fn();
  const game = mountGame(container as never, { window: window as never, onClockChange, log, random: () => 0.5 });
  return { window, container, onClockChange, log, game };
};

type MockApp = {
  init: ReturnType<typeof vi.fn>;
  canvas: object;
  stage: object;
  renderer: { screen: { width: number; height: number } };
  ticker: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  destroy: ReturnType<typeof vi.fn>;
};

type MockScene = { camera: { zoomAt: ReturnType<typeof vi.fn> }; destroy: ReturnType<typeof vi.fn> };

/** The app, world, scene options and scene of the last game that reached its scene. */
const started = () => {
  const [app, world, options] = vi.mocked(createIsometricScene).mock.lastCall as unknown as [
    MockApp,
    World,
    IsometricSceneOptions,
  ];
  const scene = vi.mocked(createIsometricScene).mock.results.at(-1)!.value as Promise<MockScene>;
  return { app, world, options, scene };
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
  });

  it("generates the world of the URL's seed and hour, logs the seed and renders it", async () => {
    const { log, game } = mount("?seed=1337&hour=15");
    await game.ready;
    const { world, options } = started();

    expect(log).toHaveBeenCalledWith("Armada world seed: 1337");
    expect(world.seed).toBe(1337);
    expect(world.clock.tick).toBe(15 * TICKS_PER_HOUR);
    expect(options.player).toBe(PLAYER_APPEARANCE);
    expect(options.interpolation?.()).toBe(0);
  });

  it("draws a new seed from `random` when the URL has none", async () => {
    const { log, game } = mount("");
    await game.ready;

    expect(started().world.seed).toBe(2147483648);
    expect(log).toHaveBeenCalledWith("Armada world seed: 2147483648");
  });

  it("defaults to Math.random for the seed and console.info for the log", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const game = mountGame(createContainer() as never, { window: createWindow("") as never, onClockChange: vi.fn() });
    await game.ready;

    expect(random).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("Armada world seed: 1073741824");
  });

  it("runs the simulation before the render on every frame and shows the clock when it ticks", async () => {
    const { onClockChange, game } = mount("?seed=1&hour=15&timeScale=60");
    await game.ready;
    const { app, world, options } = started();

    expect(app.ticker.add).toHaveBeenCalledWith(expect.any(Function), undefined, 50);
    expect(onClockChange).toHaveBeenLastCalledWith("Día 1 · 15:00 · ×60");
    expect(onClockChange).toHaveBeenCalledTimes(1);

    onTick(app)({ elapsedMS: STEP_MS / 120 });
    expect(onClockChange).toHaveBeenCalledTimes(1);
    expect(options.interpolation?.()).toBeCloseTo(0.5);

    onTick(app)({ elapsedMS: STEP_MS / 120 });
    expect(world.clock.tick).toBe(15 * TICKS_PER_HOUR + 1);
    expect(onClockChange).toHaveBeenCalledTimes(2);
  });

  it("walks the player with the keyboard and zooms at the centre of the view", async () => {
    const { window, game } = mount();
    await game.ready;
    const { world, scene } = started();
    const { camera } = await scene;

    window.press("KeyW");
    expect(world.player.walk).toEqual(getWalkDirection({ up: true, down: false, left: false, right: false }));

    window.press("Equal");
    expect(camera.zoomAt).toHaveBeenCalledWith(KEYBOARD_ZOOM_STEP, { x: 400, y: 300 });
  });

  it("moves the camera with the pointer on the stage", async () => {
    const { game } = mount();
    await game.ready;
    const { app, scene } = started();

    expect(bindCameraControls).toHaveBeenCalledWith(app.stage, app.renderer.screen, (await scene).camera);
  });

  it("undoes everything in reverse order when destroyed, once", async () => {
    const { window, game } = mount();
    await game.ready;
    const { app } = started();

    game.destroy();
    game.destroy();

    expect(teardowns).toEqual(["ticker", "keyboard", "pointer", "scene", "app"]);
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
    expect(createIsometricScene).not.toHaveBeenCalled();
  });

  it("destroys the scene, then the app, when unmounted while the scene loads", async () => {
    const loading = deferred<Awaited<ReturnType<typeof createIsometricScene>>>();
    vi.mocked(createIsometricScene).mockReturnValueOnce(loading.promise);
    const { window, game } = mount();
    await vi.waitFor(() => expect(createIsometricScene).toHaveBeenCalled());

    game.destroy();
    expect(teardowns).toEqual([]);

    const destroyScene = vi.fn(() => teardowns.push("scene"));
    loading.resolve({ camera: {} as never, destroy: destroyScene });
    await game.ready;

    expect(teardowns).toEqual(["scene", "app"]);
    expect(bindCameraControls).not.toHaveBeenCalled();
    expect(window.listenerCount()).toBe(0);
  });

  it("still tears down what started when starting fails", async () => {
    vi.mocked(createIsometricScene).mockReturnValueOnce(Promise.reject(new Error("asset failed")));
    const { game } = mount();

    await expect(game.ready).rejects.toThrow("asset failed");
    game.destroy();

    expect(teardowns).toEqual(["app"]);
  });
});
