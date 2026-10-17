import { useEffect, useRef, useState } from "preact/hooks";
import { Application, CullerPlugin, extensions, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { ENTITY_CONFIG } from "./content";
import {
  WIDTH,
  createIsometricScene,
  createSimulation,
  formatClockTime,
  generateWorld,
  getClockTime,
  resolveTimeScale,
  resolveWorldSeed,
} from "./core/engine";

// Skip drawing off-screen objects (those marked `cullable`) on every frame.
extensions.add(CullerPlugin);

const IsometricWorld = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [clockLabel, setClockLabel] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const app = new Application();
    let destroyScene: (() => void) | undefined;
    let stopSimulation: (() => void) | undefined;
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
      const world = generateWorld({ seed, entityDefinitions: ENTITY_CONFIG });
      destroyScene = await createIsometricScene(app, world);
      // Unmounted while the scene was loading: the cleanup already ran without it.
      if (disposed) {
        destroyScene();
        return;
      }

      // Fixed-step simulation fed by the Pixi ticker. HIGH priority runs it before the
      // Application renders (LOW), so every frame draws the state of that frame.
      // `?timeScale=60` runs a game day in 20 real seconds.
      const timeScale = resolveTimeScale(window.location.search);
      const simulation = createSimulation(world, { timeScale });
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
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      />
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