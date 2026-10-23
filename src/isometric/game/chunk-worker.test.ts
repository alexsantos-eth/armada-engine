import { afterAll, describe, expect, it, vi } from "vitest";
import { createChunkGenerator } from "./chunk-generator";

describe("chunk worker", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "onmessage");
  });

  it("answers each request with its chunk", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await import("./chunk-worker");
    const scope = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };

    scope.onmessage({ data: { seed: 3, cx: 0, cy: -1 } });

    expect(postMessage).toHaveBeenCalledWith(createChunkGenerator()({ seed: 3, cx: 0, cy: -1 }));
  });
});
