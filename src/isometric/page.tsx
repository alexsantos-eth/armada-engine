import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import {
  Box,
  ensureEmptyBoxTexture,
  ensureFlatDiamondTexture,
  ensureTexturedBoxTexture,
  generatePerlinTerrain,
  getIsometricBounds,
  projectBoxesToIsometric,
  renderEmptyBox,
} from "./core/engine";

const TILE_WIDTH = Math.min(window.innerWidth * 0.2, 100);

const TILE_HEIGHT = TILE_WIDTH / 2;
const BOX_HEIGHT = TILE_WIDTH / 3;
const TERRAIN_WIDTH = 50;
const TERRAIN_HEIGHT = 50;

// Texture colors based on elevation
const DEEP_WATER_COLORS = [
  0x062f4a, // -4 or lower
  0x0a3d5c, // -3 or lower
  0x0d4d73, // -2
  0x115d8a, // -1
];
const WATER_COLOR = 0x1e88e5; // elevation 0
const GRASS_COLOR = 0x4caf50; // elevation >= 1
const TEXTURED_GROUND_KEY = "iso-tile-ground-textured";
const TEXTURED_GRASS_KEY = "iso-tile-grass-textured";

const GROUND_TOP_TEXTURE_KEY = "iso-ground-top";
const GROUND_LEFT_TEXTURE_KEY = "iso-ground-left";
const GROUND_RIGHT_TEXTURE_KEY = "iso-ground-right";

const GRASS_TOP_TEXTURE_KEY = "iso-grass-top";
const GRASS_LEFT_TEXTURE_KEY = "iso-grass-left";
const GRASS_RIGHT_TEXTURE_KEY = "iso-grass-right";

const TEXTURED_WATER_KEY = "iso-tile-water-textured";
const WATER_TOP_TEXTURE_KEY = "iso-water-top";
const WATER_LEFT_TEXTURE_KEY = "iso-water-left";
const WATER_RIGHT_TEXTURE_KEY = "iso-water-right";

