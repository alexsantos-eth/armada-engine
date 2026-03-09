import type { BoxData, BoxMetadata, BoxType, IBox } from "../types/entities";

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
