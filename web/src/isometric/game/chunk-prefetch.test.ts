import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_PREFETCH_RADIUS, chunksAround, generateWorld } from "../core/engine";
import { type ChunkAnswer, createChunkGenerator, type ChunkRequest } from "./chunk-generator";
import { CHUNKS_IN_FLIGHT, createChunkPrefetch, type ChunkWorker, startChunkWorker } from "./chunk-prefetch";

/** A worker that keeps the requests until the test answers them. */
const fakeWorker = () => {
  const requests: ChunkRequest[] = [];
  const generate = createChunkGenerator();
  const worker = {
    onmessage: null as ChunkWorker["onmessage"],
    postMessage: vi.fn((request: ChunkRequest) => requests.push(request)),
    terminate: vi.fn(),
    /** Answers the oldest request still open. */
    answer: () => worker.onmessage?.({ data: generate(requests.shift() as ChunkRequest) } as MessageEvent<ChunkAnswer>),
  };
  return { worker, requests };
};

const world = () => generateWorld({ seed: 11, entityDefinitions: [] });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startChunkWorker", () => {
  it("starts a module worker running the chunk worker", () => {
    const Worker = vi.fn();
    vi.stubGlobal("Worker", Worker);

    startChunkWorker();

    const [url, options] = Worker.mock.lastCall as [URL, WorkerOptions];
    expect(url.href).toMatch(/\/chunk-worker\.ts$/);
    expect(options).toEqual({ type: "module" });
  });
});

describe("createChunkPrefetch", () => {
  // Far from the chunks a new world loads around its centre.
  const far = { cx: 20, cy: 0 };
  const asked = (coords: readonly { cx: number; cy: number }[]) => coords.map((coord) => ({ seed: 11, ...coord }));

  it("asks for the needed chunks first, then those ahead, a few at a time", () => {
    const { worker, requests } = fakeWorker();
    const prefetch = createChunkPrefetch(world(), worker);

    prefetch.request([far]);
    expect(CHUNKS_IN_FLIGHT).toBe(2);
    expect(requests).toEqual(asked(chunksAround(far, 1).slice(0, 2)));
    // Nothing more until one is answered, and never the same chunk twice.
    prefetch.request([far]);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);

    for (let answered = 0; answered < 9; answered += 1) {
      worker.answer();
      prefetch.request([far]);
    }
    expect(CHUNK_PREFETCH_RADIUS).toBe(2);
    expect(worker.postMessage.mock.calls.map(([request]) => request)).toEqual(
      asked([...chunksAround(far, 1), ...chunksAround(far, 2).slice(0, 2)]),
    );
  });

  it("prepares each answered chunk in the world", () => {
    const { worker, requests } = fakeWorker();
    const target = world();
    const prefetch = createChunkPrefetch(target, worker);
    prefetch.request([far]);
    const [first] = requests;

    worker.answer();

    expect(target.chunks.isPrepared(first)).toBe(true);
    expect(target.chunks.load(first)).toBeDefined();
  });

  it("skips the chunks loaded, prepared or not in the world", () => {
    const { worker } = fakeWorker();
    // Chunks 0…7 along x; the world loads 3…5 around its centre.
    const bounded = generateWorld({ seed: 11, entityDefinitions: [], size: { width: 256, height: 32 } });
    bounded.chunks.prepare({ cx: 6, cy: 0 }, { columns: [], entities: [] });
    const prefetch = createChunkPrefetch(bounded, worker);

    prefetch.request([{ cx: 7, cy: 0 }]);

    expect(worker.postMessage.mock.calls.map(([request]) => request)).toEqual(asked([{ cx: 7, cy: 0 }]));
  });

  it("stops the worker and drops what it still answers", () => {
    const { worker } = fakeWorker();
    const prefetch = createChunkPrefetch(world(), worker);

    prefetch.destroy();

    expect(worker.terminate).toHaveBeenCalled();
    expect(worker.onmessage).toBeNull();
  });
});
