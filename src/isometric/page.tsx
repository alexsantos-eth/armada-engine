import { useEffect, useRef } from "preact/hooks";
import Phaser from "phaser";
import {
  Box,
  buildFilledElevationLevels,
  ensureEmptyBoxTexture,
  ensureFlatDiamondTexture,
  ensureTexturedBoxTexture,
  generatePerlinTerrain,
  projectBoxesToIsometric,
  renderBoxTopTint,
  renderEmptyBox,
} from "./core/engine";

const DEVICE_CORES = navigator.hardwareConcurrency ?? 4;
const DEVICE_MEMORY_GB = (
  navigator as Navigator & { deviceMemory?: number }
).deviceMemory ?? 4;
const LOW_END_DEVICE = DEVICE_CORES <= 4 || DEVICE_MEMORY_GB <= 4;

const WIDTH = Math.min(window.innerWidth, LOW_END_DEVICE ? 420 : 500);
const TILE_WIDTH = Math.min(WIDTH * 0.2, LOW_END_DEVICE ? 84 : 100);

const TILE_HEIGHT = TILE_WIDTH / 2;
const BOX_HEIGHT = TILE_WIDTH / 3;
const TERRAIN_WIDTH = LOW_END_DEVICE ? 16 : 20;
const TERRAIN_HEIGHT = LOW_END_DEVICE ? 16 : 20;
const SUPPORT_MIN_ELEVATION = 0;

// Texture colors based on elevation
const DEEP_WATER_COLORS = [
  0x062f4a, // -4 or lower
  0x0a3d5c, // -3 or lower
  0x0d4d73, // -2
  0x115d8a, // -1
];
const GROUND_COLOR = 0x8d6e63; // support blocks and elevation 1
const WATER_COLOR = 0x1e88e5; // elevation 0
const GRASS_COLOR = 0x4caf50; // elevation >= 1
const GROUND_TEXTURE_KEY = "iso-tile-ground";
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
const TOP_TINT_TEXTURE_KEY = "iso-top-tint-overlay";
const VIEW_CULL_MARGIN = 120;
const TOP_TINT_OVERLAY_LIMIT = 1800;
const ENABLE_TOP_TINT_OVERLAY = false;

function getTextureKeyForElevation(
  elevation: number,
  forceGroundTexture: boolean,
  useTexturedGround: boolean,
  useTexturedGrass: boolean,
  useTexturedWater: boolean,
): string {
  if (forceGroundTexture) {
    return useTexturedGround ? TEXTURED_GROUND_KEY : GROUND_TEXTURE_KEY;
  }

  if (elevation < 0) {
    // Deep water - darker as it goes deeper (invert index)
    const depth = Math.abs(elevation);
    const maxIndex = DEEP_WATER_COLORS.length - 1;
    const colorIndex = Math.max(0, maxIndex - (depth - 1));
    return `iso-tile-deep-water-${colorIndex}`;
  } else if (elevation === 0) {
    return useTexturedWater ? TEXTURED_WATER_KEY : "iso-tile-water";
  } else if (elevation === 1) {
    return useTexturedGround ? TEXTURED_GROUND_KEY : GROUND_TEXTURE_KEY;
  } else if (elevation > 1 && useTexturedGrass) {
    return TEXTURED_GRASS_KEY;
  } else {
    return "iso-tile-grass";
  }
}

function fillElevations(boxes: Box[], minElevation: number): Box[] {
  return boxes.flatMap((box) => {
    const boxData = box.getData();

    return buildFilledElevationLevels(box.elevation, minElevation).map(
      ({ elevation, useGroundTexture }) =>
        new Box(box.x, box.y, {
          ...boxData,
          elevation,
          metadata: {
            ...boxData.metadata,
            forceGroundTexture: useGroundTexture,
          },
        }),
    );
  });
}

