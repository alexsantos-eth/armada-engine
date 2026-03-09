import type Phaser from "phaser";
import type { IsoScreenBox } from "../types/iso";
import type { EmptyBoxTextureConfig } from "../types/render";

const DEFAULT_FILL_COLOR = 0xffffff;
const DEFAULT_STROKE_COLOR = 0xd9d9d9;

export function ensureEmptyBoxTexture(
  scene: Phaser.Scene,
  config: EmptyBoxTextureConfig,
): void {
  const {
    textureKey,
    tileWidth,
    tileHeight,
    fillColor = DEFAULT_FILL_COLOR,
    fillAlpha = 1,
    strokeColor = DEFAULT_STROKE_COLOR,
    strokeAlpha = 1,
    strokeWidth = 2,
  } = config;

  if (scene.textures.exists(textureKey)) {
    return;
  }

  const tileGraphics = scene.add.graphics({ x: 0, y: 0 });
  tileGraphics.fillStyle(fillColor, fillAlpha);
  tileGraphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);

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
}

export function renderEmptyBox(
  scene: Phaser.Scene,
  box: IsoScreenBox,
  textureKey: string,
): Phaser.GameObjects.Image {
  const image = scene.add.image(box.screenX, box.screenY, textureKey);
  image.setOrigin(0.5, 0.5);

  return image;
}

export function renderEmptyBoxLayer(
  scene: Phaser.Scene,
  boxes: IsoScreenBox[],
  textureKey: string,
): Phaser.GameObjects.Image[] {
  return boxes.map((box) => renderEmptyBox(scene, box, textureKey));
}
