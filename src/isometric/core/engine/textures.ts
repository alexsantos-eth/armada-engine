import { Graphics, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";
import type {
  EmptyBoxTextureConfig,
  TexturedBoxTextureConfig,
} from "../types/render";

const DEFAULT_BOX_HEIGHT = 28;
const textureOriginYByKey = new Map<string, number>();
type TextureStore = Map<string, Texture>;

export function ensureEmptyBoxTexture(
  renderer: Renderer,
  textures: TextureStore,
  config: EmptyBoxTextureConfig,
): void {
  const {
    textureKey, tileWidth, tileHeight, boxHeight = DEFAULT_BOX_HEIGHT,
    fillColor = 0xffffff, leftFillColor = 0xe8e8e8,
    rightFillColor = 0xcfcfcf, fillAlpha = 1,
  } = config;
  if (textures.has(textureKey)) return;

  const halfWidth = Math.round(tileWidth / 2);
  const midY = Math.round(tileHeight / 2);
  const graphics = new Graphics();
  graphics.poly([0, midY, halfWidth, tileHeight, halfWidth, tileHeight + boxHeight, 0, midY + boxHeight])
    .fill({ color: leftFillColor, alpha: fillAlpha });
  graphics.poly([tileWidth, midY, halfWidth, tileHeight, halfWidth, tileHeight + boxHeight, tileWidth, midY + boxHeight])
    .fill({ color: rightFillColor, alpha: fillAlpha });
  graphics.poly([halfWidth, 0, tileWidth + 0.5, midY, halfWidth, tileHeight + 0.5, -0.5, midY])
    .fill({ color: fillColor, alpha: fillAlpha });
  textures.set(textureKey, renderer.generateTexture(graphics));
  graphics.destroy();
  textureOriginYByKey.set(textureKey, tileHeight / (2 * (tileHeight + boxHeight)));
}

function polygonPath(context: CanvasRenderingContext2D, points: Array<[number, number]>): void {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
}

function sourceImage(texture: Texture): CanvasImageSource | undefined {
  return texture.source.resource as CanvasImageSource | undefined;
}

function sourceDimensions(image: CanvasImageSource): { width: number; height: number } {
  const source = image as { width?: number; height?: number };
  return { width: Math.max(1, source.width ?? 1), height: Math.max(1, source.height ?? 1) };
}

function drawFace(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  points: Array<[number, number]>,
  rotationDegrees = 0,
): void {
  const source = sourceDimensions(image);
  const [origin, edgeUPoint, , edgeVPoint] = points;
  const edgeU = [edgeUPoint[0] - origin[0], edgeUPoint[1] - origin[1]];
  const edgeV = [edgeVPoint[0] - origin[0], edgeVPoint[1] - origin[1]];
  context.save();
  polygonPath(context, points);
  context.clip();
  context.transform(edgeU[0] / source.width, edgeU[1] / source.width, edgeV[0] / source.height, edgeV[1] / source.height, origin[0], origin[1]);
  if (rotationDegrees) {
    context.translate(source.width / 2, source.height / 2);
    context.rotate((rotationDegrees * Math.PI) / 180);
    context.translate(-source.width / 2, -source.height / 2);
  }
  context.drawImage(image, 0, 0, source.width, source.height);
  context.restore();
}

export function ensureTexturedBoxTexture(
  textures: TextureStore,
  config: TexturedBoxTextureConfig,
): void {
  const {
    textureKey, tileWidth, tileHeight, boxHeight = DEFAULT_BOX_HEIGHT,
    topTextureKey, leftTextureKey, rightTextureKey, topIsPreformed = false,
    topRotationDegrees = 0, leftRotationDegrees = 0, rightRotationDegrees = 0,
  } = config;
  if (textures.has(textureKey)) return;

  const top = textures.get(topTextureKey) && sourceImage(textures.get(topTextureKey)!);
  const left = textures.get(leftTextureKey) && sourceImage(textures.get(leftTextureKey)!);
  const right = textures.get(rightTextureKey) && sourceImage(textures.get(rightTextureKey)!);
  if (!top || !left || !right) return;

  const halfWidth = Math.round(tileWidth / 2);
  const midY = Math.round(tileHeight / 2);
  const canvas = document.createElement("canvas");
  canvas.width = tileWidth;
  canvas.height = tileHeight + boxHeight;
  const context = canvas.getContext("2d");
  if (!context) return;

  drawFace(context, left, [[0, midY], [halfWidth, tileHeight], [halfWidth, tileHeight + boxHeight], [0, midY + boxHeight]], leftRotationDegrees);
  drawFace(context, right, [[halfWidth, tileHeight], [tileWidth, midY], [tileWidth, midY + boxHeight], [halfWidth, tileHeight + boxHeight]], rightRotationDegrees);
  if (topIsPreformed) {
    context.save();
    polygonPath(context, [[halfWidth, 0], [tileWidth, midY], [halfWidth, tileHeight], [0, midY]]);
    context.clip();
    context.drawImage(top, 0, 0, tileWidth, tileHeight);
    context.restore();
  } else {
    drawFace(context, top, [[halfWidth, 0], [tileWidth, midY], [halfWidth, tileHeight], [0, midY]], topRotationDegrees);
  }
  textures.set(textureKey, Texture.from(canvas));
  textureOriginYByKey.set(textureKey, tileHeight / (2 * (tileHeight + boxHeight)));
}

export function getTextureOriginYMap(): Map<string, number> {
  return textureOriginYByKey;
}