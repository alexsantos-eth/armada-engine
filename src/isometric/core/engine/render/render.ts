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
): Sprite {
  const image = new Sprite(texture);

  image.width = tileWidth;
  image.height = tileHeight + boxHeight * height;
  if (tint !== undefined) {
    image.tint = tint;
  }
  image.anchor.set(0.5, 0);
  const verticalOffset = surfaceAligned || height > 1
    ? tileHeight + boxHeight * height
    : tileHeight / 2;
  image.position.set(
    box.screenX,
    box.screenY - verticalOffset,
  );
  image.zIndex =
    box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001;
  container.addChild(image);

  return image;
}