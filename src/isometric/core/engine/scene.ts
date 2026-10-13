import { Application, Assets, Container, Texture } from "pixi.js";
import { renderEmptyBox } from "./render";
import { Box } from "./entities";
import { projectBoxesToIsometric } from "./board";
import { getOrCreateTerrain } from "./terrain";
import {
  TERRAIN_WIDTH, TERRAIN_HEIGHT, DEEP_WATER_COLORS, TEXTURED_GROUND_KEY,
  TEXTURED_GRASS_KEY, TEXTURED_WATER_KEY, GROUND_TOP_TEXTURE_KEY,
  GROUND_LEFT_TEXTURE_KEY, GROUND_RIGHT_TEXTURE_KEY, GRASS_TOP_TEXTURE_KEY,
  GRASS_LEFT_TEXTURE_KEY, GRASS_RIGHT_TEXTURE_KEY, WATER_TOP_TEXTURE_KEY,
  WATER_LEFT_TEXTURE_KEY, WATER_RIGHT_TEXTURE_KEY, TILE_WIDTH, TILE_HEIGHT, BOX_HEIGHT,
  SUPPORT_MIN_ELEVATION,
} from "./constants";
import { fillElevations, getTextureKeyForElevation, isWithinViewport } from "./projection";
import { ensureEmptyBoxTexture, ensureTexturedBoxTexture } from "./textures";

type TextureStore = Map<string, Texture>;

const assetSources: Array<[string, string]> = [
  [GROUND_TOP_TEXTURE_KEY, "/assets/ground/top.png"],
  [GROUND_LEFT_TEXTURE_KEY, "/assets/ground/left.png"],
  [GROUND_RIGHT_TEXTURE_KEY, "/assets/ground/right.png"],
  [GRASS_TOP_TEXTURE_KEY, "/assets/grass/top.png"],
  [GRASS_LEFT_TEXTURE_KEY, "/assets/grass/left.png"],
  [GRASS_RIGHT_TEXTURE_KEY, "/assets/grass/right.png"],
  [WATER_TOP_TEXTURE_KEY, "/assets/water/top.png"],
  [WATER_LEFT_TEXTURE_KEY, "/assets/water/left.png"],
  [WATER_RIGHT_TEXTURE_KEY, "/assets/water/right.png"],
];

