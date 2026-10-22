import { describe, expect, it, vi } from "vitest";
import { Box } from "../terrain";
import { Entity, createEntitiesFromConfig, getEntityFootprint, getFootprint, indexEntities } from "./entities";

describe("createEntitiesFromConfig formations", () => {
  const tree = {
    id: "tree",
    textureSource: "/assets/tree/block.svg",
    height: 1,
    surface: "grass" as const,
  };

  function grid(width: number, height: number, elevation = 1): Box[] {
    return Array.from({ length: width }, (_, x) =>
      Array.from({ length: height }, (__, y) => new Box(x, y, { elevation })),
    ).flat();
  }

  function sequence(...values: number[]): () => number {
    return () => values.shift() ?? 1;
  }

  const positions = (entities: Entity[]) => entities.map(({ x, y }) => `${x}:${y}`);

  it("places the whole group around the anchor with a single spawn roll", () => {
    let calls = 0;
    const random = sequence(0);
    const entities = createEntitiesFromConfig(
      grid(4, 4),
      [{ ...tree, spawnChance: 0.5, formation: { map: ["XX", "X."] } }],
      () => {
        calls++;
        return random();
      },
    );

    expect(positions(entities)).toEqual(["0:0", "1:0", "0:1"]);
    expect(entities.every(({ type }) => type === "tree")).toBe(true);
    // The anchor rolls once, then each of the 13 columns left free; members never roll.
    expect(calls).toBe(1 + 16 - 3);
  });

  it("discards a group when fewer than minMembers fit", () => {
    const definition = { ...tree, spawnChance: 1, formation: { map: ["XXX"] } };

    expect(createEntitiesFromConfig(grid(2, 1), [definition], () => 0)).toEqual([]);
    expect(
      positions(
        createEntitiesFromConfig(grid(2, 1), [{ ...definition, formation: { map: ["XXX"], minMembers: 2 } }], () => 0),
      ),
    ).toEqual(["0:0", "1:0"]);
  });

  it("skips members on cells taken by earlier definitions", () => {
    const boxes = [
      new Box(0, 0, { elevation: 1 }),
      new Box(0, 1, { elevation: 1 }),
      new Box(1, 0, { elevation: 2 }),
      new Box(1, 1, { elevation: 1 }),
    ];
    const entities = createEntitiesFromConfig(
      boxes,
      [
        {
          id: "statue",
          textureSource: "/assets/statue/block.svg",
          height: 1,
          spawnChance: 1,
          surface: "grass",
          surfaceElevation: 2,
        },
        { ...tree, spawnChance: 1, formation: { map: ["XX", "X."], minMembers: 2 } },
      ],
      () => 0,
    );

    expect(entities.map(({ type, x, y }) => `${type}@${x}:${y}`)).toEqual(["statue@1:0", "tree@0:0", "tree@0:1"]);
  });

  it("rotates each group around its anchor when rotation is enabled", () => {
    const entities = createEntitiesFromConfig(
      grid(3, 3),
      [{ ...tree, spawnChance: 0.5, formation: { map: ["XX", "X."], rotate: true } }],
      // Skip (0,0), (0,1), (0,2) and (1,0); spawn at (1,1) and turn it twice.
      sequence(1, 1, 1, 1, 0, 0.5),
    );

    expect(positions(entities)).toEqual(["1:1", "0:1", "1:0"]);
  });

  it("applies the gap between groups but not inside a group", () => {
    const entities = createEntitiesFromConfig(
      grid(6, 1),
      [{ ...tree, spawnChance: 1, gap: 1, formation: { map: ["XX"] } }],
      () => 0,
    );

    expect(positions(entities)).toEqual(["0:0", "1:0", "3:0", "4:0"]);
  });

  it("keeps multi-block members of one group from overlapping", () => {
    const entities = createEntitiesFromConfig(
      grid(4, 1, -1),
      [
        {
          id: "boat",
          textureSource: "/assets/boat/block_2.svg",
          height: 1,
          length: 2,
          spawnChance: 1,
          surface: "water",
          formation: { map: ["XX"], minMembers: 1 },
        },
      ],
      () => 0,
    );

    expect(positions(entities)).toEqual(["0:0", "2:0"]);
  });

  it("gives each member the elevation of its own column", () => {
    const entities = createEntitiesFromConfig(
      [new Box(0, 0, { elevation: 1 }), new Box(1, 0, { elevation: 2 })],
      [{ ...tree, spawnChance: 1, formation: { map: ["XX"] } }],
      () => 0,
    );

    expect(entities.map(({ elevation }) => elevation)).toEqual([1, 2]);
  });
});

