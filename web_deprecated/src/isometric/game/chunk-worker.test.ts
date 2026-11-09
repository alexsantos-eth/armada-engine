import { afterAll, describe, expect, it, vi } from "vitest";
import { chunkDataTransfer } from "../core/engine/world";
import { createChunkGenerator } from "./chunk-generator";

describe("chunk worker", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "onmessage");
  });

  it("answers each request with its chunk, transferring its buffers instead of copying them", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await import("./chunk-worker");
    const scope = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };

    scope.onmessage({ data: { seed: 3, cx: 0, cy: -1 } });

    const answer = createChunkGenerator()({ seed: 3, cx: 0, cy: -1 });
    expect(postMessage).toHaveBeenCalledWith(answer, chunkDataTransfer(answer.data));
    const [sent, transfer] = postMessage.mock.calls[0] as [typeof answer, ArrayBuffer[]];
    expect(transfer).toEqual(chunkDataTransfer(sent.data));
    expect(transfer[0]).toBe(sent.data.columns.x.buffer);
  });
});
