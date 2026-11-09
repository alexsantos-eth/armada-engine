import { chunkDataTransfer } from "../core/engine/world";
import { type ChunkRequest, createChunkGenerator } from "./chunk-generator";

/** The worker's global scope, as far as it is used here. */
type WorkerScope = {
  onmessage: ((event: { readonly data: ChunkRequest }) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

// The entry of the chunk worker (`startChunkWorker()`): answers each request with its chunk, whose
// column buffers move to the main thread instead of being copied.
const scope = globalThis as unknown as WorkerScope;
const generate = createChunkGenerator();
scope.onmessage = ({ data }) => {
  const answer = generate(data);
  scope.postMessage(answer, chunkDataTransfer(answer.data));
};
