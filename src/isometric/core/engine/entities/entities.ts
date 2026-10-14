import type {
  BoxData,
  BoxMetadata,
  BoxType,
  EntityData,
  EntityDefinition,
  IEntity,
  IGridObject,
  IBox,
} from "../../types";
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

function canSpawnOnSurface(box: IGridObject, definition: EntityDefinition): boolean {
  if (
    definition.surfaceElevation !== undefined &&
    box.elevation !== definition.surfaceElevation
  ) {
    return false;
  }

  switch (definition.surface) {
    case "grass":
      return box.elevation >= 0;
    case "water":
      return box.elevation < 0;
  }
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

/** Creates configured entities on eligible terrain columns. */
export function createEntitiesFromConfig(
  boxes: IGridObject[],
  definitions: EntityDefinition[] = ENTITY_CONFIG,
  random: () => number = Math.random,
): Entity[] {
  const entities: Entity[] = [];
  const occupiedPositions = new Set<string>();
  const boxesByPosition = new Map(
    boxes.map((box) => [`${box.x}:${box.y}`, box]),
  );

  for (const definition of definitions) {
    for (const box of boxes) {
      const footprintKeys = getFootprintKeys(box, definition);
      const footprintBoxes = footprintKeys.map((key) => boxesByPosition.get(key));
      if (footprintBoxes.some((footprintBox) =>
        footprintBox === undefined || !canSpawnOnSurface(footprintBox, definition),
      )) continue;
      if (footprintKeys.some((key) => occupiedPositions.has(key))) continue;
      if (random() >= definition.spawnChance) continue;

      footprintKeys.forEach((key) => occupiedPositions.add(key));
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