function adjustBrightness(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

async function loadTextures(): Promise<TextureStore> {
  const textures: TextureStore = new Map();
  await Promise.all(assetSources.map(async ([key, source]) => {
    textures.set(key, await Assets.load(source));
  }));
  return textures;
}

export async function createIsometricScene(app: Application): Promise<() => void> {
  const textures = await loadTextures();
  const scene = new Container();
  scene.sortableChildren = true;
  app.stage.addChild(scene);

  DEEP_WATER_COLORS.forEach((color, index) => {
    ensureEmptyBoxTexture(app.renderer, textures, {
      textureKey: `iso-tile-deep-water-${index}`,
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      boxHeight: BOX_HEIGHT,
      fillColor: color,
      leftFillColor: adjustBrightness(color, 0.85),
      rightFillColor: adjustBrightness(color, 0.7),
    });
  });

  const hasTextures = (top: string, left: string, right: string) =>
    textures.has(top) && textures.has(left) && textures.has(right);
  if (hasTextures(GROUND_TOP_TEXTURE_KEY, GROUND_LEFT_TEXTURE_KEY, GROUND_RIGHT_TEXTURE_KEY)) {
    ensureTexturedBoxTexture(textures, { textureKey: TEXTURED_GROUND_KEY, tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT, boxHeight: BOX_HEIGHT, topTextureKey: GROUND_TOP_TEXTURE_KEY, leftTextureKey: GROUND_LEFT_TEXTURE_KEY, rightTextureKey: GROUND_RIGHT_TEXTURE_KEY, topIsPreformed: true });
  }
  if (hasTextures(GRASS_TOP_TEXTURE_KEY, GRASS_LEFT_TEXTURE_KEY, GRASS_RIGHT_TEXTURE_KEY)) {
    ensureTexturedBoxTexture(textures, { textureKey: TEXTURED_GRASS_KEY, tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT, boxHeight: BOX_HEIGHT, topTextureKey: GRASS_TOP_TEXTURE_KEY, leftTextureKey: GRASS_LEFT_TEXTURE_KEY, rightTextureKey: GRASS_RIGHT_TEXTURE_KEY, topIsPreformed: true });
  }
  if (hasTextures(WATER_TOP_TEXTURE_KEY, WATER_LEFT_TEXTURE_KEY, WATER_RIGHT_TEXTURE_KEY)) {
    ensureTexturedBoxTexture(textures, { textureKey: TEXTURED_WATER_KEY, tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT, boxHeight: BOX_HEIGHT, topTextureKey: WATER_TOP_TEXTURE_KEY, leftTextureKey: WATER_LEFT_TEXTURE_KEY, rightTextureKey: WATER_RIGHT_TEXTURE_KEY, topIsPreformed: true });
  }

  const terrain = getOrCreateTerrain();
  const manualBoxes = terrain.map((row) => new Box(row.x, row.y, { elevation: row.elevation }));
  const centerX = Math.floor(TERRAIN_WIDTH / 2);
  const centerY = Math.floor(TERRAIN_HEIGHT / 2);
  const centralBlockSize = Math.max(4, Math.min(8, TERRAIN_WIDTH - 2));
  const halfSize = Math.floor(centralBlockSize / 2);
  const startX = centerX - halfSize;
  const startY = centerY - halfSize;
  const endX = startX + centralBlockSize;
  const endY = startY + centralBlockSize;
  manualBoxes.forEach((box) => {
    const central = box.x >= startX && box.x < endX && box.y >= startY && box.y < endY;
    if (central) box.update({ elevation: box.y === startY || box.x === startX ? 1 : 0 });
  });

  const filledBoxes = fillElevations(manualBoxes, SUPPORT_MIN_ELEVATION);
  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
  filledBoxes.forEach((box) => {
    const sx = (box.x - box.y) * (TILE_WIDTH / 2);
    const sy = -(box.x + box.y) * (TILE_HEIGHT / 2) - box.elevation * BOX_HEIGHT;
    bMinX = Math.min(bMinX, sx); bMaxX = Math.max(bMaxX, sx);
    bMinY = Math.min(bMinY, sy); bMaxY = Math.max(bMaxY, sy);
  });
  const centeredBoxes = projectBoxesToIsometric(filledBoxes, {
    tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT, elevationStep: BOX_HEIGHT,
    originX: app.screen.width / 2 - (bMinX + bMaxX) / 2,
    originY: app.screen.height / 2 - (bMinY + bMaxY) / 2,
  });
  const visibleBoxes = centeredBoxes.filter((box) => isWithinViewport(box.screenX, box.screenY, app.screen.width, app.screen.height));
  const elevations = visibleBoxes.map((box) => box.box.elevation);
  const minElevation = elevations.length ? Math.min(...elevations) : 0;
  const elevationRange = elevations.length ? Math.max(...elevations) - minElevation : 0;
  visibleBoxes.forEach((box) => {
    const textureKey = getTextureKeyForElevation(box.box.elevation, box.box.metadata.forceGroundTexture === true, textures.has(TEXTURED_GROUND_KEY), textures.has(TEXTURED_GRASS_KEY), textures.has(TEXTURED_WATER_KEY));
    const tint = elevationRange > 1
      ? (() => {
          const ratio = (box.box.elevation - minElevation) / elevationRange;
          const channel = Math.round(170 + ratio * 85);
          return (channel << 16) | (channel << 8) | channel;
        })()
      : undefined;
    renderEmptyBox(scene, textures, box, textureKey, tint);
  });

  return () => {
    scene.destroy({ children: true });
    textures.forEach((texture) => texture.destroy(true));
  };
}

export default createIsometricScene;