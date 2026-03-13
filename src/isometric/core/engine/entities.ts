import type {
  BoxData,
  BoxMetadata,
  BoxType,
  IBox,
  IShip,
  ShipDeckCoordinate,
  ShipOrientation,
} from "../types/entities";

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

export class Ship implements IShip {
  public readonly id: string;
  public readonly originX: number;
  public readonly originY: number;
  public readonly orientation: ShipOrientation;
  public readonly length = 2 as const;

  constructor(
    id: string,
    originX: number,
    originY: number,
    orientation: ShipOrientation = "HORIZONTAL",
  ) {
    this.id = id;
    this.originX = originX;
    this.originY = originY;
    this.orientation = orientation;
  }

  getOccupiedCoordinates(): ShipDeckCoordinate[] {
    const sternX =
      this.orientation === "HORIZONTAL" ? this.originX + 1 : this.originX;
    const sternY =
      this.orientation === "VERTICAL" ? this.originY + 1 : this.originY;

    return [
      {
        x: this.originX,
        y: this.originY,
        part: "BOW",
      },
      {
        x: sternX,
        y: sternY,
        part: "STERN",
      },
    ];
  }
}

type AddShipToBoxesOptions = {
  elevation?: number;
  metadata?: BoxMetadata;
  replaceExisting?: boolean;
  allowOverlay?: boolean;
};

export function addShipToBoxes(
  boxes: Box[],
  ship: Ship,
  options?: AddShipToBoxesOptions,
): Box[] {
  const replaceExisting = options?.replaceExisting ?? false;
  const allowOverlay = options?.allowOverlay ?? false;
  const occupiedCoordinates = ship.getOccupiedCoordinates();
  const occupiedKeys = new Set(
    occupiedCoordinates.map(({ x, y }) => `${x}:${y}`),
  );

  let updatedBoxes = boxes;

  if (replaceExisting) {
    updatedBoxes = boxes.filter((box) => !occupiedKeys.has(`${box.x}:${box.y}`));
  }

  occupiedCoordinates.forEach(({ x, y, part }) => {
    const collidingBoxes = updatedBoxes.filter((box) => box.x === x && box.y === y);
    const hasBlockingCollision = allowOverlay
      ? collidingBoxes.some((box) => box.type === "SHIP")
      : collidingBoxes.length > 0;

    if (hasBlockingCollision) {
      throw new Error(
        `Ship ${ship.id} collides with an existing box at (${x}, ${y}).`,
      );
    }

    updatedBoxes.push(
      new Box(x, y, {
        type: "SHIP",
        walkable: false,
        elevation: options?.elevation ?? 1,
        metadata: {
          ...(options?.metadata ?? {}),
          shipId: ship.id,
          shipPart: part,
          shipOrientation: ship.orientation,
        },
      }),
    );
  });

  return updatedBoxes;
}
