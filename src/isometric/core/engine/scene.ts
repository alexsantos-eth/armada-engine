import Phaser from "phaser";
import {
  renderEmptyBox,
} from "./render";

import { addShipToBoxes, Box, Ship } from "./entities";

import { projectBoxesToIsometric } from "./board";

import { getOrCreateTerrain } from "./terrain";

import {
  TERRAIN_WIDTH,
  TERRAIN_HEIGHT,
  DEEP_WATER_COLORS,
  TEXTURED_GROUND_KEY,
  TEXTURED_GRASS_KEY,
  TEXTURED_WATER_KEY,
  GROUND_TOP_TEXTURE_KEY,
  GROUND_LEFT_TEXTURE_KEY,
  GROUND_RIGHT_TEXTURE_KEY,
  GRASS_TOP_TEXTURE_KEY,
  GRASS_LEFT_TEXTURE_KEY,
  GRASS_RIGHT_TEXTURE_KEY,
  WATER_TOP_TEXTURE_KEY,
  WATER_LEFT_TEXTURE_KEY,
  WATER_RIGHT_TEXTURE_KEY,
  SHIP_SMALL_LEFT_TEXTURE_KEY,
  SHIP_SMALL_RIGHT_TEXTURE_KEY,
  SHIP_MEDIUM_LEFT_TEXTURE_KEY,
  SHIP_MEDIUM_RIGHT_TEXTURE_KEY,
  TILE_WIDTH,
  TILE_HEIGHT,
  BOX_HEIGHT,
  SUPPORT_MIN_ELEVATION,
  ENABLE_POSTFX,
} from "./constants";

