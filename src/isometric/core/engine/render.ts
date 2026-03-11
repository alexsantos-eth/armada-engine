import type Phaser from "phaser";
import type { IsoScreenBox } from "../types/iso";
import type { EmptyBoxTextureConfig } from "../types/render";

const DEFAULT_FILL_COLOR = 0xffffff;
const DEFAULT_STROKE_COLOR = 0xffffff;
const DEFAULT_LEFT_FILL_COLOR = 0xe8e8e8;
const DEFAULT_RIGHT_FILL_COLOR = 0xcfcfcf;
const DEFAULT_BOX_HEIGHT = 28;

const textureOriginYByKey = new Map<string, number>();

export function ensureEmptyBoxTexture(
  scene: Phaser.Scene,
  config: EmptyBoxTextureConfig,
): void {
  const {
    textureKey,
    tileWidth,
    tileHeight,
    boxHeight = DEFAULT_BOX_HEIGHT,
    fillColor = DEFAULT_FILL_COLOR,
    leftFillColor = DEFAULT_LEFT_FILL_COLOR,
    rightFillColor = DEFAULT_RIGHT_FILL_COLOR,
    fillAlpha = 1,
  } = config;

  if (scene.textures.exists(textureKey)) {
    if (!textureOriginYByKey.has(textureKey)) {
      textureOriginYByKey.set(textureKey, 0.5);
    }
    return;
  }

  const textureHeight = tileHeight + boxHeight;
  const topY = 0;


  const halfWidth = Math.round(tileWidth / 2);
const rightY = Math.round(tileHeight / 2);
const bottomY = tileHeight;
const leftY = Math.round(tileHeight / 2);
const downY = boxHeight;

  const tileGraphics = scene.add.graphics({ x: 0, y: 0 });

  tileGraphics.fillStyle(leftFillColor, fillAlpha);
  tileGraphics.beginPath();
  tileGraphics.moveTo(0, leftY);
  tileGraphics.lineTo(halfWidth, bottomY);
  tileGraphics.lineTo(halfWidth, bottomY + downY);
  tileGraphics.lineTo(0, leftY + downY);
  tileGraphics.closePath();
  tileGraphics.fillPath();
  tileGraphics.strokePath();

  tileGraphics.fillStyle(rightFillColor, fillAlpha);
  tileGraphics.beginPath();
  tileGraphics.moveTo(tileWidth, rightY);
  tileGraphics.lineTo(halfWidth, bottomY);
  tileGraphics.lineTo(halfWidth, bottomY + downY );
  tileGraphics.lineTo(tileWidth, rightY + downY);
  tileGraphics.closePath();
  tileGraphics.fillPath();
  tileGraphics.strokePath();

  tileGraphics.fillStyle(fillColor, fillAlpha);
  tileGraphics.beginPath();
  tileGraphics.moveTo(halfWidth, topY);
  tileGraphics.lineTo(tileWidth + 0.5, rightY);
  tileGraphics.lineTo(halfWidth, bottomY + 0.5);
  tileGraphics.lineTo(-0.5, leftY);
  tileGraphics.closePath();
  tileGraphics.fillPath();
  tileGraphics.strokePath();
  tileGraphics.generateTexture(textureKey, tileWidth, textureHeight);
  tileGraphics.destroy();

  textureOriginYByKey.set(textureKey, tileHeight / (2 * textureHeight));
}

export function renderEmptyBox(
  scene: Phaser.Scene,
  box: IsoScreenBox,
  textureKey: string,
): Phaser.GameObjects.Image {
  const image = scene.add.image(box.screenX, box.screenY, textureKey);
  image.setOrigin(0.5, textureOriginYByKey.get(textureKey) ?? 0.5);
  // Keep sorting anchored to floor contact and add a tiny tie-breaker for diagonals.
  image.setDepth(box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001);

  return image;
}

export function renderEmptyBoxLayer(
  scene: Phaser.Scene,
  boxes: IsoScreenBox[],
  textureKey: string,
): Phaser.GameObjects.Image[] {
  return boxes.map((box) => renderEmptyBox(scene, box, textureKey));
}

export function ensureFlatDiamondTexture(
  scene: Phaser.Scene,
  config: {
    textureKey: string;
    tileWidth: number;
    tileHeight: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeAlpha?: number;
    strokeWidth?: number;
  },
): void {
  const {
    textureKey,
    tileWidth,
    tileHeight,
    fillColor = DEFAULT_FILL_COLOR,
    fillAlpha = 1,
    strokeColor = DEFAULT_STROKE_COLOR,
    strokeAlpha = 0,
    strokeWidth = 2,
  } = config;

  if (scene.textures.exists(textureKey)) {
    if (!textureOriginYByKey.has(textureKey)) {
      textureOriginYByKey.set(textureKey, 0.5);
    }
    return;
  }

  const tileGraphics = scene.add.graphics({ x: 0, y: 0 });
  tileGraphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);

  tileGraphics.fillStyle(fillColor, fillAlpha);
  tileGraphics.beginPath();
  tileGraphics.moveTo(tileWidth / 2, 0); 
  tileGraphics.lineTo(tileWidth, tileHeight / 2); 
  tileGraphics.lineTo(tileWidth / 2, tileHeight); 
  tileGraphics.lineTo(0, tileHeight / 2); 
  tileGraphics.closePath();
  tileGraphics.fillPath();
  tileGraphics.strokePath();
  tileGraphics.generateTexture(textureKey, tileWidth, tileHeight);
  tileGraphics.destroy();

  textureOriginYByKey.set(textureKey, 0.5);
}
