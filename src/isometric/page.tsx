import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import {
  Box,
  ensureEmptyBoxTexture,
  generatePerlinTerrain,
  getIsometricBounds,
  projectBoxesToIsometric,
  renderEmptyBox,
} from "./core/engine";

const TILE_WIDTH = 20;
const TILE_HEIGHT = TILE_WIDTH / 2;
const BOX_HEIGHT = TILE_WIDTH / 3;
const TERRAIN_WIDTH = 50;
const TERRAIN_HEIGHT = 50;

// Texture colors based on elevation
const DEEP_WATER_COLORS = [
  0x0a3d5c, // -3 or lower
  0x0d4d73, // -2
  0x115d8a, // -1
];
const WATER_COLOR = 0x1e88e5; // elevation 0
const SAND_COLOR = 0xdeb887; // elevation 1
const GRASS_COLOR = 0x4caf50; // elevation >= 2

function getTextureKeyForElevation(elevation: number): string {
  if (elevation < 0) {
    // Deep water - darker as it goes deeper (invert index)
    const depth = Math.abs(elevation);
    const maxIndex = DEEP_WATER_COLORS.length - 1;
    const colorIndex = Math.max(0, maxIndex - (depth - 1));
    return `iso-tile-deep-water-${colorIndex}`;
  } else if (elevation === 0) {
    return "iso-tile-water";
  } else if (elevation === 1) {
    return "iso-tile-sand";
  } else {
    return "iso-tile-grass";
  }
}

function fillElevations(boxes: Box[], minElevation: number): Box[] {
  return boxes.flatMap((box) => {
    const targetLevel = Math.floor(box.elevation);
    const boxData = box.getData();

    // Positive elevations build a solid column from ground (0) upward.
    if (targetLevel > 0) {
      return Array.from({ length: targetLevel + 1 }, (_, index) =>
        new Box(box.x, box.y, {
          ...boxData,
          elevation: index,
        }),
      );
    }

    // Negative elevations and level 0 build a solid column from minElevation upward.
    if (targetLevel <= 0) {
      const depth = targetLevel - minElevation + 1;
      return Array.from({ length: depth }, (_, index) =>
        new Box(box.x, box.y, {
          ...boxData,
          elevation: minElevation + index,
        }),
      );
    }

    return [
      new Box(box.x, box.y, {
        ...boxData,
        elevation: 0,
      }),
    ];
  });
}

class IsometricScene extends Phaser.Scene {
  constructor() {
    super("isometric-scene");
  }

  adjustBrightness(color: number, factor: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const newR = Math.min(255, Math.floor(r * factor));
    const newG = Math.min(255, Math.floor(g * factor));
    const newB = Math.min(255, Math.floor(b * factor));

    return (newR << 16) | (newG << 8) | newB;
  }

  create() {
    // Create textures for deep water levels
    DEEP_WATER_COLORS.forEach((color, index) => {
      ensureEmptyBoxTexture(this, {
        textureKey: `iso-tile-deep-water-${index}`,
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
        boxHeight: BOX_HEIGHT,
        fillColor: color,
        leftFillColor: this.adjustBrightness(color, 0.85),
        rightFillColor: this.adjustBrightness(color, 0.7),
      });
    });

    // Create water texture (elevation 0)
    ensureEmptyBoxTexture(this, {
      textureKey: "iso-tile-water",
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
      fillColor: WATER_COLOR,
      leftFillColor: this.adjustBrightness(WATER_COLOR, 0.85),
      rightFillColor: this.adjustBrightness(WATER_COLOR, 0.7),
    });

    // Create sand texture (elevation 1)
    ensureEmptyBoxTexture(this, {
      textureKey: "iso-tile-sand",
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
      fillColor: SAND_COLOR,
      leftFillColor: this.adjustBrightness(SAND_COLOR, 0.85),
      rightFillColor: this.adjustBrightness(SAND_COLOR, 0.7),
    });

    // Create grass texture (elevation >= 2)
    ensureEmptyBoxTexture(this, {
      textureKey: "iso-tile-grass",
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
      fillColor: GRASS_COLOR,
      leftFillColor: this.adjustBrightness(GRASS_COLOR, 0.85),
      rightFillColor: this.adjustBrightness(GRASS_COLOR, 0.7),
    });

    const terrain = generatePerlinTerrain({
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
      seed: Date.now(),
      scale: 9,
      octaves: 1,
      persistence: 0.2,
      lacunarity: 20,
      minElevation: -3,
      maxElevation: 4,
    });

    const manualBoxes = terrain.map(
      (point) => new Box(point.x, point.y, { elevation: point.elevation }),
    );

    const filledElevationBoxes = fillElevations(manualBoxes, -5);

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

    // Render each box with its appropriate texture based on elevation
    centeredBoxes.forEach((box) => {
      const textureKey = getTextureKeyForElevation(box.box.elevation);
      renderEmptyBox(this, box, textureKey);
    });
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
