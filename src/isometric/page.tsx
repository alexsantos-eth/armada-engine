import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import {
  Box,
  ensureEmptyBoxTexture,
  getIsometricBounds,
  projectBoxesToIsometric,
  renderEmptyBoxLayer,
} from "./core/engine";
import { GameInitializer } from "../core/manager";
import { Match } from "../core/engine";

const TILE_WIDTH = 90;
const TILE_HEIGHT = TILE_WIDTH / 2;
const BOX_HEIGHT = TILE_WIDTH / 3;
const TILE_TEXTURE_KEY = "iso-tile-white";

function fillElevations(boxes: Box[]): Box[] {
  return boxes.flatMap((box) => {
    const topLevel = Math.max(0, Math.floor(box.elevation));
    const boxData = box.getData();

    // Build a solid column from ground level up to the requested elevation.
    return Array.from({ length: topLevel + 1 }, (_, level) =>
      new Box(box.x, box.y, {
        ...boxData,
        elevation: level,
      }),
    );
  });
}

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

    const gameSetup = new GameInitializer({}, "player").getGameSetup();
    const match = new Match({ setup: gameSetup });

    match.initializeMatch();
    const board = match.getEnemyBoard();

    const manualBoxes = Array.from({ length: board.length }, (_, x) =>
      Array.from({ length: board[x].length }, (_, y) => {
        const cell = board[x][y];
        return new Box(x, y, { elevation: cell.state === "OBSTACLE" ? 1 : 0 });
      }),
    ).flat();

    const filledElevationBoxes = fillElevations(manualBoxes);

    const zeroBasedBoxes = projectBoxesToIsometric(filledElevationBoxes, {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      elevationStep: BOX_HEIGHT,
      originX: 0,
      originY: 0,
    });

    const bounds = getIsometricBounds(zeroBasedBoxes);
    const layoutCenterX = (bounds.minX + bounds.maxX) / 2;
    const layoutCenterY = (bounds.minY + bounds.maxY) / 2;

    const centeredBoxes = projectBoxesToIsometric(filledElevationBoxes, {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      elevationStep: BOX_HEIGHT,
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
