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

function canSpawnOnSurface(box: IGridObject, surface: EntityDefinition["surface"]): boolean {
  switch (surface) {
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
      textureSource: definition.textureSource,
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

  get textureSource(): string {
    return this.data.textureSource;
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
  return definitions.flatMap((definition) =>
    boxes
      .filter(
        (box) =>
          canSpawnOnSurface(box, definition.surface) &&
          random() < definition.spawnChance,
      )
      .map(
        (box) =>
          new Entity(box.x, box.y, definition, box.elevation),
      ),
  );
}
