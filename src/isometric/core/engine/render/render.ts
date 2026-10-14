import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { EntityLengthAxis, IsoScreenBox } from "../../types";

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
  debug = false,
  lengthAxis: EntityLengthAxis = "x",
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
  const lengthDirection = lengthAxis === "y" ? -1 : 1;
  image.position.set(
    box.screenX + lengthDirection * footprintOffset * (tileWidth / 2),
    box.screenY - footprintOffset * (tileHeight / 2) - verticalOffset,
  );
  image.zIndex =
    box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001;
  container.addChild(image);

  if (debug) {
    const halfWidth = tileWidth / 2;
    const halfHeight = tileHeight / 2;
    const outline = new Graphics();
    const createDiamond = (blockIndex: number, verticalOffset: number) => {
      const centerX = box.screenX + lengthDirection * blockIndex * (tileWidth / 2);
      const centerY = box.screenY - blockIndex * (tileHeight / 2) - verticalOffset;
      return [
        { x: centerX, y: centerY - halfHeight },
        { x: centerX + halfWidth, y: centerY },
        { x: centerX, y: centerY + halfHeight },
        { x: centerX - halfWidth, y: centerY },
      ];
    };
    for (let blockIndex = 0; blockIndex < length; blockIndex += 1) {
      outline.poly(createDiamond(blockIndex, 0));
      outline.poly(createDiamond(blockIndex, boxHeight * height));
    }
    outline.stroke({ color: 0xff00ff, width: 1 });
    outline.zIndex = image.zIndex + 0.0001;
    container.addChild(outline);
  }

  return image;
}