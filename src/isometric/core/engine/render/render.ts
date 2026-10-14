import { Container, Sprite, Texture } from "pixi.js";
import type { IsoScreenBox } from "../../types";

export function renderBlock(
  container: Container,
  texture: Texture,
  box: IsoScreenBox,
  tileWidth: number,
  tileHeight: number,
  boxHeight: number,
  tint?: number,
  height = 1,
  surfaceAligned = false,
  length = 1,
): Sprite {
  const image = new Sprite(texture);

  image.width = tileWidth * ((1 + length) / 2);
  const textureAspectRatio = texture.width > 0 ? texture.height / texture.width : undefined;
  image.height = length > 1 && textureAspectRatio !== undefined
    ? image.width * textureAspectRatio
    : tileHeight + boxHeight * height;
  if (tint !== undefined) {
    image.tint = tint;
  }
  image.anchor.set(0.5, 0);
  const footprintDepth = tileHeight * ((1 + length) / 4);
  const verticalOffset = surfaceAligned
    ? footprintDepth + boxHeight * height
    : height > 1
      ? tileHeight + boxHeight * height
    : tileHeight / 2;
  const footprintOffset = (length - 1) / 2;
  image.position.set(
    box.screenX + footprintOffset * (tileWidth / 2),
    box.screenY - footprintOffset * (tileHeight / 2) - verticalOffset,
  );
  image.zIndex =
    box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001;
  container.addChild(image);

  return image;
}