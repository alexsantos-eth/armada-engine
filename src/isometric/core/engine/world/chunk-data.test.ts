import { describe, expect, it } from "vitest";
import type { EntityDefinition } from "../../types";
import { createSeededChunkSource } from "./sources";
import { fromChunkData, toChunkData } from "./chunk-data";

const TREE: EntityDefinition = {
  id: "tree",
  textureSource: "/assets/tree/block.svg",
  height: 2,
  spawnChance: 0.3,
  surface: "grass",
  colorReplacements: { "#00ff00": ["#00ee00", "#00dd00"] },
};

describe("toChunkData / fromChunkData", () => {
  it("rebuilds exactly what the source generates, through a structured clone", () => {
    const source = createSeededChunkSource({ seed: 1337, entityDefinitions: [TREE] });
    const coord = { cx: 2, cy: -1 };
    const generated = source.generate(coord);

    const rebuilt = fromChunkData(structuredClone(toChunkData(generated)));

    expect(generated.entities.length).toBeGreaterThan(0);
    expect(rebuilt).toStrictEqual(source.generate(coord));
  });

  it("copies the data: changing the rebuilt chunk leaves the original as it was", () => {
    const source = createSeededChunkSource({ seed: 7, entityDefinitions: [TREE] });
    const generated = source.generate({ cx: 0, cy: 0 });
    const data = toChunkData(generated);

    fromChunkData(data).columns[0].update({ elevation: 99, metadata: { mark: 1 } });

    expect(generated.columns[0].elevation).not.toBe(99);
    expect(data.columns[0].data.metadata).toEqual({});
  });
});
