import { type ChunkRequest, createChunkGenerator } from "./chunk-generator";

/** The worker's global scope, as far as it is used here. */
type WorkerScope = {
  onmessage: ((event: { readonly data: ChunkRequest }) => void) | null;
  postMessage(message: unknown): void;
};

// The entry of the chunk worker (`startChunkWorker()`): answers each request with its chunk.
const scope = globalThis as unknown as WorkerScope;
const generate = createChunkGenerator();
scope.onmessage = ({ data }) => scope.postMessage(generate(data));
