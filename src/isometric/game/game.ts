import { Application, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { ENTITY_CONFIG, PLAYER_APPEARANCE } from "../content";
import {
  bindCameraControls,
  createIsometricScene,
  createSimulation,
  generateWorld,
  getInterpolationAlpha,
  setPlayerWalk,
  type RandomSource,
} from "../core/engine";
import { bindKeyboardControls } from "../input";
import { formatClockLabel, resolveLaunchOptions } from "./launch";

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
 * the world with the game content, runs its fixed-step simulation on the app's ticker (`HIGH`
 * priority, before the render), renders it with the player, and binds the controls: pointer on
 * the stage (drag, wheel, pinch) and keyboard on the window (walk, zoom at the centre of the view).
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
    const { seed, startTick, timeScale } = resolveLaunchOptions(window.location.search, random);
    log(`Armada world seed: ${seed}`);
    const world = generateWorld({ seed, entityDefinitions: ENTITY_CONFIG, startTick });
    const simulation = createSimulation(world, { timeScale });
    // The scene draws the player between its last two ticks, and the camera follows it.
    const scene = await createIsometricScene(app, world, {
      player: PLAYER_APPEARANCE,
      interpolation: () => getInterpolationAlpha(simulation.stepper),
    });
    teardowns.push(scene.destroy);
    if (destroyed) return;

    teardowns.push(bindCameraControls(app.stage, app.renderer.screen, scene.camera));
    teardowns.push(
      bindKeyboardControls(window, {
        walk: (directions) => setPlayerWalk(world.player, directions),
        zoom: (factor) => {
          const { width, height } = app.renderer.screen;
          scene.camera.zoomAt(factor, { x: width / 2, y: height / 2 });
        },
      }),
    );

    const onTick = (ticker: Ticker) => {
      const { steps, tick } = simulation.frame(ticker.elapsedMS);
      if (steps > 0) onClockChange(formatClockLabel(tick, timeScale));
    };
    onClockChange(formatClockLabel(world.clock.tick, timeScale));
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
