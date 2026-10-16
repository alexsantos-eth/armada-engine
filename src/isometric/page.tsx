import { useEffect, useRef } from "preact/hooks";
import { Application } from "pixi.js";
import { WIDTH, createIsometricScene, generateWorld, resolveWorldSeed } from "./core/engine";

const IsometricWorld = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const app = new Application();
    let destroyScene: (() => void) | undefined;
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
      const world = generateWorld({ seed });
      destroyScene = await createIsometricScene(app, world);
    })();

    return () => {
      disposed = true;
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
      }}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      />
    </section>
  );
};

export default IsometricWorld;