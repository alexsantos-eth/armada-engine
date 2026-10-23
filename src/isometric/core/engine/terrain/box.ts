import type { BoxData, BoxMetadata, BoxType, IBox } from "../../types";

/**
 * Metadata of every box created without any: one shared, frozen object, so a terrain column is a
 * single object (a chunk holds 1 024 of them, and the garbage collector walks every one, #96).
 */
const NO_METADATA: Readonly<BoxMetadata> = Object.freeze({});

/** `metadata` as a box keeps it: frozen, its own copy unless it is frozen already, shared when empty. */
function keepMetadata(metadata: Readonly<BoxMetadata>): Readonly<BoxMetadata> {
  if (Object.isFrozen(metadata)) return metadata;
  return Object.keys(metadata).length === 0 ? NO_METADATA : Object.freeze({ ...metadata });
}

/**
 * Material a block gets from its elevation alone: water below zero, grass otherwise. Sand
 * and ground depend on the neighbours and on the column, so `createTerrainColumns()` and
 * `createVisibleBlocks()` assign them.
 */
export const getElevationMaterial = (elevation: number): BoxType => (elevation < 0 ? "water" : "grass");

/**
 * One materialized terrain block: immutable grid coordinates plus mutable data (`type`,
 * `walkable`, `elevation`, `metadata`). Used only for terrain; entities are `Entity`.
 * Without a `type`, it takes {@link getElevationMaterial} of its initial elevation; without
 * `walkable`, it is walkable.
 *
 * Its data are fields of its own, not a data object, and its `metadata` is frozen (shared among
 * the boxes without any): a box is one object. Change the metadata with `update()`; `getData()`
 * returns a copy.
 */
export class Box implements IBox {
  public readonly x: number;
  public readonly y: number;

  private currentType: BoxType;
  private currentWalkable: boolean;
  private currentElevation: number;
  private currentMetadata: Readonly<BoxMetadata>;

  constructor(x: number, y: number, initialData?: Partial<BoxData>) {
    this.x = x;
    this.y = y;
    this.currentElevation = initialData?.elevation ?? 0;
    this.currentType = initialData?.type ?? getElevationMaterial(this.currentElevation);
    this.currentWalkable = initialData?.walkable ?? true;
    this.currentMetadata = initialData?.metadata ? keepMetadata(initialData.metadata) : NO_METADATA;
  }

  get type(): BoxType {
    return this.currentType;
  }

  get walkable(): boolean {
    return this.currentWalkable;
  }

  get elevation(): number {
    return this.currentElevation;
  }

  /** Read-only (frozen): changing it throws; replace it with `update({ metadata })`. */
  get metadata(): Readonly<BoxMetadata> {
    return this.currentMetadata;
  }

  getData(): BoxData {
    return {
      type: this.currentType,
      walkable: this.currentWalkable,
      elevation: this.currentElevation,
      metadata: { ...this.currentMetadata },
    };
  }

  /** Changes the fields `data` gives; its `metadata` is merged over the current one. */
  update(data: Partial<BoxData>): void {
    this.currentType = data.type ?? this.currentType;
    this.currentWalkable = data.walkable ?? this.currentWalkable;
    this.currentElevation = data.elevation ?? this.currentElevation;
    if (data.metadata) this.currentMetadata = keepMetadata({ ...this.currentMetadata, ...data.metadata });
  }
}
