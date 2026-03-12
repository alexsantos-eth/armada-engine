import Phaser from "phaser";
import type { IsoScreenBox } from "../types/iso";
import { getTextureOriginYMap } from "./textures";

export function renderEmptyBox(
  scene: Phaser.Scene,
  box: IsoScreenBox,
  textureKey: string,
  tint?: number,
): Phaser.GameObjects.Image {
  const textureOriginYByKey = getTextureOriginYMap();

  const image = scene.add.image(box.screenX, box.screenY, textureKey);
  image.setOrigin(0.5, textureOriginYByKey.get(textureKey) ?? 0.5);
  image.setDepth(box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001);
  if (tint !== undefined) {
    image.setTint(tint);
  }

  return image;
}
