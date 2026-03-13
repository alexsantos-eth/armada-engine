import {
  DEEP_WATER_COLORS,
  TEXTURED_GRASS_KEY,
  TEXTURED_GROUND_KEY,
  TEXTURED_WATER_KEY,
  VIEW_CULL_MARGIN,
} from "./constants";
import { Box } from "./entities";

export function buildFilledElevationLevels(
  targetElevation: number,
  minElevation: number,
): Array<{ elevation: number; useGroundTexture: boolean }> {
  const targetLevel = Math.floor(targetElevation);

  if (targetLevel < minElevation) {
    return [{ elevation: targetLevel, useGroundTexture: false }];
  }

  const depth = targetLevel - minElevation + 1;
  const useGroundSupportTexture = targetLevel > 2;

  return Array.from({ length: depth }, (_, index) => ({
    elevation: minElevation + index,
    useGroundTexture: useGroundSupportTexture && index < depth - 1,
  }));
}

export function getTextureKeyForElevation(
  elevation: number,
  forceGroundTexture: boolean,
  useTexturedGround: boolean,
  useTexturedGrass: boolean,
  useTexturedWater: boolean,
): string {
  if (forceGroundTexture) {
    return TEXTURED_GROUND_KEY;
  }

  if (elevation < 0) {
    const depth = Math.abs(elevation);
    const maxIndex = DEEP_WATER_COLORS.length - 1;
    const colorIndex = Math.max(0, maxIndex - (depth - 1));
    return `iso-tile-deep-water-${colorIndex}`;
  } else if (elevation === 0) {
    return useTexturedWater ? TEXTURED_WATER_KEY : "iso-tile-water";
  } else if (elevation === 1 && useTexturedGround) {
    return TEXTURED_GROUND_KEY;
  } else if (elevation > 1 && useTexturedGrass) {
    return TEXTURED_GRASS_KEY;
  } else {
    return "iso-tile-grass";
  }
}

export function fillElevations(boxes: Box[], minElevation: number): Box[] {
  return boxes.flatMap((box) => {
    const boxData = box.getData();

    if (box.type === "SHIP") {
      return [
        new Box(box.x, box.y, {
          ...boxData,
        }),
      ];
    }

    return buildFilledElevationLevels(box.elevation, minElevation).map(
      ({ elevation, useGroundTexture }) =>
        new Box(box.x, box.y, {
          ...boxData,
          elevation,
          metadata: {
            ...boxData.metadata,
            forceGroundTexture: useGroundTexture,
          },
        }),
    );
  });
}

export function isWithinViewport(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    x >= -VIEW_CULL_MARGIN &&
    x <= viewportWidth + VIEW_CULL_MARGIN &&
    y >= -VIEW_CULL_MARGIN &&
    y <= viewportHeight + VIEW_CULL_MARGIN
  );
}
