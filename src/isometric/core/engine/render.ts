import { Container, Sprite, Texture } from "pixi.js";
import type { IsoScreenBox } from "../types/iso";
import { getTextureOriginYMap } from "./textures";

export function renderEmptyBox(
  container: Container,
  textures: Map<string, Texture>,
  box: IsoScreenBox,
  textureKey: string,
  tint?: number,
): Sprite | undefined {
  const textureOriginYByKey = getTextureOriginYMap();
  const texture = textures.get(textureKey);

  if (!texture) {
    return undefined;
  }

  const image = new Sprite(texture);
  image.position.set(box.screenX, box.screenY);
  image.anchor.set(0.5, textureOriginYByKey.get(textureKey) ?? 0.5);
  image.zIndex =
    box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001;
  if (tint !== undefined) {
    image.tint = tint;
  }
  container.addChild(image);

  return image;
}
