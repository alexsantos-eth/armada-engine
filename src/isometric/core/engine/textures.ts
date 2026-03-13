import Phaser from "phaser";
import type {
  EmptyBoxTextureConfig,
  TexturedBoxTextureConfig,
} from "../types/render";

const DEFAULT_FILL_COLOR = 0xffffff;
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
  tileGraphics.lineTo(halfWidth, bottomY + downY);
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

function buildPolygonPath(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
): void {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index][0], points[index][1]);
  }
  context.closePath();
}

function getSourceDimensions(image: CanvasImageSource): {
  width: number;
  height: number;
} {
  const source = image as { width?: number; height?: number };
  return {
    width: Math.max(1, source.width ?? 1),
    height: Math.max(1, source.height ?? 1),
  };
}

function drawHighQualityScaledImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): void {
  const startCanvas = document.createElement("canvas");
  startCanvas.width = sourceWidth;
  startCanvas.height = sourceHeight;

  const startContext = startCanvas.getContext("2d");

  if (!startContext) {
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
    return;
  }

  startContext.imageSmoothingEnabled = true;
  startContext.imageSmoothingQuality = "high";
  startContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);

  let currentCanvas = startCanvas;
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;

  while (currentWidth * 0.5 > targetWidth && currentHeight * 0.5 > targetHeight) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth * 0.5));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight * 0.5));
    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = nextWidth;
    nextCanvas.height = nextHeight;

    const nextContext = nextCanvas.getContext("2d");

    if (!nextContext) {
      break;
    }

    nextContext.imageSmoothingEnabled = true;
    nextContext.imageSmoothingQuality = "high";
    nextContext.drawImage(
      currentCanvas,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );

    currentCanvas = nextCanvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    currentCanvas,
    0,
    0,
    currentWidth,
    currentHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
}

export function getOrCreateScaledTexture(
  scene: Phaser.Scene,
  sourceTextureKey: string,
  targetWidth: number,
  targetHeight: number,
): string | undefined {
  const scaledWidth = Math.max(1, Math.round(targetWidth));
  const scaledHeight = Math.max(1, Math.round(targetHeight));
  const scaledTextureKey = `${sourceTextureKey}__scaled_${scaledWidth}x${scaledHeight}`;

  if (scene.textures.exists(scaledTextureKey)) {
    return scaledTextureKey;
  }

  const sourceTexture = scene.textures.get(sourceTextureKey);

  if (!sourceTexture || sourceTexture.key === "__MISSING") {
    return undefined;
  }

  const sourceFrame = scene.textures.getFrame(sourceTextureKey, "__BASE");
  const sourceImage = sourceTexture.getSourceImage() as CanvasImageSource;

  if (!sourceFrame || !sourceImage || sourceFrame.width <= 0 || sourceFrame.height <= 0) {
    return undefined;
  }

  const canvasTexture = scene.textures.createCanvas(
    scaledTextureKey,
    scaledWidth,
    scaledHeight,
  );

  if (!canvasTexture) {
    return undefined;
  }

  const context = canvasTexture.getContext();

  drawHighQualityScaledImage(
    context,
    sourceImage,
    sourceFrame.width,
    sourceFrame.height,
    scaledWidth,
    scaledHeight,
  );

  canvasTexture.refresh();
  scene.textures.get(scaledTextureKey)?.setFilter(Phaser.Textures.FilterMode.LINEAR);

  return scaledTextureKey;
}

export function ensureTexturedBoxTexture(
  scene: Phaser.Scene,
  config: TexturedBoxTextureConfig,
): void {
  const {
    textureKey,
    tileWidth,
    tileHeight,
    boxHeight = DEFAULT_BOX_HEIGHT,
    topTextureKey,
    leftTextureKey,
    rightTextureKey,
    topIsPreformed = false,
    topRotationDegrees = 0,
    leftRotationDegrees = 0,
    rightRotationDegrees = 0,
  } = config;

  if (scene.textures.exists(textureKey)) {
    if (!textureOriginYByKey.has(textureKey)) {
      textureOriginYByKey.set(textureKey, 0.5);
    }
    return;
  }

  const topTexture = scene.textures.get(topTextureKey);
  const leftTexture = scene.textures.get(leftTextureKey);
  const rightTexture = scene.textures.get(rightTextureKey);

  if (
    !topTexture?.key ||
    !leftTexture?.key ||
    !rightTexture?.key ||
    topTexture.key === "__MISSING" ||
    leftTexture.key === "__MISSING" ||
    rightTexture.key === "__MISSING"
  ) {
    return;
  }

  const textureHeight = tileHeight + boxHeight;
  const halfWidth = Math.round(tileWidth / 2);
  const midY = Math.round(tileHeight / 2);
  const bottomY = tileHeight;

  const canvasTexture = scene.textures.createCanvas(
    textureKey,
    tileWidth,
    textureHeight,
  );
  if (!canvasTexture) {
    return;
  }
  const context = canvasTexture.getContext();

  const topImage = topTexture.getSourceImage() as CanvasImageSource;
  const leftImage = leftTexture.getSourceImage() as CanvasImageSource;
  const rightImage = rightTexture.getSourceImage() as CanvasImageSource;

  const drawFace = (
    image: CanvasImageSource,
    faceQuad: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ],
    rotationDegrees = 0,
  ) => {
    const source = getSourceDimensions(image);
    const [origin, edgeUPoint, , edgeVPoint] = faceQuad;
    const edgeU: [number, number] = [
      edgeUPoint[0] - origin[0],
      edgeUPoint[1] - origin[1],
    ];
    const edgeV: [number, number] = [
      edgeVPoint[0] - origin[0],
      edgeVPoint[1] - origin[1],
    ];

    const radians = (rotationDegrees * Math.PI) / 180;

    const a = edgeU[0] / source.width;
    const b = edgeU[1] / source.width;
    const c = edgeV[0] / source.height;
    const d = edgeV[1] / source.height;
    const e = origin[0];
    const f = origin[1];

    context.save();
    buildPolygonPath(context, faceQuad);
    context.clip();
    context.transform(a, b, c, d, e, f);

    if (rotationDegrees !== 0) {
      context.translate(source.width / 2, source.height / 2);
      context.rotate(radians);
      context.translate(-source.width / 2, -source.height / 2);
    }

    context.drawImage(image, 0, 0, source.width, source.height);
    context.restore();
  };

  drawFace(
    leftImage,
    [
      [0, midY],
      [halfWidth, bottomY],
      [halfWidth, bottomY + boxHeight],
      [0, midY + boxHeight],
    ],
    leftRotationDegrees,
  );

  drawFace(
    rightImage,
    [
      [halfWidth, bottomY],
      [tileWidth, midY],
      [tileWidth, midY + boxHeight],
      [halfWidth, bottomY + boxHeight],
    ],
    rightRotationDegrees,
  );

  if (topIsPreformed) {
    context.save();
    buildPolygonPath(context, [
      [halfWidth, 0],
      [tileWidth, midY],
      [halfWidth, bottomY],
      [0, midY],
    ]);
    context.clip();
    context.drawImage(topImage, 0, 0, tileWidth, tileHeight);
    context.restore();
  } else {
    drawFace(
      topImage,
      [
        [halfWidth, 0],
        [tileWidth, midY],
        [halfWidth, bottomY],
        [0, midY],
      ],
      topRotationDegrees,
    );
  }

  canvasTexture.refresh();
  textureOriginYByKey.set(textureKey, tileHeight / (2 * textureHeight));
}

export function getTextureOriginYMap () {
    return textureOriginYByKey;
}
