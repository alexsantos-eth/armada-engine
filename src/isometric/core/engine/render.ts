import type Phaser from "phaser";
import type { IsoScreenBox } from "../types/iso";
import type {
  EmptyBoxTextureConfig,
  TexturedBoxTextureConfig,
} from "../types/render";

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
    faceQuad: [[number, number], [number, number], [number, number], [number, number]],
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

export function renderEmptyBox(
  scene: Phaser.Scene,
  box: IsoScreenBox,
  textureKey: string,
  tint?: number,
): Phaser.GameObjects.Image {
  const image = scene.add.image(box.screenX, box.screenY, textureKey);
  image.setOrigin(0.5, textureOriginYByKey.get(textureKey) ?? 0.5);
  // Keep sorting anchored to floor contact and add a tiny tie-breaker for diagonals.
  image.setDepth(box.baseScreenY + box.box.elevation * 0.001 + box.x * 0.0001);
  if (tint !== undefined) {
    image.setTint(tint);
  }

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
