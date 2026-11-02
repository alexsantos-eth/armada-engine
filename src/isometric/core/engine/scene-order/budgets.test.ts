import { describe, expect, it } from "vitest";
import {
  CHUNK_KEEP_RADIUS,
  CHUNK_LOAD_RADIUS,
  CHUNK_PREFETCH_RADIUS,
  CHUNKS_HIDDEN_PER_FRAME,
  CHUNKS_LOADED_PER_FRAME,
  CHUNKS_SHOWN_PER_FRAME,
} from "./budgets";

describe("chunk budgets", () => {
  it("keeps the load, show and hide budgets pure and stable", () => {
    expect(CHUNK_LOAD_RADIUS).toBe(1);
    expect(CHUNK_PREFETCH_RADIUS).toBe(2);
    expect(CHUNK_KEEP_RADIUS).toBe(3);
    expect(CHUNKS_LOADED_PER_FRAME).toBe(1);
    expect(CHUNKS_SHOWN_PER_FRAME).toBe(1);
    expect(CHUNKS_HIDDEN_PER_FRAME).toBe(1);
  });
});
