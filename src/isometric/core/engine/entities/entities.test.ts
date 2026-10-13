import { describe, expect, it } from "vitest";
import { Box, Entity, createEntitiesFromConfig } from "./entities";

describe("Box", () => {
  it("applies defaults and preserves coordinates", () => {
    const box = new Box(2, 3);

    expect(box.x).toBe(2);
    expect(box.y).toBe(3);
    expect(box.type).toBe("EMPTY");
    expect(box.walkable).toBe(true);
    expect(box.elevation).toBe(0);
    expect(box.metadata).toEqual({});
  });

  it("merges data and metadata during construction and updates", () => {
    const box = new Box(0, 0, {
      elevation: 2,
      metadata: { biome: "grass", wet: false },
    });

    box.update({ elevation: 4, metadata: { wet: true } });

    expect(box.elevation).toBe(4);
    expect(box.metadata).toEqual({ biome: "grass", wet: true });
    expect(box.getData()).toEqual({
      type: "EMPTY",
      walkable: true,
      elevation: 4,
      metadata: { biome: "grass", wet: true },
    });
  });

  it("returns defensive metadata copies", () => {
    const box = new Box(0, 0, { metadata: { tag: "original" } });
    const data = box.getData();
    data.metadata.tag = "changed";

    expect(box.metadata.tag).toBe("original");
  });

  it("exposes generic entity data without sharing metadata", () => {
    const entity = new Entity(
      2,
      3,
      {
        id: "statue",
        textureSource: "/assets/statue/block.svg",
        height: 3,
        spawnChance: 1,
        surface: "grass",
      },
      4,
    );

    expect(entity.x).toBe(2);
    expect(entity.y).toBe(3);
    expect(entity.type).toBe("statue");
    expect(entity.walkable).toBe(false);
    expect(entity.elevation).toBe(4);
    expect(entity.height).toBe(3);
    expect(entity.textureSource).toBe("/assets/statue/block.svg");

    const data = entity.getData();
    data.metadata.tag = "changed";

    expect(entity.metadata).toEqual({});
  });

  it("creates configured entities only on their configured surface", () => {
    const boxes = [
      new Box(1, 2, { elevation: 3 }),
      new Box(4, 5, { elevation: -1 }),
      new Box(6, 7, { elevation: 0 }),
    ];

    const entities = createEntitiesFromConfig(
      boxes,
      [{
        id: "statue",
        textureSource: "/assets/statue/block.svg",
        height: 3,
        spawnChance: 1,
        surface: "grass",
      }],
      () => 0,
    );

    expect(entities).toHaveLength(2);
    expect(entities.map((entity) => entity.getData())).toEqual([
      {
        type: "statue",
        walkable: false,
        elevation: 3,
        height: 3,
        textureSource: "/assets/statue/block.svg",
        metadata: {},
      },
      {
        type: "statue",
        walkable: false,
        elevation: 0,
        height: 3,
        textureSource: "/assets/statue/block.svg",
        metadata: {},
      },
    ]);
    expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["1:2", "6:7"]);
  });

  it("uses the random result to skip eligible columns", () => {
    const boxes = [new Box(1, 2, { elevation: 1 })];

    expect(createEntitiesFromConfig(
      boxes,
      [{
        id: "tree",
        textureSource: "/assets/tree/block.svg",
        height: 2,
        spawnChance: 0.5,
        surface: "grass",
      }],
      () => 1,
    )).toEqual([]);
  });

  it("supports entities configured for water", () => {
    const entities = createEntitiesFromConfig(
      [new Box(1, 2, { elevation: -1 })],
      [{
        id: "buoy",
        textureSource: "/assets/buoy/block.svg",
        height: 1,
        spawnChance: 1,
        surface: "water",
      }],
      () => 0,
    );

    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe("buoy");
  });
});