import { useEffect, useRef, useState } from "preact/hooks";
import { Application, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { ENTITY_CONFIG, PLAYER_APPEARANCE } from "./content";
import {
  WIDTH,
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

/** Keys that walk the player, by the screen direction they hold. */
const WALK_KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
} as const;
const WALKING_KEYS = new Set<string>(Object.values(WALK_KEYS).flat());
/** Keys that zoom at the centre of the view, by the factor of one press. */
const ZOOM_KEYS = new Map<string, number>([
  ["Equal", 1.25],
  ["NumpadAdd", 1.25],
  ["Minus", 0.8],
  ["NumpadSubtract", 0.8],
]);

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
      await app.init({
        width: WIDTH,
        height: window.innerHeight,
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

      // Controls: arrows/WASD walk the player (read here, since the core never reads the
      // keyboard; the simulation moves it on its next ticks), drag and wheel move the camera
      // through Pixi's events (it follows the player again as soon as it walks), +/- zoom.
      const unbindPointer = bindCameraControls(app.stage, app.renderer.screen, scene.camera);
      const held = new Set<string>();
      const walk = () =>
        setPlayerWalk(world.player, {
          up: WALK_KEYS.up.some((code) => held.has(code)),
          down: WALK_KEYS.down.some((code) => held.has(code)),
          left: WALK_KEYS.left.some((code) => held.has(code)),
          right: WALK_KEYS.right.some((code) => held.has(code)),
        });
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const zoom = ZOOM_KEYS.get(event.code);
        if (zoom !== undefined) {
          const { width, height } = app.renderer.screen;
          scene.camera.zoomAt(zoom, { x: width / 2, y: height / 2 });
        } else if (WALKING_KEYS.has(event.code)) {
          held.add(event.code);
          walk();
        } else {
          return;
        }
        event.preventDefault();
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (held.delete(event.code)) walk();
      };
      const releaseKeys = () => {
        held.clear();
        walk();
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", releaseKeys);
      stopControls = () => {
        unbindPointer();
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", releaseKeys);
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
        width: "100%",
        maxWidth: WIDTH,
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        margin: "0 auto",
        boxSizing: "border-box",
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
