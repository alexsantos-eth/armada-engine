import { ENTITY_CONFIG } from "../content";
// The world module's barrel, not the engine's: the worker loads only what generates chunks, no Pixi.
import { type ChunkData, type ChunkSource, createSeededChunkSource, toChunkData } from "../core/engine/world";

/** What the game asks its chunk worker for: chunk `(cx, cy)` of the world of `seed`. */
export type ChunkRequest = { readonly seed: number; readonly cx: number; readonly cy: number };

/** What the chunk worker answers: the chunk asked for, as plain data. */
export type ChunkAnswer = ChunkRequest & { readonly data: ChunkData };

/**
 * Generates chunks as the game's world does (`generateWorld()` with the game's entities, unbounded):
 * what the chunk worker runs. A chunk depends only on the seed and its coordinates, so the one
 * made here is the one the world would make.
 */
export function createChunkGenerator(): (request: ChunkRequest) => ChunkAnswer {
  let world: { readonly seed: number; readonly source: ChunkSource } | undefined;
  return (request) => {
    if (world?.seed !== request.seed) {
      world = {
        seed: request.seed,
        source: createSeededChunkSource({ seed: request.seed, entityDefinitions: ENTITY_CONFIG }),
      };
    }
    return { ...request, data: toChunkData(world.source.generate({ cx: request.cx, cy: request.cy })) };
  };
}
