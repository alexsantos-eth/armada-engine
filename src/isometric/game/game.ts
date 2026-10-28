import { Application, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { ENTITY_CONFIG, TERRAIN_APPEARANCE } from "../content";
import {
  bindCameraControls,
  CHUNK_PREFETCH_RADIUS,
  chunkOfPoint,
  CHUNKS_LOADED_PER_FRAME,
  CLOCK_PART,
  createScene,
  createSimulation,
  generateWorld,
  getInterpolationAlpha,
  PLAYER_PART,
  jumpPlayer,
  setPlayerWalk,
  type RandomSource,
  type PhaseLighting,
} from "../core/engine";
import { bindKeyboardControls } from "../input";
import { type ChunkWorker, createChunkPrefetch, startChunkWorker } from "./chunk-prefetch";
import { formatClockLabel, resolveLaunchOptions } from "./launch";
import { createSceneModules, createWorldParts, createWorldSystems, findUnknownModules } from "./modules";
import { PERF_REPORT_MS, startPerfMonitor } from "./perf";

/** Where and how a game runs. */
export type GameOptions = {
  /**
   * The browser window: the canvas follows its size (`resizeTo`), the launch options come from
   * its URL and the keyboard is read on it.
   */
  readonly window: Window;
  /** Called with the clock label (`formatClockLabel()`) when the game starts and on every tick. */
  readonly onClockChange: (label: string) => void;
  /** Source of a new world seed when the URL has none. Defaults to `Math.random`. */
  readonly random?: RandomSource;
  /** Where the world seed is reported, so a world can be reproduced. Defaults to `console.info`. */
  readonly log?: (message: string) => void;
  /** Starts the worker that generates the chunks ahead of the camera. Defaults to `startChunkWorker()`. */
  readonly chunkWorker?: () => ChunkWorker;
  /** Optional shared phase controller for explicit lighting transitions. Defaults to stable daylight. */
  readonly lighting?: PhaseLighting;
};

/** A running game (`mountGame()`). */
export type Game = {
  /** Settles when the game has started, or stopped starting because it was destroyed; rejects if starting failed. */
  readonly ready: Promise<void>;
  /**
   * Stops the game and frees it: simulation, keyboard and pointer controls, scene, chunk worker and
   * Pixi app, in that order. Safe to call at any time and more than once; while the game is still starting, the
   * teardown waits for the step in progress, so nothing is created on a destroyed app.
   */
  readonly destroy: () => void;
};

/**
 * Starts the game in `container`: the layer between the page and the core that wires them
 * together, so the page only declares where the game goes and what it shows.
 *
 * It creates the Pixi app (filling `window`), resolves the launch options from the URL, generates
 * the world with the game content (unbounded, by chunks), runs its fixed-step simulation on the
 * app's ticker (`HIGH` priority, before the render), renders it with the modules of
 * `createSceneModules()` while streaming the chunks around the player and those the camera sees
 * (`world.chunks.stream()`, a few per frame once started, those ahead generated in a worker:
 * `createChunkPrefetch()`), and binds
 * the controls: pointer on the stage (drag, wheel, pinch, when the scene has a camera) and
 * keyboard on the window (walk, zoom at the centre of the view).
 */
export function mountGame(container: HTMLElement, options: GameOptions): Game {
  const { window, onClockChange, random = Math.random, log = console.info, chunkWorker = startChunkWorker } = options;
  const app = new Application();
  // Undone in reverse order: each step registers its teardown as soon as it exists.
  const teardowns: Array<() => void> = [];
  let starting = true;
  let destroyed = false;

  const teardown = () => {
    while (teardowns.length > 0) teardowns.pop()!();
  };

  const start = async () => {
    await app.init({
      resizeTo: window,
      background: "#111111",
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    teardowns.push(() => app.destroy(true));
    if (destroyed) return;

    container.appendChild(app.canvas);
    const { seed, startTick, timeScale, disabledModules, perf, cull } = resolveLaunchOptions(
      window.location.search,
      random,
    );
    log(`Armada world seed: ${seed}`);
    const unknown = findUnknownModules(disabledModules);
    if (unknown.length > 0) log(`Armada ?modules= names no module: ${unknown.join(", ")}`);
    const world = generateWorld({ seed, entityDefinitions: ENTITY_CONFIG, parts: createWorldParts(startTick) });
    const simulation = createSimulation(world, { timeScale, systems: createWorldSystems(disabledModules) });
    const prefetch = createChunkPrefetch(world, chunkWorker());
    teardowns.push(prefetch.destroy);
    // `?perf`: frames are measured from the first ticker listener to after the render.
    const monitor = perf
      ? startPerfMonitor(app, {
          now: () => window.performance.now(),
          log,
          heapBytes: () => (window.performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize,
        })
      : undefined;
    if (monitor) {
      teardowns.push(monitor.destroy);
      log(`Armada perf: a report every ${PERF_REPORT_MS / 1000} s, culling ${cull ? "on" : "off"}`);
    }
    // The scene draws the player between its last two ticks, and the camera follows it. The world
    // keeps loaded the ground around the player first and what the camera sees, wherever the
    // camera is: all at once while the scene is built, then a few chunks per frame. The chunks
    // ahead of the camera are generated in the worker, and load once they are ready.
    const scene = await createScene(
      app,
      world,
      createSceneModules(disabledModules, { cull, lighting: options.lighting }),
      {
        terrain: TERRAIN_APPEARANCE,
        profiler: monitor?.profiler,
        interpolation: () => getInterpolationAlpha(simulation.stepper),
        stream: (visible, building) => {
          const focus = [chunkOfPoint(world.parts.get(PLAYER_PART)), ...visible];
          if (building) return world.chunks.stream(focus);
          prefetch.request(focus);
          return world.chunks.stream(focus, {
            prefetchRadius: CHUNK_PREFETCH_RADIUS,
            maxLoads: CHUNKS_LOADED_PER_FRAME,
            prefetchPrepared: true,
          });
        },
      },
    );
    teardowns.push(scene.destroy);
    if (destroyed) return;
    monitor?.watch(scene);

    const { camera } = scene.services;
    if (camera) teardowns.push(bindCameraControls(app.stage, app.renderer.screen, camera, app.canvas));
    teardowns.push(
      bindKeyboardControls(window, {
        walk: (directions) => setPlayerWalk(world.parts.get(PLAYER_PART), directions),
        jump: () => jumpPlayer(world.parts.get(PLAYER_PART)),
        zoom: (factor) => {
          const { width, height } = app.renderer.screen;
          camera?.zoomAt(factor, { x: width / 2, y: height / 2 });
        },
      }),
    );

    const onTick = (ticker: Ticker) => {
      const { steps, tick } = simulation.frame(ticker.elapsedMS);
      if (steps > 0) onClockChange(formatClockLabel(tick, timeScale));
    };
    onClockChange(formatClockLabel(world.parts.get(CLOCK_PART).tick, timeScale));
    app.ticker.add(onTick, undefined, UPDATE_PRIORITY.HIGH);
    teardowns.push(() => app.ticker.remove(onTick));
  };

  const ready = start().finally(() => {
    starting = false;
    if (destroyed) teardown();
  });

  return {
    ready,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (!starting) teardown();
    },
  };
}
