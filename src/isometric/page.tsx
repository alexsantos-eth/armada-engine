import { useEffect, useRef, useState } from "preact/hooks";
import { Application, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { ENTITY_CONFIG, PLAYER_APPEARANCE } from "./content";
import {
  bindCameraControls,
  createIsometricScene,
  createSimulation,
  formatClockTime,
  generateWorld,
  getClockTime,
  getInterpolationAlpha,
  resolveStartTick,
  resolveTimeScale,
  resolveWorldSeed,
  setPlayerWalk,
} from "./core/engine";
import { bindKeyboardControls } from "./input";

const IsometricWorld = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [clockLabel, setClockLabel] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const app = new Application();
    let destroyScene: (() => void) | undefined;
    let stopSimulation: (() => void) | undefined;
    let stopControls: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      // The canvas fills the window and follows its size: the scene re-applies the camera and
      // culls again on every renderer resize.
      await app.init({
        resizeTo: window,
        background: "#111111",
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      });

      if (disposed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);
      // The seed is the whole world: log it so a world can be reproduced with `?seed=`.
      const seed = resolveWorldSeed(window.location.search, Math.random);
      console.info(`Armada world seed: ${seed}`);
      // `?hour=17.5` starts the day at 17:30 (debugging light; `?timeScale=0` freezes it).
      const startTick = resolveStartTick(window.location.search);
      const world = generateWorld({ seed, entityDefinitions: ENTITY_CONFIG, startTick });
      // Fixed-step simulation fed by the Pixi ticker. HIGH priority runs it before the
      // Application renders (LOW), so every frame draws the state of that frame.
      // `?timeScale=60` runs a game day in 20 real seconds.
      const timeScale = resolveTimeScale(window.location.search);
      const simulation = createSimulation(world, { timeScale });
      // The scene draws the player between its last two ticks, and the camera follows it.
      const scene = await createIsometricScene(app, world, {
        player: PLAYER_APPEARANCE,
        interpolation: () => getInterpolationAlpha(simulation.stepper),
      });
      destroyScene = scene.destroy;
      // Unmounted while the scene was loading: the cleanup already ran without it.
      if (disposed) {
        destroyScene();
        return;
      }

      // Controls: arrows/WASD walk the player (read by the app, since the core never reads the
      // keyboard; the simulation moves it on its next ticks), +/- zoom at the centre of the view,
      // and drag, wheel and pinch move the camera through Pixi's events (it follows the player
      // again as soon as it walks).
      const unbindPointer = bindCameraControls(app.stage, app.renderer.screen, scene.camera);
      const unbindKeyboard = bindKeyboardControls(window, {
        walk: (directions) => setPlayerWalk(world.player, directions),
        zoom: (factor) => {
          const { width, height } = app.renderer.screen;
          scene.camera.zoomAt(factor, { x: width / 2, y: height / 2 });
        },
      });
      stopControls = () => {
        unbindPointer();
        unbindKeyboard();
      };

      const showClock = (tick: number) => {
        const time = getClockTime(tick);
        const speed = timeScale === 1 ? "" : ` · ×${timeScale}`;
        setClockLabel(`Día ${time.day + 1} · ${formatClockTime(time)}${speed}`);
      };
      const onTick = (ticker: Ticker) => {
        const { steps, tick } = simulation.frame(ticker.elapsedMS);
        if (steps > 0) showClock(tick);
      };
      showClock(world.clock.tick);
      app.ticker.add(onTick, undefined, UPDATE_PRIORITY.HIGH);
      stopSimulation = () => app.ticker.remove(onTick);
    })();

    return () => {
      disposed = true;
      stopSimulation?.();
      stopControls?.();
      destroyScene?.();
      app.destroy(true);
    };
  }, []);

  return (
    <section
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />
      {/* Always mounted, after the canvas container: a conditional first child would make
          Preact reuse the container's element and move the canvas into the label. */}
      <div
        aria-hidden={clockLabel === ""}
        style={{
          display: clockLabel === "" ? "none" : "block",
          position: "absolute",
          top: 12,
          left: 12,
          padding: "4px 8px",
          borderRadius: 4,
          background: "rgba(0, 0, 0, 0.55)",
          color: "#f2f2f2",
          font: "13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
          pointerEvents: "none",
        }}
      >
        {clockLabel}
      </div>
    </section>
  );
};

export default IsometricWorld;
