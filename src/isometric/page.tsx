import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import IsometricScene from "./core/engine/scene";
import { WIDTH } from "./core/engine/constants";

const IsometricWorld = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: WIDTH,
      height: window.innerHeight,
      parent: containerRef.current,
      backgroundColor: "#111111",
      render: {
        antialias: true,
        roundPixels: true,
        powerPreference: "high-performance",
      },
      scene: IsometricScene,
    });

    return () => {
      game.destroy(true);
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
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      />
    </section>
  );
};

export default IsometricWorld;
