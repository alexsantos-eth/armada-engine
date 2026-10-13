import { useEffect, useRef } from "preact/hooks";
import { Application } from "pixi.js";
import { WIDTH, createIsometricScene } from "./core/engine";

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
      destroyScene = await createIsometricScene(app);
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