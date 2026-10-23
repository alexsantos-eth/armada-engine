import { describe, expect, it } from "vitest";
import type { EntityDefinition } from "../../types";
import { Box } from "../terrain";
import { createSeededChunkSource } from "./sources";
import { chunkDataTransfer, fromChunkData, toChunkData } from "./chunk-data";

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

  it("packs the columns in typed arrays: a generated chunk crosses with no object per column (#96)", () => {
    const generated = createSeededChunkSource({ seed: 1337, entityDefinitions: [] }).generate({ cx: 0, cy: 0 });

    const { columns } = toChunkData(generated);

    expect(columns.x).toBeInstanceOf(Int32Array);
    expect(columns.y).toBeInstanceOf(Int32Array);
    expect(columns.elevation).toBeInstanceOf(Float64Array);
    expect(columns.type).toBeInstanceOf(Uint8Array);
    expect(columns.type).toHaveLength(generated.columns.length);
    expect(columns.extras).toEqual([]);
  });

  it("keeps the columns that are not walkable or carry metadata, and any elevation", () => {
    const columns = [
      new Box(4, -7, { elevation: 2.5, type: "ground" }),
      new Box(5, -7, { elevation: -2, type: "water", walkable: false }),
      new Box(6, -7, { elevation: 0, type: "sand", metadata: { kind: "shore" } }),
    ];

    const rebuilt = fromChunkData(structuredClone(toChunkData({ columns, entities: [] })));

    expect(rebuilt.columns).toStrictEqual(columns);
  });

  it("lists the buffers to transfer instead of copying", () => {
    const generated = createSeededChunkSource({ seed: 3, entityDefinitions: [TREE] }).generate({ cx: -1, cy: 1 });
    const data = toChunkData(generated);
    const transfer = chunkDataTransfer(data);

    const moved = structuredClone(data, { transfer });

    expect(transfer).toHaveLength(4);
    expect(data.columns.x).toHaveLength(0);
    expect(fromChunkData(moved)).toStrictEqual(generated);
  });

  it("copies the data: changing the rebuilt chunk leaves the original as it was", () => {
    const source = createSeededChunkSource({ seed: 7, entityDefinitions: [TREE] });
    const generated = source.generate({ cx: 0, cy: 0 });
    const data = toChunkData(generated);

    fromChunkData(data).columns[0].update({ elevation: 99, metadata: { mark: 1 } });

    expect(generated.columns[0].elevation).not.toBe(99);
    expect(data.columns.elevation[0]).not.toBe(99);
    expect(data.columns.extras).toEqual([]);
  });
});