function getTextureKeyForElevation(
  elevation: number,
  useTexturedGround: boolean,
  useTexturedGrass: boolean,
  useTexturedWater: boolean,
): string {
  if (elevation < 0) {
    // Deep water - darker as it goes deeper (invert index)
    const depth = Math.abs(elevation);
    const maxIndex = DEEP_WATER_COLORS.length - 1;
    const colorIndex = Math.max(0, maxIndex - (depth - 1));
    return `iso-tile-deep-water-${colorIndex}`;
  } else if (elevation === 0) {
    return useTexturedWater ? TEXTURED_WATER_KEY : "iso-tile-water";
  } else if (elevation === 1 && useTexturedGround) {
    return TEXTURED_GROUND_KEY;
  } else if (elevation > 1 && useTexturedGrass) {
    return TEXTURED_GRASS_KEY;
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

  preload() {
    this.load.image(GROUND_TOP_TEXTURE_KEY, "/assets/ground/top.png");
    this.load.image(GROUND_LEFT_TEXTURE_KEY, "/assets/ground/left.png");
    this.load.image(GROUND_RIGHT_TEXTURE_KEY, "/assets/ground/right.png");

    this.load.image(GRASS_TOP_TEXTURE_KEY, "/assets/grass/top.png");
    this.load.image(GRASS_LEFT_TEXTURE_KEY, "/assets/grass/left.png");
    this.load.image(GRASS_RIGHT_TEXTURE_KEY, "/assets/grass/right.png");

    this.load.image(WATER_TOP_TEXTURE_KEY, "/assets/water/top.png");
    this.load.image(WATER_LEFT_TEXTURE_KEY, "/assets/water/left.png");
    this.load.image(WATER_RIGHT_TEXTURE_KEY, "/assets/water/right.png");
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

    // Create grass texture (elevation >= 1)
    ensureEmptyBoxTexture(this, {
      textureKey: "iso-tile-grass",
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
      fillColor: GRASS_COLOR,
      leftFillColor: this.adjustBrightness(GRASS_COLOR, 0.85),
      rightFillColor: this.adjustBrightness(GRASS_COLOR, 0.7),
    });

    const hasGroundFaceTextures =
      this.textures.exists(GROUND_TOP_TEXTURE_KEY) &&
      this.textures.exists(GROUND_LEFT_TEXTURE_KEY) &&
      this.textures.exists(GROUND_RIGHT_TEXTURE_KEY);

    if (hasGroundFaceTextures) {
      ensureTexturedBoxTexture(this, {
        textureKey: TEXTURED_GROUND_KEY,
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
        boxHeight: BOX_HEIGHT,
        topTextureKey: GROUND_TOP_TEXTURE_KEY,
        leftTextureKey: GROUND_LEFT_TEXTURE_KEY,
        rightTextureKey: GROUND_RIGHT_TEXTURE_KEY,
           topIsPreformed: true,
      });
    }

    const hasGrassFaceTextures =
      this.textures.exists(GRASS_TOP_TEXTURE_KEY) &&
      this.textures.exists(GRASS_LEFT_TEXTURE_KEY) &&
      this.textures.exists(GRASS_RIGHT_TEXTURE_KEY);

    if (hasGrassFaceTextures) {
      ensureTexturedBoxTexture(this, {
        textureKey: TEXTURED_GRASS_KEY,
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
        boxHeight: BOX_HEIGHT,
        topTextureKey: GRASS_TOP_TEXTURE_KEY,
        leftTextureKey: GRASS_LEFT_TEXTURE_KEY,
        rightTextureKey: GRASS_RIGHT_TEXTURE_KEY,
        topIsPreformed: true,
      });
    }

    const canUseTexturedGround = this.textures.exists(TEXTURED_GROUND_KEY);
    const canUseTexturedGrass = this.textures.exists(TEXTURED_GRASS_KEY);

    const hasWaterFaceTextures =
      this.textures.exists(WATER_TOP_TEXTURE_KEY) &&
      this.textures.exists(WATER_LEFT_TEXTURE_KEY) &&
      this.textures.exists(WATER_RIGHT_TEXTURE_KEY);

    if (hasWaterFaceTextures) {
      ensureTexturedBoxTexture(this, {
        textureKey: TEXTURED_WATER_KEY,
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
        boxHeight: BOX_HEIGHT,
        topTextureKey: WATER_TOP_TEXTURE_KEY,
        leftTextureKey: WATER_LEFT_TEXTURE_KEY,
        rightTextureKey: WATER_RIGHT_TEXTURE_KEY,
        topIsPreformed: true,
      });
    }

    const canUseTexturedWater = this.textures.exists(TEXTURED_WATER_KEY);

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
      scale: 12,
      octaves: 0,
      persistence: 0.9,
      lacunarity: 0,
      minElevation:0,
      maxElevation: 3,
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

    // Pre-compute elevation range for depth tinting
    const elevations = centeredBoxes.map((b) => b.box.elevation);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationRange = maxElevation - minElevation;

    // Render each box with its appropriate texture based on elevation
    centeredBoxes.forEach((box) => {
      const textureKey = getTextureKeyForElevation(
        box.box.elevation,
        canUseTexturedGround,
        canUseTexturedGrass,
      canUseTexturedWater,
    );

      // Depth tint: blocks lower than the peak appear progressively darker.
      // ratio 1.0 = at peak elevation (no tint), ratio 0.0 = deepest (darkest).
      let tint: number | undefined;
      if (elevationRange > 0) {
        const ratio = (box.box.elevation - minElevation) / elevationRange;
        // Map ratio → [120, 255]: far below = channel 120 (~47%), at peak = 255 (no darkening).
        const channel = Math.round(150 + ratio * (255 - 150));
        tint = (channel << 16) | (channel << 8) | channel;
      }

      renderEmptyBox(this, box, textureKey, tint);
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