import {
  fillElevations,
  getTextureKeyForElevation,
  isWithinViewport,
} from "./projection";
import {
  ensureEmptyBoxTexture,
  ensureTexturedBoxTexture,
  getOrCreateScaledTexture,
} from "./textures";

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

    this.load.image(SHIP_SMALL_LEFT_TEXTURE_KEY, "/assets/ship/small/left.png");
    this.load.image(
      SHIP_SMALL_RIGHT_TEXTURE_KEY,
      "/assets/ship/small/right.png",
    );
    this.load.image(SHIP_MEDIUM_LEFT_TEXTURE_KEY, "/assets/ship/medium/left.png");
    this.load.image(
      SHIP_MEDIUM_RIGHT_TEXTURE_KEY,
      "/assets/ship/medium/right.png",
    );
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

    const terrain = getOrCreateTerrain();

    const manualBoxes = terrain.map((row) => {
      const box = new Box(row.x, row.y, { elevation: row.elevation });
      return box;
    });

    // ARENA
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

    const withMediumShip = addShipToBoxes(
      manualBoxes,
      new Ship("ship-01", centerX + 1, centerY, "VERTICAL", 3),
      {
        elevation: 1,
          allowOverlay: true,
      },
    );

    const withShips = addShipToBoxes(
      withMediumShip,
      new Ship("ship-02", centerX - 1, centerY + 1, "VERTICAL", 2),
      {
        elevation: 1,
        allowOverlay: true,
      },
    );

    const filledElevationBoxes = fillElevations(
      withShips,
      SUPPORT_MIN_ELEVATION,
    );

    let bMinX = Infinity,
      bMaxX = -Infinity,
      bMinY = Infinity,
      bMaxY = -Infinity;

    for (const box of filledElevationBoxes) {
      const sx = (box.x - box.y) * (TILE_WIDTH / 2);
      const sy =
        -(box.x + box.y) * (TILE_HEIGHT / 2) - box.elevation * BOX_HEIGHT;
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

    let minElevation = 0;
    let elevationRange = 0;

    if (visibleBoxes.length > 0) {
      const elevations = visibleBoxes.map((b) => b.box.elevation);
      minElevation = Math.min(...elevations);
      const maxElevation = Math.max(...elevations);
      elevationRange = maxElevation - minElevation;
    }

    const shipBoxesById = new Map<typeof withShips[number]["metadata"]["shipId"], typeof visibleBoxes>();

    const terrainVisibleBoxes = visibleBoxes.filter((box) => {
      if (box.box.type !== "SHIP") {
        return true;
      }

      const shipId =
        typeof box.box.metadata.shipId === "string"
          ? box.box.metadata.shipId
          : undefined;

      if (!shipId) {
        return false;
      }

      const existing = shipBoxesById.get(shipId) ?? [];
      existing.push(box);
      shipBoxesById.set(shipId, existing);

      return false;
    });

    let maxTerrainDepth = -Infinity;

    terrainVisibleBoxes.forEach((box) => {
      const forceGroundTexture = box.box.metadata.forceGroundTexture === true;
      const textureKey = getTextureKeyForElevation(
        box.box.elevation,
        forceGroundTexture,
        canUseTexturedGround,
        canUseTexturedGrass,
        canUseTexturedWater,
      );

      const terrainDepth =
        box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001;
      maxTerrainDepth = Math.max(maxTerrainDepth, terrainDepth);

      let tint: number | undefined;

      if (elevationRange > 1) {
        const ratio = (box.box.elevation - minElevation) / elevationRange;
        const channel = Math.round(170 + ratio * (255 - 170));
        tint = (channel << 16) | (channel << 8) | channel;
      }

      renderEmptyBox(this, box, textureKey, tint);
    });

    shipBoxesById.forEach((shipBoxes) => {
      if (shipBoxes.length === 0) {
        return;
      }

      const orientation =
        shipBoxes[0].box.metadata.shipOrientation === "VERTICAL"
          ? "VERTICAL"
          : "HORIZONTAL";

      const shipLength = shipBoxes.length;

      const shipTextureByLength: Record<number, { vertical: string; horizontal: string }> = {
        3: {
          vertical: SHIP_MEDIUM_LEFT_TEXTURE_KEY,
          horizontal: SHIP_MEDIUM_RIGHT_TEXTURE_KEY,
        },
      };

      const textureSet = shipTextureByLength[shipLength] ?? {
        vertical: SHIP_SMALL_LEFT_TEXTURE_KEY,
        horizontal: SHIP_SMALL_RIGHT_TEXTURE_KEY,
      };

      const textureKey =
        orientation === "VERTICAL"
          ? textureSet.vertical
          : textureSet.horizontal;

      if (!this.textures.exists(textureKey)) {
        return;
      }

      let sumX = 0;
      let sumY = 0;
      let maxDepthBase = -Infinity;

      shipBoxes.forEach((box) => {
        sumX += box.screenX;
        sumY += box.screenY;
        maxDepthBase = Math.max(maxDepthBase, box.baseScreenY);
      });

      const screenXs = shipBoxes.map((box) => box.screenX);
      const minShipScreenX = Math.min(...screenXs);
      const maxShipScreenX = Math.max(...screenXs);

      // The ship sprite already includes isometric perspective.
      // Fit width to occupied tiles and preserve source aspect ratio.
      const targetShipWidth = maxShipScreenX - minShipScreenX + TILE_WIDTH;
      const sourceFrame = this.textures.getFrame(textureKey, "__BASE");

      if (!sourceFrame || sourceFrame.width <= 0) {
        return;
      }

      const targetShipHeight =
        targetShipWidth * (sourceFrame.height / sourceFrame.width);
      const roundedShipWidth = Math.max(1, Math.round(targetShipWidth));
      const roundedShipHeight = Math.max(1, Math.round(targetShipHeight));

      const centerXScreen = Math.round(sumX / shipBoxes.length);
      const centerYScreen = Math.round(sumY / shipBoxes.length);

      const scaledTextureKey = getOrCreateScaledTexture(
        this,
        textureKey,
        roundedShipWidth,
        roundedShipHeight,
      );

      const shipImage = this.add.image(
        centerXScreen,
        centerYScreen,
        scaledTextureKey ?? textureKey,
      );
      shipImage.setOrigin(0.5, 0.5);
      shipImage.setDisplaySize(roundedShipWidth, roundedShipHeight);
      shipImage.setDepth(maxTerrainDepth + 1 + maxDepthBase * 0.001);
    });

    if (ENABLE_POSTFX) {
      this.cameras.main.filters.external?.addTiltShift(0.1, 3.0, 0);
    }
  }
}

export default IsometricScene;
