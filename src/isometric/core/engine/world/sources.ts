import type { ChunkCoord, EntityDefinition, WorldRect } from "../../types";
import { createEntitiesFromConfig, type Entity } from "../entities";
import { chunkKey, chunkRect, toChunkCoord } from "../grid";
import { createSeededRandom, deriveSeed } from "../random";
import { type Box, generateTerrainColumns } from "../terrain";
import type { ChunkContent, ChunkSource } from "./chunks";

/** Options of {@link createSeededChunkSource}. */
export type SeededChunkSourceOptions = {
  readonly seed: number;
  /** Entity definitions to place in every chunk (game content). */
  readonly entityDefinitions: readonly EntityDefinition[];
  /** Columns of a bounded world: no chunk, nor column, outside them. Defaults to unbounded. */
  readonly bounds?: WorldRect;
};

const overlaps = (a: WorldRect, b: WorldRect) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/**
 * Chunks generated from the world seed, each on its own: the terrain of the chunk
 * (`generateTerrainColumns()`, seamless with its neighbours) and its entities
 * (`createEntitiesFromConfig()` on the chunk's columns, from the streams
 * `deriveSeed(seed, "entities@<chunk key>")` and `"entity-color-variants@<chunk key>"`, and the world
 * seed for patches). The same
 * chunk is the same whatever else is loaded and in whatever order.
 *
 * An entity's footprint and formation stay inside its chunk, and `gap` is kept among the
 * instances of one chunk: two chunks never wait for each other.
 */
export function createSeededChunkSource({ seed, entityDefinitions, bounds }: SeededChunkSourceOptions): ChunkSource {
  return {
    has: (coord) => bounds === undefined || overlaps(chunkRect(coord), bounds),
    generate: (coord) => {
      const columns = generateTerrainColumns(chunkRect(coord), { seed, clip: bounds });
      const key = chunkKey(coord.cx, coord.cy);
      const entities = createEntitiesFromConfig(
        columns,
        entityDefinitions,
        createSeededRandom(deriveSeed(seed, `entities@${key}`)),
        createSeededRandom(deriveSeed(seed, `entity-color-variants@${key}`)),
        seed,
      );
      return { columns, entities };
    },
  };
}

/**
 * Chunks cut from fixed terrain columns and entities (tools, tests, hand-made maps): a chunk
 * exists when one of the columns is in it, and holds its columns and the entities anchored in it,
 * in input order.
 */
export function createFixedChunkSource(columns: readonly Box[], entities: readonly Entity[] = []): ChunkSource {
  const chunks = new Map<number, { columns: Box[]; entities: Entity[] }>();
  const chunkOf = ({ x, y }: { x: number; y: number }) => {
    const { cx, cy } = toChunkCoord({ x, y });
    const key = chunkKey(cx, cy);
    const content = chunks.get(key) ?? { columns: [], entities: [] };
    chunks.set(key, content);
    return content;
  };
  columns.forEach((column) => chunkOf(column).columns.push(column));
  entities.forEach((entity) => chunkOf(entity).entities.push(entity));

  const at = ({ cx, cy }: ChunkCoord) => chunks.get(chunkKey(cx, cy));
  return {
    has: (coord) => (at(coord)?.columns.length ?? 0) > 0,
    generate: (coord): ChunkContent => at(coord) as ChunkContent,
  };
}