function isWithinViewport(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    x >= -VIEW_CULL_MARGIN &&
    x <= viewportWidth + VIEW_CULL_MARGIN &&
    y >= -VIEW_CULL_MARGIN &&
    y <= viewportHeight + VIEW_CULL_MARGIN
  );
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

    ensureEmptyBoxTexture(this, {
      textureKey: GROUND_TEXTURE_KEY,
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
      fillColor: GROUND_COLOR,
      leftFillColor: this.adjustBrightness(GROUND_COLOR, 0.85),
      rightFillColor: this.adjustBrightness(GROUND_COLOR, 0.7),
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

    ensureFlatDiamondTexture(this, {
      textureKey: TOP_TINT_TEXTURE_KEY,
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      fillColor: 0xffffff,
      fillAlpha: 1,
    });

    const terrain = generatePerlinTerrain({
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
      seed: Date.now(),
      scale: 12,
      octaves: 0,
      persistence: 0.9,
      lacunarity: 0,
      minElevation: 1,
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
    const centralBlockSize = Math.max(4, Math.min(8, TERRAIN_WIDTH - 2));
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

    const filledElevationBoxes = fillElevations(manualBoxes, SUPPORT_MIN_ELEVATION);

    // Compute isometric bounds directly from projection formula (avoids creating N intermediate objects)
    let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
    for (const box of filledElevationBoxes) {
      const sx = (box.x - box.y) * (TILE_WIDTH / 2);
      const sy = -(box.x + box.y) * (TILE_HEIGHT / 2) - box.elevation * BOX_HEIGHT;
      if (sx < bMinX) bMinX = sx;
      if (sx > bMaxX) bMaxX = sx;
      if (sy < bMinY) bMinY = sy;
      if (sy > bMaxY) bMaxY = sy;
    }
    const layoutCenterX = (bMinX + bMaxX) / 2;
    const layoutCenterY = (bMinY + bMaxY) / 2;

    const centeredBoxes = projectBoxesToIsometric(filledElevationBoxes, {
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      elevationStep: BOX_HEIGHT,
      originX: this.scale.width / 2 - layoutCenterX,
      originY: this.scale.height / 2 - layoutCenterY,
    });

    const visibleBoxes = centeredBoxes.filter((box) =>
      isWithinViewport(
        box.screenX,
        box.screenY,
        this.scale.width,
        this.scale.height,
      ),
    );

    const shouldRenderTopTintOverlay =
      ENABLE_TOP_TINT_OVERLAY && visibleBoxes.length <= TOP_TINT_OVERLAY_LIMIT;

    // Pre-compute elevation range for depth tinting.
    let minElevation = 0;
    let elevationRange = 0;
    if (visibleBoxes.length > 0) {
      const elevations = visibleBoxes.map((b) => b.box.elevation);
      minElevation = Math.min(...elevations);
      const maxElevation = Math.max(...elevations);
      elevationRange = maxElevation - minElevation;
    }

    // Render each box with its appropriate texture based on elevation
    visibleBoxes.forEach((box) => {
      const forceGroundTexture = box.box.metadata.forceGroundTexture === true;
      const textureKey = getTextureKeyForElevation(
        box.box.elevation,
        forceGroundTexture,
        canUseTexturedGround,
        canUseTexturedGrass,
        canUseTexturedWater,
      );

      // Depth tint: blocks lower than the peak appear progressively darker.
      // ratio 1.0 = at peak elevation (no tint), ratio 0.0 = deepest (darkest).
      let tint: number | undefined;
      if (elevationRange > 1) {
        const ratio = (box.box.elevation - minElevation) / elevationRange;
        const channel = Math.round(170 + ratio * (255 - 170));
        tint = (channel << 16) | (channel << 8) | channel;
      }

      renderEmptyBox(
        this,
        box,
        textureKey,
        !shouldRenderTopTintOverlay ? tint : undefined,
      );

      if (tint !== undefined && shouldRenderTopTintOverlay) {
        renderBoxTopTint(this, box, TOP_TINT_TEXTURE_KEY, tint);
      }
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

    projectedWaterSurface
      .filter((box) =>
        isWithinViewport(
          box.screenX,
          box.screenY,
          this.scale.width,
          this.scale.height,
        ),
      )
      .forEach((box) => {
        renderEmptyBox(this, box, "iso-tile-water-surface");
      });

    // this.cameras.main.filters.external?.addColorMatrix()?.colorMatrix.brightness(0.9, false);
    this.cameras.main.filters.external?.addTiltShift(0.23, 3.0, 0);
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
      width: WIDTH,
      height: window.innerHeight,
      parent: containerRef.current,
      backgroundColor: "#111111",
      render: {
        antialias: !LOW_END_DEVICE,
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
        maxWidth: "500px",
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        margin: "0 auto",
        boxSizing: "border-box",
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
