import type { BoxMetadata, BoxType } from "../../types";
import { Entity } from "../entities";
import { Box } from "../terrain";
import type { ChunkContent, SavedEntity } from "./chunks";

/** Index of each terrain type in {@link PackedColumns.type}: every `BoxType` has one. */
const TYPE_INDEX: Readonly<Record<BoxType, number>> = { grass: 0, ground: 1, sand: 2, water: 3, path: 4 };

/** The terrain types by their index in {@link PackedColumns.type}. */
const TYPES = (Object.keys(TYPE_INDEX) as BoxType[]).sort((a, b) => TYPE_INDEX[a] - TYPE_INDEX[b]);

/** A column that is not walkable or carries metadata, by its index in {@link PackedColumns}. */
export type ColumnExtra = {
  readonly index: number;
  readonly walkable: boolean;
  readonly metadata: BoxMetadata;
};

/**
 * Terrain columns as typed arrays, one entry per column in content order: what crosses between
 * threads instead of an object per column (#96). The few columns that are not walkable or carry
 * metadata are listed in `extras`.
 */
export type PackedColumns = {
  readonly x: Int32Array<ArrayBuffer>;
  readonly y: Int32Array<ArrayBuffer>;
  readonly elevation: Float64Array<ArrayBuffer>;
  /** Each column's type, by its index in the fixed table of terrain types. */
  readonly type: Uint8Array<ArrayBuffer>;
  readonly extras: readonly ColumnExtra[];
};

/**
 * A chunk's content as plain data, to cross between threads (structured clone, with
 * {@link chunkDataTransfer}): a chunk generated in a worker comes back this way, and
 * {@link fromChunkData} rebuilds exactly what the chunk source generates.
 */
export type ChunkData = {
  readonly columns: PackedColumns;
  readonly entities: readonly SavedEntity[];
};

/** `content` as plain data (see {@link ChunkData}). */
export function toChunkData(content: ChunkContent): ChunkData {
  const { length } = content.columns;
  const columns = {
    x: new Int32Array(length),
    y: new Int32Array(length),
    elevation: new Float64Array(length),
    type: new Uint8Array(length),
    extras: [] as ColumnExtra[],
  };
  content.columns.forEach((column, index) => {
    columns.x[index] = column.x;
    columns.y[index] = column.y;
    columns.elevation[index] = column.elevation;
    columns.type[index] = TYPE_INDEX[column.type];
    if (!column.walkable || Object.keys(column.metadata).length > 0) {
      columns.extras.push({ index, walkable: column.walkable, metadata: { ...column.metadata } });
    }
  });
  return {
    columns,
    entities: content.entities.map((entity) => ({ x: entity.x, y: entity.y, data: entity.getData() })),
  };
}

/** The buffers of `data` that can be transferred, not copied (`postMessage(data, transfer)`). */
export function chunkDataTransfer({ columns }: ChunkData): ArrayBuffer[] {
  return [columns.x.buffer, columns.y.buffer, columns.elevation.buffer, columns.type.buffer];
}

/** The content `data` was made from (see {@link ChunkData}). */
export function fromChunkData(data: ChunkData): ChunkContent {
  const { x, y, elevation, type, extras } = data.columns;
  const extraAt = new Map(extras.map((extra) => [extra.index, extra]));
  const columns: Box[] = [];
  for (let index = 0; index < type.length; index += 1) {
    const extra = extraAt.get(index);
    columns.push(
      new Box(x[index], y[index], {
        type: TYPES[type[index]],
        elevation: elevation[index],
        walkable: extra?.walkable,
        metadata: extra?.metadata,
      }),
    );
  }
  return {
    columns,
    entities: data.entities.map(({ x: entityX, y: entityY, data: entity }) =>
      Entity.fromData(entityX, entityY, entity),
    ),
  };
}
