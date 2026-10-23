import { describe, expect, it } from "vitest";
import { ENTITY_CONFIG } from "../content";
import { fromChunkData, generateWorld } from "../core/engine";
import { createChunkGenerator } from "./chunk-generator";

/** Chunk `coord` as the game's world of `seed` loads it. */
const loadedChunk = (seed: number, coord: { cx: number; cy: number }) => {
  const chunk = generateWorld({ seed, entityDefinitions: ENTITY_CONFIG }).chunks.load(coord);
  return { columns: chunk?.columns, entities: chunk?.entities };
};

describe("createChunkGenerator", () => {
  it("answers with the chunk the game's world of that seed loads, as plain data", () => {
    const generate = createChunkGenerator();

    const answer = generate({ seed: 1337, cx: 1, cy: -2 });

    expect(answer).toMatchObject({ seed: 1337, cx: 1, cy: -2 });
    expect(structuredClone(answer)).toEqual(answer);
    expect(fromChunkData(answer.data)).toStrictEqual(loadedChunk(1337, { cx: 1, cy: -2 }));
  });

  it("follows the seed of each request", () => {
    const generate = createChunkGenerator();
    generate({ seed: 1, cx: 0, cy: 0 });

    const again = generate({ seed: 1, cx: 0, cy: 1 });
    const other = generate({ seed: 2, cx: 0, cy: 1 });

    expect(fromChunkData(again.data)).toStrictEqual(loadedChunk(1, { cx: 0, cy: 1 }));
    expect(fromChunkData(other.data)).toStrictEqual(loadedChunk(2, { cx: 0, cy: 1 }));
  });
});
