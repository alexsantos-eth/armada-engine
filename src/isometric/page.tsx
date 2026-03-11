import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import {
  Box,
  ensureEmptyBoxTexture,
  ensureFlatDiamondTexture,
  generatePerlinTerrain,
  getIsometricBounds,
  projectBoxesToIsometric,
  renderEmptyBox,
} from "./core/engine";

const TILE_WIDTH = Math.min(window.innerWidth * 0.2, 100);
const TILE_HEIGHT = TILE_WIDTH / 2;
const BOX_HEIGHT = TILE_WIDTH / 3;
const TERRAIN_WIDTH = 30;
const TERRAIN_HEIGHT = 30;

// Texture colors based on elevation
const DEEP_WATER_COLORS = [
  0x062f4a, // -4 or lower
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

    // Always build a solid column from the global minimum up to the target level.
    if (targetLevel < minElevation) {
      return [
        new Box(box.x, box.y, {
          ...boxData,
          elevation: targetLevel,
        }),
      ];
    }

    const depth = targetLevel - minElevation + 1;
    return Array.from(
      { length: depth },
      (_, index) =>
        new Box(box.x, box.y, {
          ...boxData,
          elevation: minElevation + index,
        }),
    );
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

    // Create transparent blue water surface for elevation -1 tiles
    const TRANSPARENT_WATER_COLOR = 0x1e88e5;
    ensureFlatDiamondTexture(this, {
      textureKey: "iso-tile-water-surface",
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      fillColor: TRANSPARENT_WATER_COLOR,
      fillAlpha: 0.4,
    });

    const terrain = generatePerlinTerrain({
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
      seed: Date.now(),
      scale: 5,
      octaves: 0,
      persistence: 0.2,
      lacunarity: 0,
      minElevation: -3,
      maxElevation: 5,
    });

    // Generate 30x30 terrain
    const manualBoxes = terrain.map((row) => {
      const box = new Box(row.x, row.y, { elevation: row.elevation });
      return box;
    });

    // Force a centered 8x8 block:
    // - default elevation 0
    // - first row and first column elevation 1
    const centerX = Math.floor(TERRAIN_WIDTH / 2);
    const centerY = Math.floor(TERRAIN_HEIGHT / 2);
    const centralBlockSize = 8;
    const halfSize = Math.floor(centralBlockSize / 2);
    const startX = centerX - halfSize;
    const startY = centerY - halfSize;
    const endX = startX + centralBlockSize;
    const endY = startY + centralBlockSize;

    manualBoxes.forEach((box) => {
      const isInCenterBlock =
        box.x >= startX && box.x < endX && box.y >= startY && box.y < endY;

      if (!isInCenterBlock) {
        return;
      }

      const isFirstRow = box.y === startY;
      const isFirstColumn = box.x === startX;

      if (isFirstRow || isFirstColumn) {
        box.update({ elevation: 1 });
      } else {
        box.update({ elevation: 0 });
      }
    });

    const filledElevationBoxes = fillElevations(manualBoxes, -1);

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

    // Find tiles with negative elevation and add transparent water surface at elevation 0
    const maxElevationByTile = new Map<string, number>();
    filledElevationBoxes.forEach((box) => {
      const key = `${box.x},${box.y}`;
      const currentMax = maxElevationByTile.get(key) ?? -Infinity;
      maxElevationByTile.set(key, Math.max(currentMax, box.elevation));
    });

    const waterSurfaceBoxes: Box[] = [];
    maxElevationByTile.forEach((maxElevation, key) => {
      if (maxElevation < 0) {
        const [x, y] = key.split(",").map(Number);
        waterSurfaceBoxes.push(
          new Box(x, y, {
            elevation: 0,
          }),
        );
      }
    });

    // Project and render the transparent water surface boxes
    const projectedWaterSurface = projectBoxesToIsometric(waterSurfaceBoxes, {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      elevationStep: BOX_HEIGHT,
      originX: this.scale.width / 2 - layoutCenterX,
      originY: this.scale.height / 2 - layoutCenterY,
    });

    projectedWaterSurface.forEach((box) => {
      renderEmptyBox(this, box, "iso-tile-water-surface");
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
      width: window.innerWidth,
      height: window.innerHeight,
      parent: containerRef.current,
      backgroundColor: "#111111",
      pixelArt: true,
      roundPixels: true,
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
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 50% 20%, #232323 0%, #0b0b0b 65%)",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
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
