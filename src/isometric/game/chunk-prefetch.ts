import {
  CHUNK_LOAD_RADIUS,
  CHUNK_PREFETCH_RADIUS,
  chunkKey,
  chunksAround,
  fromChunkData,
  type World,
} from "../core/engine";
import type { ChunkCoord, ChunkKey } from "../core/types";
import type { ChunkAnswer, ChunkRequest } from "./chunk-generator";

/** What the game uses of the Web Worker that runs `chunk-worker.ts`. */
export type ChunkWorker = {
  postMessage(request: ChunkRequest): void;
  onmessage: ((event: MessageEvent<ChunkAnswer>) => void) | null;
  terminate(): void;
};

/** Starts the chunk worker: a module Web Worker running `chunk-worker.ts`. */
export function startChunkWorker(): ChunkWorker {
  return new Worker(new URL("./chunk-worker.ts", import.meta.url), { type: "module" });
}

/**
 * Chunks the worker is asked for at a time: few, so a request is never stale for long when the
 * camera turns, and the worker is never idle while the camera moves.
 */
export const CHUNKS_IN_FLIGHT = 2;

/** Chunks generated ahead in a worker ({@link createChunkPrefetch}). */
export type ChunkPrefetch = {
  /**
   * Asks the worker for the chunks around `focus` (as `world.chunks.stream()` takes it) that are
   * neither loaded, prepared nor asked for, the needed ones first, up to {@link CHUNKS_IN_FLIGHT}.
   */
  request(focus: readonly ChunkCoord[]): void;
  /** Stops the worker; answers still on their way are dropped. */
  readonly destroy: () => void;
};

/**
 * Generates in `worker` the chunks the world loads soon, within `CHUNK_PREFETCH_RADIUS` of the
 * focus, and hands each one to the world (`world.chunks.prepare()`): loading it then only indexes
 * it, and the garbage of generating stays in the worker (#91). The world's content is the same
 * either way, so a chunk the worker has not made yet is generated on the main thread when it is
 * needed (`stream()` with `prefetchPrepared`).
 */
export function createChunkPrefetch(world: World, worker: ChunkWorker): ChunkPrefetch {
  const asked = new Set<ChunkKey>();
  worker.onmessage = ({ data: { cx, cy, data } }) => {
    asked.delete(chunkKey(cx, cy));
    world.chunks.prepare({ cx, cy }, fromChunkData(data));
  };

  return {
    request: (focus) => {
      const near = [CHUNK_LOAD_RADIUS, CHUNK_PREFETCH_RADIUS].flatMap((radius) =>
        focus.flatMap((centre) => chunksAround(centre, radius)),
      );
      for (const coord of near) {
        if (asked.size >= CHUNKS_IN_FLIGHT) return;
        const key = chunkKey(coord.cx, coord.cy);
        const { chunks } = world;
        if (asked.has(key) || chunks.has(coord) || chunks.isPrepared(coord) || !chunks.exists(coord)) continue;
        asked.add(key);
        worker.postMessage({ seed: world.seed, cx: coord.cx, cy: coord.cy });
      }
    },
    destroy: () => {
      worker.onmessage = null;
      worker.terminate();
    },
  };
}
