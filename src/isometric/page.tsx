import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import {
  Box,
  ensureEmptyBoxTexture,
  getIsometricBounds,
  projectBoxesToIsometric,
  renderEmptyBoxLayer,
} from "./core/engine";

const BOARD_WIDTH = 9;
const BOARD_HEIGHT = 2;
const TILE_WIDTH = 90;
const TILE_HEIGHT = TILE_WIDTH / 2;
const BOX_HEIGHT =  TILE_WIDTH / 3;
const TILE_TEXTURE_KEY = "iso-tile-white";

class IsometricScene extends Phaser.Scene {
  constructor() {
    super("isometric-scene");
  }

  create() {
    ensureEmptyBoxTexture(this, {
      textureKey: TILE_TEXTURE_KEY,
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
    });

    const manualBoxes = [new Box(0, 0), new Box(1, 0), new Box(0, 1)];

    const zeroBasedBoxes = projectBoxesToIsometric(manualBoxes, {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      originX: 0,
      originY: 0,
    });

    const bounds = getIsometricBounds(zeroBasedBoxes);
    const layoutCenterX = (bounds.minX + bounds.maxX) / 2;
    const layoutCenterY = (bounds.minY + bounds.maxY) / 2;

    const centeredBoxes = projectBoxesToIsometric(manualBoxes, {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      originX: this.scale.width / 2 - layoutCenterX,
      originY: this.scale.height / 2 - layoutCenterY,
    });

    renderEmptyBoxLayer(this, centeredBoxes, TILE_TEXTURE_KEY);
  }
}

const IsometricWorld = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 920,
      height: 640,
      parent: containerRef.current,
      backgroundColor: "#111111",
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
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 50% 20%, #232323 0%, #0b0b0b 65%)",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "min(920px, 100%)",
          overflow: "hidden",
          borderRadius: "16px",
          border: "1px solid #2f2f2f",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
        }}
      />
    </section>
  );
};

export default IsometricWorld;
