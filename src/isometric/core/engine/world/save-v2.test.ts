import { describe, expect, it, vi } from "vitest";
import { ChunkArchiveV2, parseWorldSaveV2, type SavedChunkV2 } from "./save-v2";

const chunk = (cx = -1, cy = 2): SavedChunkV2 => ({
  cx,
  cy,
  columns: [
    {
      x: cx * 32,
      y: cy * 32,
      walkable: true,
      blocks: [
        { elevation: -1, material: "ground" },
        { elevation: 0, material: "sand" },
      ],
    },
  ],
  entities: [{ instanceId: "tree-1", blueprintId: "tree", x: cx * 32, y: cy * 32, elevation: 0, state: { health: 5 } }],
  changes: { mined: ["stone-1"] },
});

describe("Armada Engine 2 chunk archive", () => {
  it("keeps complete discovered chunks after unloading and reopening, without a seed", () => {
    const archive = new ChunkArchiveV2();
    const generate = vi.fn(chunk);
    const first = archive.getOrGenerate(-1, 2, generate);
    (first.columns[0].blocks[0] as { material: string }).material = "water";
    expect(archive.get(-1, 2)?.columns[0].blocks[0].material).toBe("ground");
    expect(archive.getOrGenerate(-1, 2, generate).entities[0].instanceId).toBe("tree-1");
    expect(generate).toHaveBeenCalledTimes(1);

    const saved = archive.snapshot({ x: 3, y: 4, inventory: ["axe"] }, { clock: { tick: 42 } });
    const reopened = ChunkArchiveV2.restore(parseWorldSaveV2(JSON.parse(JSON.stringify(saved))));
    expect(reopened.get(-1, 2)).toEqual(chunk());
    expect(reopened.get(0, 0)).toBeUndefined();
    expect(reopened.getOrGenerate(0, 0, chunk)).toEqual(chunk(0, 0));
    expect(saved.player).toEqual({ x: 3, y: 4, inventory: ["axe"] });
    expect(saved.systems).toEqual({ clock: { tick: 42 } });
  });

  it("rejects generators that return a different chunk and snapshots in stable order", () => {
    const archive = new ChunkArchiveV2();
    expect(() => archive.getOrGenerate(0, 0, () => chunk(1, 0))).toThrow("coordinates");
    archive.put(chunk(2, 1));
    archive.put(chunk(3, 0));
    archive.put(chunk(-1, 0));
    expect(archive.snapshot({}, {}).chunks.map(({ cx, cy }) => [cx, cy])).toEqual([
      [-1, 0],
      [3, 0],
      [2, 1],
    ]);
  });

  it.each([
    [null, "object"],
    [[], "object"],
    [{ version: 7 }, "format"],
    [{ format: "armada-engine-2", schemaVersion: 2 }, "version"],
    [{ format: "armada-engine-2", schemaVersion: 1, chunks: {}, player: {}, systems: {} }, "structure"],
    [{ format: "armada-engine-2", schemaVersion: 1, chunks: [], player: [], systems: {} }, "structure"],
  ])("rejects invalid save header %#", (value, message) => {
    expect(() => parseWorldSaveV2(value)).toThrow(message);
  });

  it("rejects duplicate chunks and malformed terrain or entities", () => {
    const valid = () => new ChunkArchiveV2().snapshot({}, {});
    const parseChunk = (mutate: (item: Record<string, unknown>) => void) => {
      const item = JSON.parse(JSON.stringify(chunk())) as Record<string, unknown>;
      mutate(item);
      return () => parseWorldSaveV2({ ...valid(), chunks: [item] });
    };
    expect(() => parseWorldSaveV2({ ...valid(), chunks: [chunk(), chunk()] })).toThrow("Duplicate");
    expect(
      parseChunk((item) => {
        item.cx = 1.5;
      }),
    ).toThrow("chunk structure");
    expect(
      parseChunk((item) => {
        item.changes = [];
      }),
    ).toThrow("chunk structure");
    expect(
      parseChunk((item) => {
        item.columns = [null];
      }),
    ).toThrow("terrain column");
    expect(
      parseChunk((item) => {
        item.columns = [{ ...chunk().columns[0], x: 0 }];
      }),
    ).toThrow("terrain column");
    expect(
      parseChunk((item) => {
        item.columns = [{ ...chunk().columns[0], blocks: [] }];
      }),
    ).toThrow("terrain column");
    expect(
      parseChunk((item) => {
        item.columns = [{ ...chunk().columns[0], blocks: [{ elevation: 0, material: "lava" }] }];
      }),
    ).toThrow("terrain column");
    expect(
      parseChunk((item) => {
        item.entities = [null];
      }),
    ).toThrow("entity instance");
    expect(
      parseChunk((item) => {
        item.entities = [{ ...chunk().entities[0], state: [] }];
      }),
    ).toThrow("entity instance");
  });
});