describe("Entity and createEntitiesFromConfig", () => {
  it("exposes generic entity data without sharing metadata", () => {
    const entity = new Entity(
      2,
      3,
      {
        id: "statue",
        textureSource: "/assets/statue/block.svg",
        height: 3,
        length: 2,
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
    expect(entity.length).toBe(2);
    expect(entity.textureSource).toBe("/assets/statue/block.svg");
    expect(entity.id).toBe("statue@2,3");

    const data = entity.getData();
    data.metadata.tag = "changed";

    expect(entity.metadata).toEqual({});
  });

  it("keeps an explicit id, so restored entities keep their identity after moving", () => {
    const entity = new Entity(
      9,
      9,
      { id: "statue", textureSource: "/s.svg", height: 1, spawnChance: 1, surface: "grass" },
      0,
      { id: "statue@2,3" },
    );

    expect(entity.id).toBe("statue@2,3");
    expect(entity.getData().id).toBe("statue@2,3");
  });

  it("is deterministic without an explicit random source", () => {
    const boxes = Array.from({ length: 16 }, (_, index) => new Box(index % 4, Math.floor(index / 4), { elevation: 1 }));
    const definitions = [
      { id: "rock", textureSource: "/r.svg", height: 1, spawnChance: 0.5, surface: "grass" as const },
    ];
    const randomSpy = vi.spyOn(Math, "random");

    expect(createEntitiesFromConfig(boxes, definitions).map(({ id }) => id)).toEqual(
      createEntitiesFromConfig(boxes, definitions).map(({ id }) => id),
    );
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("gives every created entity a unique, reproducible id", () => {
    const boxes = Array.from({ length: 16 }, (_, index) => new Box(index % 4, Math.floor(index / 4), { elevation: 1 }));
    const definitions = [
      { id: "rock", textureSource: "/r.svg", height: 1, spawnChance: 0.5, surface: "grass" as const },
      { id: "tree", textureSource: "/t.svg", height: 2, spawnChance: 1, surface: "grass" as const },
    ];
    const roll = () => {
      let state = 0;
      return () => (state = (state + 0.37) % 1);
    };

    const first = createEntitiesFromConfig(boxes, definitions, roll()).map(({ id }) => id);
    const second = createEntitiesFromConfig(boxes, definitions, roll()).map(({ id }) => id);

    expect(first.length).toBeGreaterThan(1);
    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
  });

  it("restores an entity from its data, keeping identity, variation and metadata", () => {
    const original = new Entity(
      1,
      2,
      {
        id: "house",
        textureSource: "/h.svg",
        height: 2,
        length: 2,
        lengthAxis: "y",
        gap: 1,
        spawnChance: 1,
        surface: "grass",
        colorReplacements: { "#000000": ["#111111", "#222222"] },
      },
      3,
      { id: "house@0,0", colorVariant: 1 },
    );
    const data = { ...original.getData(), walkable: true, metadata: { hp: 5 } };

    const restored = Entity.fromData(4, 5, JSON.parse(JSON.stringify(data)) as typeof data);

    expect(restored.x).toBe(4);
    expect(restored.y).toBe(5);
    expect(restored.getData()).toEqual(data);
    expect(restored.colorVariant).toBe(1);
    expect(restored.walkable).toBe(true);
    data.metadata.hp = 0;
    expect(restored.metadata).toEqual({ hp: 5 });
  });

  it("assigns a seeded color variation only to entities with colorReplacements", () => {
    const boxes = Array.from({ length: 30 }, (_, index) => new Box(index, 0, { elevation: 1 }));
    const definitions = [
      {
        id: "house",
        textureSource: "/h.svg",
        height: 1,
        spawnChance: 1,
        surface: "grass" as const,
        colorReplacements: { "#000000": ["#1", "#2", "#3"] },
      },
    ];
    const plain = new Entity(
      0,
      0,
      { id: "rock", textureSource: "/r.svg", height: 1, spawnChance: 1, surface: "grass" },
      0,
      { colorVariant: 2 },
    );

    const variants = createEntitiesFromConfig(boxes, definitions).map(({ colorVariant }) => colorVariant);

    expect(new Set(variants).size).toBeGreaterThan(1);
    variants.forEach((variant) => expect([0, 1, 2]).toContain(variant));
    expect(createEntitiesFromConfig(boxes, definitions).map(({ colorVariant }) => colorVariant)).toEqual(variants);
    expect(plain.colorVariant).toBeUndefined();
    expect(plain.getData()).not.toHaveProperty("colorVariant");
  });

  it("preserves configured SVG color replacements", () => {
    const colorReplacements = { "#9f4b2f": "#245c4a" };
    const entity = new Entity(
      0,
      0,
      {
        id: "house",
        textureSource: "/assets/house/block.svg",
        height: 1,
        spawnChance: 1,
        surface: "grass",
        debug: true,
        colorReplacements,
      },
      0,
    );

    expect(entity.colorReplacements).toEqual(colorReplacements);
    expect(entity.debug).toBe(true);
    expect(entity.getData().colorReplacements).toEqual(colorReplacements);
    expect(entity.getData().debug).toBe(true);
  });

  it("creates configured entities only on their configured surface", () => {
    const boxes = [new Box(1, 2, { elevation: 3 }), new Box(4, 5, { elevation: -1 }), new Box(6, 7, { elevation: 0 })];

    const entities = createEntitiesFromConfig(
      boxes,
      [
        {
          id: "statue",
          textureSource: "/assets/statue/block.svg",
          height: 3,
          spawnChance: 1,
          surface: "grass",
        },
      ],
      () => 0,
    );

    expect(entities).toHaveLength(2);
    expect(entities.map((entity) => entity.getData())).toEqual([
      {
        id: "statue@1,2",
        type: "statue",
        walkable: false,
        elevation: 3,
        height: 3,
        length: 1,
        textureSource: "/assets/statue/block.svg",
        metadata: {},
      },
      {
        id: "statue@6,7",
        type: "statue",
        walkable: false,
        elevation: 0,
        height: 3,
        length: 1,
        textureSource: "/assets/statue/block.svg",
        metadata: {},
      },
    ]);
    expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["1:2", "6:7"]);
  });

  it("restricts entities to their configured surface elevation", () => {
    const entities = createEntitiesFromConfig(
      [new Box(1, 2, { elevation: 2 }), new Box(3, 4, { elevation: 3 }), new Box(5, 6, { elevation: 4 })],
      [
        {
          id: "house",
          textureSource: "/assets/house/block.svg",
          height: 1,
          spawnChance: 1,
          surface: "grass",
          surfaceElevation: 3,
        },
      ],
      () => 0,
    );

    expect(entities).toHaveLength(1);
    expect(entities[0].elevation).toBe(3);
  });

  it("accepts a list of valid surface elevations", () => {
    const entities = createEntitiesFromConfig(
      [2, 3, 4, 5].map((elevation, x) => new Box(x * 2, 0, { elevation })),
      [
        {
          id: "house",
          textureSource: "/assets/house/block.svg",
          height: 1,
          spawnChance: 1,
          surface: "grass",
          surfaceElevation: [3, 5],
        },
      ],
      () => 0,
    );

    expect(entities.map(({ elevation }) => elevation)).toEqual([3, 5]);
  });

  it("never spawns with an empty list of surface elevations", () => {
    expect(
      createEntitiesFromConfig(
        [new Box(0, 0, { elevation: 0 })],
        [
          {
            id: "house",
            textureSource: "/assets/house/block.svg",
            height: 1,
            spawnChance: 1,
            surface: "grass",
            surfaceElevation: [],
          },
        ],
        () => 0,
      ),
    ).toEqual([]);
  });

  it("keeps multi-block footprints flat without a surface elevation", () => {
    const definition = {
      id: "boat",
      textureSource: "/assets/boat/block_2.svg",
      height: 1,
      length: 2,
      spawnChance: 1,
      surface: "water" as const,
    };

    expect(
      createEntitiesFromConfig(
        [new Box(0, 0, { elevation: -1 }), new Box(1, 0, { elevation: -2 })],
        [definition],
        () => 0,
      ),
    ).toEqual([]);
    expect(
      createEntitiesFromConfig(
        [new Box(0, 0, { elevation: -2 }), new Box(1, 0, { elevation: -2 })],
        [definition],
        () => 0,
      ),
    ).toHaveLength(1);
  });

  it("keeps multi-block footprints flat when several elevations are valid", () => {
    const definition = {
      id: "hotel",
      textureSource: "/assets/building/block_hotel_1x2.svg",
      height: 4,
      length: 2,
      spawnChance: 1,
      surface: "grass" as const,
      surfaceElevation: [0, 1],
    };

    expect(
      createEntitiesFromConfig(
        [new Box(0, 0, { elevation: 0 }), new Box(1, 0, { elevation: 1 })],
        [definition],
        () => 0,
      ),
    ).toEqual([]);

    const flat = createEntitiesFromConfig(
      [new Box(0, 0, { elevation: 1 }), new Box(1, 0, { elevation: 1 })],
      [definition],
      () => 0,
    );
    expect(flat.map(({ x, y, elevation }) => `${x}:${y}@${elevation}`)).toEqual(["0:0@1"]);
  });

  it("uses the random result to skip eligible columns", () => {
    const boxes = [new Box(1, 2, { elevation: 1 })];

    expect(
      createEntitiesFromConfig(
        boxes,
        [
          {
            id: "tree",
            textureSource: "/assets/tree/block.svg",
            height: 2,
            length: 1,
            spawnChance: 0.5,
            surface: "grass",
          },
        ],
        () => 1,
      ),
    ).toEqual([]);
  });

  it("does not place different entity definitions on the same position", () => {
    const entities = createEntitiesFromConfig(
      [new Box(1, 2, { elevation: 1 }), new Box(3, 4, { elevation: 1 })],
      [
        {
          id: "tree",
          textureSource: "/assets/tree/block.svg",
          height: 1,
          spawnChance: 1,
          surface: "grass",
        },
        {
          id: "statue",
          textureSource: "/assets/statue/block.svg",
          height: 1,
          spawnChance: 1,
          surface: "grass",
        },
      ],
      () => 0,
    );

    expect(entities).toHaveLength(2);
    expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["1:2", "3:4"]);
    expect(entities.map(({ type }) => type)).toEqual(["tree", "tree"]);
  });

  it("reserves the configured length along its selected axis", () => {
    const entities = createEntitiesFromConfig(
      [new Box(2, 2, { elevation: -1 }), new Box(2, 3, { elevation: -1 }), new Box(3, 2, { elevation: -1 })],
      [
        {
          id: "boat",
          textureSource: "/assets/boat/block_2.svg",
          height: 1,
          length: 2,
          lengthAxis: "y",
          spawnChance: 1,
          surface: "water",
        },
      ],
      () => 0,
    );

    expect(entities).toHaveLength(1);
    expect(entities[0].x).toBe(2);
    expect(entities[0].y).toBe(2);
    expect(entities[0].lengthAxis).toBe("y");
  });

  it("keeps the configured gap between entities of the same type", () => {
    const entities = createEntitiesFromConfig(
      [new Box(0, 0, { elevation: 1 }), new Box(1, 0, { elevation: 1 }), new Box(2, 0, { elevation: 1 })],
      [
        {
          id: "house",
          textureSource: "/assets/house/block.svg",
          height: 1,
          gap: 1,
          spawnChance: 1,
          surface: "grass",
        },
      ],
      () => 0,
    );

    expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["0:0", "2:0"]);
  });

  it("treats diagonal neighbours as adjacent for the gap", () => {
    const entities = createEntitiesFromConfig(
      [new Box(0, 0, { elevation: 1 }), new Box(1, 1, { elevation: 1 }), new Box(2, 2, { elevation: 1 })],
      [
        {
          id: "house",
          textureSource: "/assets/house/block.svg",
          height: 1,
          gap: 1,
          spawnChance: 1,
          surface: "grass",
        },
      ],
      () => 0,
    );

    expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["0:0", "2:2"]);
  });

  it("measures the gap from the whole multi-block footprint", () => {
    const boxes = [0, 1, 2, 3, 4, 5].flatMap((x) => [0, 1, 2, 3].map((y) => new Box(x, y, { elevation: -1 })));
    const entities = createEntitiesFromConfig(
      boxes,
      [
        {
          id: "boat",
          textureSource: "/assets/boat/block_2.svg",
          height: 1,
          length: 2,
          lengthAxis: "y",
          gap: 2,
          spawnChance: 1,
          surface: "water",
        },
      ],
      () => 0,
    );

    expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["0:0", "3:0"]);
    expect(entities[0].gap).toBe(2);
    expect(entities[0].getData().gap).toBe(2);
  });

  it("does not apply the gap between different entity definitions", () => {
    const entities = createEntitiesFromConfig(
      [new Box(0, 0, { elevation: 1 }), new Box(1, 0, { elevation: 1 })],
      [
        {
          id: "house",
          textureSource: "/assets/house/block.svg",
          height: 1,
          gap: 1,
          spawnChance: 1,
          surface: "grass",
        },
        {
          id: "bush",
          textureSource: "/assets/bush/block.svg",
          height: 1,
          spawnChance: 1,
          surface: "grass",
        },
      ],
      () => 0,
    );

    expect(entities.map(({ type }) => type)).toEqual(["house", "bush"]);
  });

  it("ignores non-positive gaps", () => {
    const entities = createEntitiesFromConfig(
      [new Box(0, 0, { elevation: 1 }), new Box(1, 0, { elevation: 1 })],
      [
        {
          id: "house",
          textureSource: "/assets/house/block.svg",
          height: 1,
          gap: -1,
          spawnChance: 1,
          surface: "grass",
        },
      ],
      () => 0,
    );

    expect(entities).toHaveLength(2);
    expect(entities[0].gap).toBeUndefined();
  });

  it("keeps grass entities off sand and spawns sand entities only there", () => {
    const boxes = [
      new Box(0, 0, { elevation: -1 }),
      new Box(1, 0, { elevation: 0 }),
      new Box(2, 0, { elevation: 0 }),
      new Box(3, 0, { elevation: 0 }),
    ];
    const definition = {
      textureSource: "/assets/tree/block.svg",
      height: 1,
      spawnChance: 1,
    };

    expect(
      createEntitiesFromConfig(boxes, [{ ...definition, id: "tree", surface: "grass" }], () => 0).map(
        ({ x, y }) => `${x}:${y}`,
      ),
    ).toEqual(["2:0", "3:0"]);
    expect(
      createEntitiesFromConfig(boxes, [{ ...definition, id: "palm", surface: "sand" }], () => 0).map(
        ({ x, y }) => `${x}:${y}`,
      ),
    ).toEqual(["1:0"]);
  });

  describe("footprintSurfaces", () => {
    // y=0: 0  0  0  0
    // y=1: 0  0  0 -1   → (0,1) inland grass, (1,1) and (2,1) shore sand
    // y=2: 0 -1 -1 -1
    const shore = [
      [0, 0, 0, 0],
      [0, 0, 0, -1],
      [0, -1, -1, -1],
    ];
    const toBoxes = (rows: number[][], transpose = false) =>
      rows.flatMap((row, y) =>
        row.map((elevation, x) => (transpose ? new Box(y, x, { elevation }) : new Box(x, y, { elevation }))),
      );
    const pier = {
      id: "pier",
      textureSource: "/assets/pier/block_x.svg",
      height: 1,
      length: 3,
      spawnChance: 1,
      surface: "sand" as const,
      surfaceElevation: 0,
    };

    it("requires each footprint block to match its surface, in order", () => {
      expect(
        createEntitiesFromConfig(
          toBoxes(shore),
          [{ ...pier, footprintSurfaces: ["grass", "sand", "sand"] }],
          () => 0,
        ).map(({ x, y }) => `${x}:${y}`),
      ).toEqual(["0:1"]);
      expect(
        createEntitiesFromConfig(toBoxes(shore), [{ ...pier, footprintSurfaces: ["sand", "sand", "grass"] }], () => 0),
      ).toEqual([]);
    });

    it("follows the length axis", () => {
      expect(
        createEntitiesFromConfig(
          toBoxes(shore, true),
          [{ ...pier, lengthAxis: "y", footprintSurfaces: ["grass", "sand", "sand"] }],
          () => 0,
        ).map(({ x, y }) => `${x}:${y}`),
      ).toEqual(["1:0"]);
    });

    it("lets land-and-water footprints reach over water at a lower elevation", () => {
      // x=0 water (-1), x=1 shore sand (0), x=2 inland grass (0), on every row.
      const beach = [
        [-1, 0, 0, 0],
        [-1, 0, 0, 0],
        [-1, 0, 0, 0],
      ];
      const entities = createEntitiesFromConfig(
        toBoxes(beach),
        [{ ...pier, footprintSurfaces: ["water", "sand", "grass"] }],
        () => 0,
      );

      expect(entities.map(({ x, y }) => `${x}:${y}`)).toEqual(["0:0", "0:1", "0:2"]);
      // The entity stands at the land elevation, not at the water anchor's.
      entities.forEach(({ elevation }) => expect(elevation).toBe(0));
    });

    it("still requires the land blocks of a mixed footprint to be flat", () => {
      const steps = [
        [-1, 0, 1, 1],
        [-1, 0, 1, 1],
      ];

      expect(
        createEntitiesFromConfig(
          toBoxes(steps),
          [
            {
              ...pier,
              surfaceElevation: [0, 1],
              footprintSurfaces: ["water", "sand", "grass"],
            },
          ],
          () => 0,
        ),
      ).toEqual([]);
    });

    it("falls back to the definition surface for blocks it does not list", () => {
      expect(
        createEntitiesFromConfig(toBoxes(shore), [{ ...pier, footprintSurfaces: ["grass", "sand"] }], () => 0).map(
          ({ x, y }) => `${x}:${y}`,
        ),
      ).toEqual(["0:1"]);
    });
  });

  it("supports entities configured for water", () => {
    const entities = createEntitiesFromConfig(
      [new Box(1, 2, { elevation: -1 })],
      [
        {
          id: "buoy",
          textureSource: "/assets/buoy/block.svg",
          height: 1,
          length: 1,
          spawnChance: 1,
          surface: "water",
        },
      ],
      () => 0,
    );

    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe("buoy");
  });
});

describe("footprints and the entity index", () => {
  const pier = {
    id: "pier",
    textureSource: "/assets/pier/block.svg",
    height: 1,
    length: 3,
    lengthAxis: "y" as const,
    spawnChance: 1,
    surface: "grass" as const,
  };

  it("lists the footprint cells from the anchor along the axis", () => {
    expect(getFootprint({ x: 2, y: 3 })).toEqual([{ x: 2, y: 3 }]);
    expect(getFootprint({ x: 2, y: 3 }, 2)).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(getFootprint({ x: 2, y: 3 }, 2, "y")).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
    expect(getEntityFootprint(new Entity(1, 1, pier, 0))).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]);
  });

  it("indexes entities over their whole footprint", () => {
    const long = new Entity(1, 1, pier, 0);
    const rock = new Entity(5, 5, { ...pier, id: "rock", length: 1 }, 0);

    const index = indexEntities([long, rock]);

    expect(index.at(1, 3)).toEqual([long]);
    expect(index.at(5, 5)).toEqual([rock]);
    expect(index.isOccupied(2, 2)).toBe(false);
    expect(index.queryRadius(4, 4, 1)).toEqual([rock]);
  });
});
