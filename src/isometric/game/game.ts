import { Application, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { ENTITY_CONFIG, TERRAIN_APPEARANCE } from "../content";
import {
  bindCameraControls,
  chunkOfPoint,
  CLOCK_PART,
  createScene,
  createSimulation,
  generateWorld,
  getInterpolationAlpha,
  PLAYER_PART,
  setPlayerWalk,
  type RandomSource,
} from "../core/engine";
import { bindKeyboardControls } from "../input";
import { formatClockLabel, resolveLaunchOptions } from "./launch";
import { createSceneModules, createWorldParts, createWorldSystems, findUnknownModules } from "./modules";

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
};

/** A running game (`mountGame()`). */
export type Game = {
  /** Settles when the game has started, or stopped starting because it was destroyed; rejects if starting failed. */
  readonly ready: Promise<void>;
  /**
   * Stops the game and frees it: simulation, keyboard and pointer controls, scene and Pixi app, in
   * that order. Safe to call at any time and more than once; while the game is still starting, the
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
 * `createSceneModules()` while streaming the chunks the camera sees and those around the player
 * (`world.chunks.stream()`), and binds
 * the controls: pointer on the stage (drag, wheel, pinch, when the scene has a camera) and
 * keyboard on the window (walk, zoom at the centre of the view).
 */
export function mountGame(container: HTMLElement, options: GameOptions): Game {
  const { window, onClockChange, random = Math.random, log = console.info } = options;
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
    const { seed, startTick, timeScale, disabledModules } = resolveLaunchOptions(window.location.search, random);
    log(`Armada world seed: ${seed}`);
    const unknown = findUnknownModules(disabledModules);
    if (unknown.length > 0) log(`Armada ?modules= names no module: ${unknown.join(", ")}`);
    const world = generateWorld({ seed, entityDefinitions: ENTITY_CONFIG, parts: createWorldParts(startTick) });
    const simulation = createSimulation(world, { timeScale, systems: createWorldSystems(disabledModules) });
    // The scene draws the player between its last two ticks, and the camera follows it. The world
    // keeps loaded what the camera sees and the ground around the player, wherever the camera is.
    const scene = await createScene(app, world, createSceneModules(disabledModules), {
      terrain: TERRAIN_APPEARANCE,
      interpolation: () => getInterpolationAlpha(simulation.stepper),
      stream: (visible) => world.chunks.stream([...visible, chunkOfPoint(world.parts.get(PLAYER_PART))]),
    });
    teardowns.push(scene.destroy);
    if (destroyed) return;

    const { camera } = scene.services;
    if (camera) teardowns.push(bindCameraControls(app.stage, app.renderer.screen, camera));
    teardowns.push(
      bindKeyboardControls(window, {
        walk: (directions) => setPlayerWalk(world.parts.get(PLAYER_PART), directions),
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
