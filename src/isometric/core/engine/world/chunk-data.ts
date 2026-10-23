import type { BoxData } from "../../types";
import { Entity } from "../entities";
import { Box } from "../terrain";
import type { ChunkContent, SavedEntity } from "./chunks";

/** A terrain column as plain data: where it is, and its data. */
export type ColumnData = { readonly x: number; readonly y: number; readonly data: BoxData };

/**
 * A chunk's content as plain data, to cross between threads (structured clone): a chunk generated
 * in a worker comes back this way, and {@link fromChunkData} rebuilds exactly what the chunk source
 * generates.
 */
export type ChunkData = {
  readonly columns: readonly ColumnData[];
  readonly entities: readonly SavedEntity[];
};

/** `content` as plain data (see {@link ChunkData}). */
export function toChunkData(content: ChunkContent): ChunkData {
  return {
    columns: content.columns.map((column) => ({ x: column.x, y: column.y, data: column.getData() })),
    entities: content.entities.map((entity) => ({ x: entity.x, y: entity.y, data: entity.getData() })),
  };
}

/** The content `data` was made from (see {@link ChunkData}). */
export function fromChunkData(data: ChunkData): ChunkContent {
  return {
    columns: data.columns.map(({ x, y, data: column }) => new Box(x, y, column)),
    entities: data.entities.map(({ x, y, data: entity }) => Entity.fromData(x, y, entity)),
  };
}
