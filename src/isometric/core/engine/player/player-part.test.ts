import { describe, expect, it, vi } from "vitest";
import type { ITerrainColumn } from "../../types";
import { CellMap } from "../grid";
import { findPlayerSpawn, PLAYER_PART } from "./player";
import { createPlayerPart } from "./player-part";

const part = createPlayerPart();

const column = (x: number, y: number, elevation: number, type: ITerrainColumn["type"] = "grass"): ITerrainColumn => ({
  x,
  y,
  elevation,
  type,
  metadata: {},
});

const ground = (columns: ITerrainColumn[], centre = { x: 1, y: 1 }) => ({
  centre,
  chunks: { loadAround: vi.fn() },
  columnIndex: CellMap.from(columns, (c) => c),
  occupancy: { at: () => [] },
});

describe("createPlayerPart", () => {
  it("is the player part", () => {
    expect(part.id).toBe(PLAYER_PART.id);
  });

  it("spawns a standing player on the walkable column nearest the centre of the world", () => {
    const world = ground([column(0, 0, 1), column(1, 1, 2, "water"), column(2, 1, 3)]);
    const player = part.create(world);

    expect(player).toMatchObject({ ...findPlayerSpawn(world, { x: 1, y: 1 }), walk: { x: 0, y: 0 } });
    expect(player).toMatchObject({ x: 2, y: 1, elevation: 3 });
    expect(player.previous).toEqual({ x: 2, y: 1, elevation: 3 });
    // The ground around the centre first, to find the spawn; then around the spawn.
    expect(world.chunks.loadAround.mock.calls).toEqual([[{ x: 1, y: 1 }], [{ x: 2, y: 1, elevation: 3 }]]);
  });

  it("saves where the player stands, but not its walk or previous position", () => {
    const world = ground([column(0, 0, 1)]);
    const player = { ...part.create(world), x: 0.3, walk: { x: 1, y: 0 } };

    expect(JSON.parse(JSON.stringify(part.serialize(player)))).toEqual({ x: 0.3, y: 0 });
  });

  it("restores a standing player where it was saved, on the column under it", () => {
    const world = ground([column(0, 0, 1), column(1, 0, 2)]);
    const player = part.restore({ x: 0.8, y: 0 }, world);

    expect(player).toEqual({
      x: 0.8,
      y: 0,
      elevation: 2,
      previous: { x: 0.8, y: 0, elevation: 2 },
      walk: { x: 0, y: 0 },
    });
    expect(world.chunks.loadAround).toHaveBeenCalledWith({ x: 0.8, y: 0 });
  });
});
