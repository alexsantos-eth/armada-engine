import type {
  BoxData,
  BoxMetadata,
  BoxType,
  EntityData,
  EntityDefinition,
  IEntity,
  IGridObject,
  IBox,
  TerrainSurface,
} from "../../types";
import { classifyColumnSurfaces } from "../terrain";
import { ENTITY_CONFIG } from "./config";

const DEFAULT_BOX_DATA: BoxData = {
  type: "EMPTY",
  walkable: true,
  elevation: 0,
  metadata: {},
};

export class Box implements IBox {
  public readonly x: number;
  public readonly y: number;

  private data: BoxData;

  constructor(x: number, y: number, initialData?: Partial<BoxData>) {
    this.x = x;
    this.y = y;
    this.data = {
      ...DEFAULT_BOX_DATA,
      ...initialData,
      metadata: {
        ...DEFAULT_BOX_DATA.metadata,
        ...(initialData?.metadata ?? {}),
      },
    };
  }

  get type(): BoxType {
    return this.data.type;
  }

  get walkable(): boolean {
    return this.data.walkable;
  }

  get elevation(): number {
    return this.data.elevation;
  }

  get metadata(): BoxMetadata {
    return this.data.metadata;
  }

  getData(): BoxData {
    return {
      ...this.data,
      metadata: { ...this.data.metadata },
    };
  }

  update(data: Partial<BoxData>): void {
    this.data = {
      ...this.data,
      ...data,
      metadata: {
        ...this.data.metadata,
        ...(data.metadata ?? {}),
      },
    };
  }
}

function canSpawnOnSurface(
  box: IGridObject,
  definition: EntityDefinition,
  surfaces: ReadonlyMap<string, TerrainSurface>,
): boolean {
  return matchesSurfaceElevation(box.elevation, definition.surfaceElevation) &&
    surfaces.get(`${box.x}:${box.y}`) === definition.surface;
}

function matchesSurfaceElevation(
  elevation: number,
  surfaceElevation: EntityDefinition["surfaceElevation"],
): boolean {
  if (surfaceElevation === undefined) return true;
  return typeof surfaceElevation === "number"
    ? elevation === surfaceElevation
    : surfaceElevation.includes(elevation);
}

/** Represents a configured non-terrain entity in the world grid. */
export class Entity implements IEntity {
  public readonly x: number;
  public readonly y: number;

  private readonly data: EntityData;

  constructor(x: number, y: number, definition: EntityDefinition, elevation: number) {
    this.x = x;
    this.y = y;
    this.data = {
      type: definition.id,
      walkable: false,
      elevation,
      height: definition.height,
      length: definition.length ?? 1,
      ...(definition.lengthAxis ? { lengthAxis: definition.lengthAxis } : {}),
      ...(definition.gap !== undefined && definition.gap > 0 ? { gap: definition.gap } : {}),
      textureSource: definition.textureSource,
      ...(definition.debug ? { debug: true } : {}),
      ...(definition.colorReplacements
        ? { colorReplacements: definition.colorReplacements }
        : {}),
      metadata: {},
    };
  }

  get type(): string {
    return this.data.type;
  }

  get walkable(): boolean {
    return this.data.walkable;
  }

  get elevation(): number {
    return this.data.elevation;
  }

  get height(): number {
    return this.data.height;
  }

  get length(): number {
    return this.data.length;
  }

  get lengthAxis(): IEntity["lengthAxis"] {
    return this.data.lengthAxis;
  }

  get gap(): IEntity["gap"] {
    return this.data.gap;
  }

  get textureSource(): string {
    return this.data.textureSource;
  }

  get debug(): IEntity["debug"] {
    return this.data.debug;
  }

  get colorReplacements(): IEntity["colorReplacements"] {
    return this.data.colorReplacements;
  }

  get metadata(): BoxMetadata {
    return this.data.metadata;
  }

  getData(): EntityData {
    return {
      ...this.data,
      metadata: { ...this.data.metadata },
    };
  }
}

/**
 * Creates configured entities on eligible terrain columns.
 *
 * Each column's surface (grass, water or sand) comes from `classifyColumnSurfaces()`, so
 * grass entities never spawn on sand.
 *
 * Multi-block footprints must be flat: every block shares the anchor's elevation.
 *
 * Each definition may declare a `gap`: the minimum number of free blocks
 * (including diagonals) that must separate two instances of the same entity.
 */
export function createEntitiesFromConfig(
  boxes: IGridObject[],
  definitions: EntityDefinition[] = ENTITY_CONFIG,
  random: () => number = Math.random,
): Entity[] {
  const entities: Entity[] = [];
  const occupiedPositions = new Set<string>();
  const positionsByType = new Map<string, Set<string>>();
  const boxesByPosition = new Map(
    boxes.map((box) => [`${box.x}:${box.y}`, box]),
  );
  const surfaces = classifyColumnSurfaces(boxes);

  for (const definition of definitions) {
    for (const box of boxes) {
      const footprintKeys = getFootprintKeys(box, definition);
      const footprintBoxes = footprintKeys.map((key) => boxesByPosition.get(key));
      if (footprintBoxes.some((footprintBox) =>
        footprintBox === undefined || !canSpawnOnSurface(footprintBox, definition, surfaces),
      )) continue;
      // Every block of the footprint must share the anchor's elevation: the sprite is
      // placed at the anchor's height, so a step under the footprint would show.
      if (footprintBoxes.some((footprintBox) => footprintBox?.elevation !== box.elevation)) continue;
      if (footprintKeys.some((key) => occupiedPositions.has(key))) continue;
      const sameTypePositions = positionsByType.get(definition.id) ?? new Set<string>();
      if (violatesGap(box, definition, sameTypePositions)) continue;
      if (random() >= definition.spawnChance) continue;

      footprintKeys.forEach((key) => {
        occupiedPositions.add(key);
        sameTypePositions.add(key);
      });
      positionsByType.set(definition.id, sameTypePositions);
      entities.push(new Entity(box.x, box.y, definition, box.elevation));
    }
  }

  return entities;
}

function getFootprintKeys(box: IGridObject, definition: EntityDefinition): string[] {
  const length = definition.length ?? 1;
  const lengthAxis = definition.lengthAxis ?? "x";

  return Array.from({ length }, (_, index) => {
    const x = lengthAxis === "x" ? box.x + index : box.x;
    const y = lengthAxis === "y" ? box.y + index : box.y;
    return `${x}:${y}`;
  });
}

function violatesGap(
  box: IGridObject,
  definition: EntityDefinition,
  sameTypePositions: ReadonlySet<string>,
): boolean {
  const gap = Math.max(0, Math.floor(definition.gap ?? 0));
  if (gap === 0) return false;

  const length = definition.length ?? 1;
  const isXAxis = (definition.lengthAxis ?? "x") === "x";
  const maxX = box.x + (isXAxis ? length - 1 : 0);
  const maxY = box.y + (isXAxis ? 0 : length - 1);

  for (let x = box.x - gap; x <= maxX + gap; x++) {
    for (let y = box.y - gap; y <= maxY + gap; y++) {
      if (sameTypePositions.has(`${x}:${y}`)) return true;
    }
  }

  return false;
}
