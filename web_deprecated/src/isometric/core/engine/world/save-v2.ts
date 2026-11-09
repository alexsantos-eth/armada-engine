import { CHUNK_SIZE, chunkKey } from "../grid";

export type SaveValueV2 = null | boolean | number | string | SaveValueV2[] | { [key: string]: SaveValueV2 };
export type SaveObjectV2 = { [key: string]: SaveValueV2 };

export type SavedBlockV2 = {
  readonly elevation: number;
  readonly material: "grass" | "ground" | "sand" | "water" | "path";
};
export type SavedColumnV2 = {
  readonly x: number;
  readonly y: number;
  readonly walkable: boolean;
  readonly blocks: readonly SavedBlockV2[];
};
export type SavedEntityV2 = {
  readonly instanceId: string;
  readonly blueprintId: string;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly state: SaveObjectV2;
};
export type SavedChunkV2 = {
  readonly cx: number;
  readonly cy: number;
  readonly columns: readonly SavedColumnV2[];
  readonly entities: readonly SavedEntityV2[];
  readonly changes: SaveObjectV2;
};
export type WorldSaveV2 = {
  readonly format: "armada-engine-2";
  readonly schemaVersion: 1;
  readonly chunks: readonly SavedChunkV2[];
  readonly player: SaveObjectV2;
  readonly systems: SaveObjectV2;
};

const clone = <T>(value: T): T => structuredClone(value);

/** Owns every discovered chunk, including chunks that are currently unloaded from the scene. */
export class ChunkArchiveV2 {
  private readonly chunks = new Map<number, SavedChunkV2>();

  put(chunk: SavedChunkV2): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cy), clone(chunk));
  }

  get(cx: number, cy: number): SavedChunkV2 | undefined {
    const chunk = this.chunks.get(chunkKey(cx, cy));
    return chunk === undefined ? undefined : clone(chunk);
  }

  getOrGenerate(cx: number, cy: number, generate: (cx: number, cy: number) => SavedChunkV2): SavedChunkV2 {
    const existing = this.get(cx, cy);
    if (existing !== undefined) return existing;
    const created = generate(cx, cy);
    if (created.cx !== cx || created.cy !== cy) throw new Error("Generated chunk coordinates do not match request");
    this.put(created);
    return this.get(cx, cy)!;
  }

  snapshot(player: SaveObjectV2, systems: SaveObjectV2): WorldSaveV2 {
    return clone({
      format: "armada-engine-2",
      schemaVersion: 1,
      chunks: [...this.chunks.values()].sort((a, b) => a.cy - b.cy || a.cx - b.cx),
      player,
      systems,
    });
  }

  static restore(save: WorldSaveV2): ChunkArchiveV2 {
    const archive = new ChunkArchiveV2();
    for (const chunk of save.chunks) archive.put(chunk);
    return archive;
  }
}

/** Checks the version and structure at the save-file boundary; V1 snapshots are rejected. */
export function parseWorldSaveV2(value: unknown): WorldSaveV2 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Save must be an object");
  const save = value as Record<string, unknown>;
  if (save.format !== "armada-engine-2" || save.schemaVersion !== 1)
    throw new Error("Unsupported save format or version");
  if (!Array.isArray(save.chunks) || !isObject(save.player) || !isObject(save.systems))
    throw new Error("Invalid save structure");
  const seenChunks = new Set<number>();
  for (const chunk of save.chunks) {
    if (
      !isObject(chunk) ||
      !Number.isInteger(chunk.cx) ||
      !Number.isInteger(chunk.cy) ||
      !Array.isArray(chunk.columns) ||
      !Array.isArray(chunk.entities) ||
      !isObject(chunk.changes)
    ) {
      throw new Error("Invalid chunk structure");
    }
    const key = chunkKey(chunk.cx as number, chunk.cy as number);
    if (seenChunks.has(key)) throw new Error("Duplicate chunk");
    seenChunks.add(key);
    for (const column of chunk.columns) {
      if (
        !isObject(column) ||
        !Number.isInteger(column.x) ||
        !Number.isInteger(column.y) ||
        Math.floor((column.x as number) / CHUNK_SIZE) !== chunk.cx ||
        Math.floor((column.y as number) / CHUNK_SIZE) !== chunk.cy ||
        typeof column.walkable !== "boolean" ||
        !Array.isArray(column.blocks) ||
        column.blocks.length === 0 ||
        column.blocks.some(
          (block: unknown) =>
            !isObject(block) ||
            !Number.isInteger(block.elevation) ||
            !["grass", "ground", "sand", "water", "path"].includes(block.material as string),
        )
      ) {
        throw new Error("Invalid terrain column");
      }
    }
    for (const entity of chunk.entities) {
      if (
        !isObject(entity) ||
        typeof entity.instanceId !== "string" ||
        !entity.instanceId ||
        typeof entity.blueprintId !== "string" ||
        !entity.blueprintId ||
        !Number.isFinite(entity.x) ||
        !Number.isFinite(entity.y) ||
        !Number.isFinite(entity.elevation) ||
        !isObject(entity.state)
      )
        throw new Error("Invalid entity instance");
    }
  }
  return value as WorldSaveV2;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
