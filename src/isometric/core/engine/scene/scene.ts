import { Application, Assets, Container, Texture } from "pixi.js";
import { Box, createEntitiesFromConfig, Entity } from "../entities";
import { projectBoxesToIsometric } from "../board";
import { getOrCreateTerrain } from "../terrain";
import {
  BOX_HEIGHT,
  DEFAULT_MIN_ELEVATION,
  GROUND_BLOCK_TEXTURE_KEY,
  GRASS_BLOCK_TEXTURE_KEY,
  POSITIVE_ELEVATION_TINT_STEP,
  TERRAIN_HEIGHT,
  TERRAIN_WIDTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  NEGATIVE_ELEVATION_TINT_STEP,
  WATER_BLOCK_TEXTURE_KEY,
} from "../constants";
import { fillElevations, isWithinViewport } from "../projection";
import { renderBlock } from "../render";

const POSITIVE_ELEVATION_TOP_TINT = 0xe8ffb0;

function getLevelTint(
  baseTint: number,
  levelsBelowTop: number,
  tintStep: number,
): number {
  const factor = Math.max(0.35, 1 - levelsBelowTop * tintStep);
  const red = Math.round(((baseTint >> 16) & 0xff) * factor);
  const green = Math.round(((baseTint >> 8) & 0xff) * factor);
  const blue = Math.round((baseTint & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}

function getNegativeElevationTint(elevation: number): number {
  return getLevelTint(0xffffff, Math.max(1, Math.abs(elevation)), NEGATIVE_ELEVATION_TINT_STEP);
}

function getPositiveElevationTint(
  elevation: number,
  maxPositiveElevation: number,
): number | undefined {
  if (maxPositiveElevation <= 0) return undefined;

  const levelsBelowTop = Math.max(0, maxPositiveElevation - elevation);
  return getLevelTint(
    POSITIVE_ELEVATION_TOP_TINT,
    levelsBelowTop,
    POSITIVE_ELEVATION_TINT_STEP,
  );
}

export async function createIsometricScene(
  app: Application,
  createEntities: (boxes: Box[]) => Entity[] = createEntitiesFromConfig,
): Promise<() => void> {
  const grassBlockSource = "/assets/grass/block.svg";
  const groundBlockSource = "/assets/ground/block.svg";
  const waterBlockSource = "/assets/water/block.svg";

  const terrain = getOrCreateTerrain();
  const boxes = terrain.map(
    (row) => new Box(row.x, row.y, { elevation: row.elevation }),
  );
  const centerX = Math.floor(TERRAIN_WIDTH / 2);
  const centerY = Math.floor(TERRAIN_HEIGHT / 2);
  const centralBlockSize = Math.max(4, Math.min(8, TERRAIN_WIDTH - 2));
  const halfSize = Math.floor(centralBlockSize / 2);
  const startX = centerX - halfSize;
  const startY = centerY - halfSize;
  const endX = startX + centralBlockSize;
  const endY = startY + centralBlockSize;

  boxes.forEach((box) => {
    const central =
      box.x >= startX &&
      box.x < endX &&
      box.y >= startY &&
      box.y < endY;
    if (central) {
      box.update({ elevation: box.y === startY || box.x === startX ? 1 : 0 });
    }
  });

  const filledBoxes = fillElevations(boxes, DEFAULT_MIN_ELEVATION);
  const entities = createEntities(boxes);
  const entitySources = [...new Set(entities.map((entity) => entity.textureSource))];
  const textures = new Map<string, Texture>();
  const [grassTexture, groundTexture, waterTexture, ...entityTextures] = await Promise.all([
    Assets.load<Texture>(grassBlockSource),
    Assets.load<Texture>(groundBlockSource),
    Assets.load<Texture>(waterBlockSource),
    ...entitySources.map((source) => Assets.load<Texture>(source)),
  ]);
  textures.set(GRASS_BLOCK_TEXTURE_KEY, grassTexture);
  textures.set(GROUND_BLOCK_TEXTURE_KEY, groundTexture);
  textures.set(WATER_BLOCK_TEXTURE_KEY, waterTexture);
  const entityTexturesBySource = new Map(
    entitySources.map((source, index) => [source, entityTextures[index]]),
  );

  const scene = new Container();
  scene.sortableChildren = true;
  app.stage.addChild(scene);

  const topElevationByColumn = new Map<string, number>();
  filledBoxes.forEach((box) => {
    const columnKey = `${box.x}:${box.y}`;
    const currentTop = topElevationByColumn.get(columnKey);
    topElevationByColumn.set(
      columnKey,
      Math.max(currentTop ?? -Infinity, box.elevation),
    );
  });
  const maxPositiveElevation = filledBoxes.reduce(
    (maximum, box) => Math.max(maximum, box.elevation),
    0,
  );
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  filledBoxes.forEach((box) => {
    const screenX = (box.x - box.y) * (TILE_WIDTH / 2);
    const screenY =
      -(box.x + box.y) * (TILE_HEIGHT / 2) - box.elevation * BOX_HEIGHT;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
  });

  const projection = {
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    elevationStep: BOX_HEIGHT,
    originX: app.screen.width / 2 - (minX + maxX) / 2,
    originY: app.screen.height / 2 - (minY + maxY) / 2,
  };
  const projectedBoxes = projectBoxesToIsometric(filledBoxes, projection);
  const projectedEntities = projectBoxesToIsometric(entities, projection);
  const grassTextureForRender = textures.get(GRASS_BLOCK_TEXTURE_KEY);
  const groundTextureForRender = textures.get(GROUND_BLOCK_TEXTURE_KEY);
  const waterTextureForRender = textures.get(WATER_BLOCK_TEXTURE_KEY);

  if (grassTextureForRender && groundTextureForRender && waterTextureForRender) {
    projectedBoxes
      .filter((box) =>
        isWithinViewport(
          box.screenX,
          box.screenY,
          app.screen.width,
          app.screen.height,
        ),
      )
      .forEach((box) => {
        const columnKey = `${box.x}:${box.y}`;
        const isTopBlock =
          box.box.elevation === topElevationByColumn.get(columnKey);
        const texture = box.box.elevation < 0
          ? waterTextureForRender
          : isTopBlock
            ? grassTextureForRender
            : groundTextureForRender;
        const tint = box.box.elevation < 0
          ? getNegativeElevationTint(box.box.elevation)
          : getPositiveElevationTint(
              box.box.elevation,
              maxPositiveElevation,
            );
        renderBlock(
          scene,
          texture,
          box,
          TILE_WIDTH,
          TILE_HEIGHT,
          BOX_HEIGHT,
          tint,
        );
      });
    projectedEntities
      .filter((entity) =>
        isWithinViewport(
          entity.screenX,
          entity.screenY,
          app.screen.width,
          app.screen.height,
        ),
      )
      .forEach((entity) => {
        const texture = entityTexturesBySource.get(entity.box.textureSource);
        if (!texture) return;

        renderBlock(
          scene,
          texture,
          entity,
          TILE_WIDTH,
          TILE_HEIGHT,
          BOX_HEIGHT,
          undefined,
          entity.box.height,
          true,
          entity.box.length,
        );
      });
  }

  return () => {
    scene.destroy({ children: true });
    void Assets.unload(grassBlockSource);
    void Assets.unload(groundBlockSource);
    void Assets.unload(waterBlockSource);
    entitySources.forEach((source) => void Assets.unload(source));
  };
}

export default createIsometricScene;