import { describe, expect, it } from "vitest";
import { parseFormationMap, resolveFormation, validateEntityDefinitions } from "../core/engine";
import { createEntitiesFromConfig, createPatchFields, getEntityFootprint } from "../core/engine/entities";
import { createSeededChunkSource } from "../core/engine/world";
import { Box } from "../core/engine/terrain";
import { ENTITY_CONFIG, SETTLEMENT_ZONE, TREE_TRUNK_COLLISION } from "./entities";

const ASSET_SOURCES = import.meta.glob<string>("/public/assets/**/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

function readSvg(textureSource: string): string {
  const svg = ASSET_SOURCES[`/public${textureSource}`];
  if (svg === undefined) throw new Error(`Missing asset ${textureSource}`);
  return svg.toLowerCase();
}

function readTiles(textureSource: string): [number, number, number] {
  const svg = readSvg(textureSource);
  const match = /data-tiles="(\d+)x(\d+)(?:x(\d+))?"/.exec(svg);
  if (!match) return [1, 1, 1];
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 1)];
}

describe("ENTITY_CONFIG", () => {
  it("passes the engine's content validation", () => {
    expect(() => validateEntityDefinitions(ENTITY_CONFIG)).not.toThrow();
  });

  it("gives every reflection SVG its sprite's footprint, width and canvas top, grown only downward", () => {
    const reflected = ENTITY_CONFIG.filter(({ reflectionSource }) => reflectionSource !== undefined);
    expect(reflected.map(({ id }) => id).sort()).toEqual(["boat", "pier_x_reverse", "pier_y_reverse"]);
    const viewBox = (svg: string) => (/viewbox="([^"]+)"/.exec(svg) as RegExpExecArray)[1].split(" ").map(Number);
    reflected.forEach(({ textureSource, reflectionSource = "" }) => {
      const [x, top, width, height] = viewBox(readSvg(textureSource));
      const [mirrorX, mirrorTop, mirrorWidth, mirrorHeight] = viewBox(readSvg(reflectionSource));
      expect(readTiles(reflectionSource)).toEqual(readTiles(textureSource));
      expect([mirrorX, mirrorTop, mirrorWidth]).toEqual([x, top, width]);
      expect(mirrorHeight).toBeGreaterThan(height);
    });
  });

  it("blocks only the trunk of every tree, the same for all", () => {
    const trees = ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/tree/"));
    expect(trees.length).toBeGreaterThan(0);
    trees.forEach((tree) => expect(tree.collision).toBe(TREE_TRUNK_COLLISION));
    expect(TREE_TRUNK_COLLISION).toBeGreaterThan(0);
    expect(TREE_TRUNK_COLLISION).toBeLessThan(0.5);
  });

  it("lets the player walk over the end of every pier that stands on the grass", () => {
    const piers = ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/pier/"));
    expect(piers.length).toBeGreaterThan(0);
    piers.forEach(({ footprintSurfaces = [], collision, contactShadow }) => {
      expect(contactShadow).toBe(false);
      const sizes = footprintSurfaces.map((_, index) => (typeof collision === "object" ? (collision[index] ?? 1) : 1));
      footprintSurfaces.forEach((surface, index) => expect(sizes[index]).toBe(surface === "grass" ? 0 : 1));
    });
  });

  it("blocks the whole block of every house", () => {
    ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/house/")).forEach(({ collision }) =>
      expect(collision ?? 1).toBe(1),
    );
  });

  it("uses unique entity ids", () => {
    const ids = ENTITY_CONFIG.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps small ground clutter as grass variants instead of separate entities", () => {
    expect(ENTITY_CONFIG.some(({ id }) => ["wildflowers", "pebbles", "mushrooms", "fallen_leaves"].includes(id))).toBe(
      false,
    );
  });

  it("adds three distinct large rock entities with blocking footprints", () => {
    const rocks = ENTITY_CONFIG.filter(({ id }) => ["large_rock", "large_rock_2", "large_rock_3"].includes(id));
    const ground = Array.from({ length: 20 }, (_, x) =>
      Array.from({ length: 20 }, (_, y) => new Box(x, y, { elevation: 0, type: "grass" as const })),
    ).flat();

    expect(rocks.map(({ id }) => id)).toEqual(["large_rock", "large_rock_2", "large_rock_3"]);
    expect(new Set(rocks.map(({ textureSource }) => textureSource)).size).toBe(3);
    rocks.forEach((rock) => {
      expect(readSvg(rock.textureSource)).toContain('id="figure"');
      expect(rock.height).toBe(1);
      expect(rock.collision).toBeGreaterThan(0.5);
      expect(rock.spawnChance).toBeGreaterThan(0);
      expect(rock.spawnChance).toBeLessThan(0.01);
      expect(createEntitiesFromConfig(ground, [rock], () => 0).length).toBeGreaterThan(0);
    });
  });

  it("places houses and civic services at fixed lots in each neighborhood", () => {
    const ids = ["house", "house_2x1", "house_balcony", "hospital", "restaurant", "market", "townhall"];
    const buildings = ENTITY_CONFIG.filter(({ id }) => ids.includes(id));
    const lots = buildings.map(({ settlementLot }) => settlementLot);

    expect(buildings.map(({ id }) => id)).toEqual(ids);
    expect(lots.every((lot) => lot?.regionSize === 32)).toBe(true);
    expect(new Set(lots.map((lot) => `${lot?.offset.x}:${lot?.offset.y}`)).size).toBe(ids.length);
    expect(buildings.every(({ spawnChance }) => spawnChance === 1)).toBe(true);
  });

  it("generates all neighborhood structures of a settled region", () => {
    const columns = Array.from({ length: 32 }, (_, x) =>
      Array.from({ length: 32 }, (__, y) => new Box(x, y, { elevation: 1 })),
    ).flat();
    const settlementDefinitions = ENTITY_CONFIG.filter(
      ({ settlementLot }) => settlementLot?.zone === SETTLEMENT_ZONE,
    ).map((definition) => ({ ...definition, settlementLot: { ...definition.settlementLot!, zone: undefined } }));
    const buildings = createEntitiesFromConfig(columns, settlementDefinitions, () => 0);

    expect(buildings.map(({ id }) => id)).toEqual([
      "house@6,6",
      "house@12,6",
      "house@6,12",
      "house_2x1@24,6",
      "house_2x1@24,12",
      "house_balcony@6,24",
      "house_balcony@12,24",
      "hospital@24,24",
      "restaurant@6,16",
      "market@24,16",
      "townhall@16,6",
    ]);
  });

  it("clusters tall buildings in rare urban clearings instead of scattering them across grass", () => {
    const tall = ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/building/")).filter(
      ({ height }) => height >= 3,
    );
    expect(tall).toHaveLength(8);
    expect(tall.every(({ settlementLot }) => settlementLot?.regionSize === 32)).toBe(true);
    expect(tall.every(({ settlementLot }) => (settlementLot?.zone?.below ?? 0) < SETTLEMENT_ZONE.below)).toBe(true);
    expect(new Set(tall.map(({ settlementLot }) => `${settlementLot?.offset.x}:${settlementLot?.offset.y}`)).size).toBe(
      tall.length,
    );
  });

  it("places tall buildings beside paths in a sampled world", () => {
    const source = createSeededChunkSource({ seed: 1337, entityDefinitions: ENTITY_CONFIG });
    const chunks = Array.from({ length: 10 }, (_, ix) => ix - 5).flatMap((cx) =>
      Array.from({ length: 10 }, (_, iy) => source.generate({ cx, cy: iy - 5 })),
    );
    const tall = new Set([
      "tower",
      "apartments_x",
      "apartments_y",
      "skyscraper",
      "hotel_x",
      "hotel_y",
      "office_x",
      "office_y",
    ]);
    const landmarks = chunks.flatMap(({ entities }) => entities).filter(({ type }) => tall.has(type));
    const paths = new Set(
      chunks.flatMap(({ columns }) => columns.filter(({ type }) => type === "path").map(({ x, y }) => `${x}:${y}`)),
    );
    expect(landmarks.length).toBeGreaterThan(0);
    expect(
      landmarks.some((building) =>
        getEntityFootprint(building).some(({ x, y }) =>
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => paths.has(`${x + dx}:${y + dy}`)),
        ),
      ),
    ).toBe(true);
  }, 15_000);

  it("builds the neighbourhoods in the clearings of the forests' noise", () => {
    const forest = ENTITY_CONFIG.find(({ id }) => id === "tree")?.patches;
    const buildings = ENTITY_CONFIG.filter(({ settlementLot }) => settlementLot?.zone === SETTLEMENT_ZONE);
    const source = createSeededChunkSource({ seed: 1337, entityDefinitions: ENTITY_CONFIG });
    const field = createPatchFields(1337)(SETTLEMENT_ZONE.field, SETTLEMENT_ZONE.scale);
    const ids = new Set(buildings.map(({ id }) => id));
    const placed = [-2, -1, 0, 1]
      .flatMap((cx) => [-2, -1, 0, 1].map((cy) => source.generate({ cx, cy }).entities))
      .flat()
      .filter(({ type }) => ids.has(type));

    expect({ field: SETTLEMENT_ZONE.field, scale: SETTLEMENT_ZONE.scale }).toEqual({
      field: forest?.field,
      scale: forest?.scale,
    });
    expect(SETTLEMENT_ZONE.below).toBeLessThan(forest?.threshold ?? -1);
    expect(buildings).toHaveLength(7);
    expect(placed.length).toBeGreaterThan(3);
    expect(
      placed.every(
        ({ x, y }) => field(Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16) < SETTLEMENT_ZONE.below,
      ),
    ).toBe(true);
  });

  it("connects every building of a neighbourhood to the paths of its settlement", () => {
    const source = createSeededChunkSource({ seed: 1337, entityDefinitions: ENTITY_CONFIG });
    const chunks = [0, 1, 2, 3].flatMap((cx) => [0, 1, 2, 3].map((cy) => source.generate({ cx, cy })));
    const types = new Map(chunks.flatMap(({ columns }) => columns.map(({ x, y, type }) => [x * 1000 + y, type])));
    const settlementIds = new Set(
      ENTITY_CONFIG.filter(({ settlementLot }) => settlementLot !== undefined).map(({ id }) => id),
    );
    const buildings = chunks.flatMap(({ entities }) => entities).filter(({ type }) => settlementIds.has(type));
    const doors = (x: number, y: number) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => types.get((x + dx) * 1000 + y + dy) === "path");

    expect(buildings.length).toBeGreaterThan(3);
    buildings.forEach((building) =>
      expect(
        getEntityFootprint(building).some(({ x, y }) => doors(x, y)),
        building.id,
      ).toBe(true),
    );
  });

  it.each(ENTITY_CONFIG.map((definition) => [definition.id, definition] as const))(
    "matches the data-tiles footprint of %s",
    (_, definition) => {
      const [assetX, assetY, assetZ] = readTiles(definition.textureSource);
      const length = definition.length ?? 1;
      // The engine's x axis runs up-right on screen, the asset's y axis down-left:
      // engine "x" pairs with a 1xN asset and engine "y" with an Nx1 asset.
      const engineAxisAsset = (definition.lengthAxis ?? "x") === "x" ? [1, length] : [length, 1];

      expect([assetX, assetY]).toEqual(engineAxisAsset);
      if (assetZ > 1) expect(definition.height).toBe(assetZ);
    },
  );

  it.each(
    ENTITY_CONFIG.filter(({ colorReplacements }) => colorReplacements !== undefined).map(
      (definition) => [definition.id, definition] as const,
    ),
  )("only replaces colours present in the assets sharing the map of %s", (_, definition) => {
    // A map may be shared by several assets (e.g. the 1- and 2-storey houses);
    // each source colour must exist in at least one of them.
    const svg = ENTITY_CONFIG.filter(({ colorReplacements }) => colorReplacements === definition.colorReplacements)
      .map(({ textureSource }) => readSvg(textureSource))
      .join("\n");
    const replacements = Object.entries(definition.colorReplacements ?? {});
    const variantCounts = new Set(replacements.map(([, target]) => (typeof target === "string" ? 1 : target.length)));

    expect(replacements.filter(([source]) => !svg.includes(`"${source.toLowerCase()}"`))).toEqual([]);
    expect(variantCounts.size).toBe(1);
  });

  it("recolours the roofs of the multi-storey buildings", () => {
    const recoloured = ENTITY_CONFIG.filter(({ colorReplacements }) => colorReplacements !== undefined).map(
      ({ id }) => id,
    );

    expect(recoloured).toEqual(
      expect.arrayContaining([
        "skyscraper",
        "hotel_x",
        "office_y",
        "house_balcony",
        "tower",
        "apartments_x",
        "apartments_y",
      ]),
    );
  });

  // Content rule: no tree is shorter than two blocks.
  it("keeps every tree at least two blocks tall", () => {
    const trees = ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/tree/"));

    expect(trees.length).toBeGreaterThan(0);
    trees.forEach(({ height, textureSource }) => {
      expect(readTiles(textureSource)[2]).toBeGreaterThanOrEqual(2);
      expect(height).toBe(readTiles(textureSource)[2]);
    });
  });

  // Trees sway subtly: only the canopy, above the cut, moves 1–2 world pixels at most.
  it("sways every tree, and only the trees, subtly", () => {
    ENTITY_CONFIG.forEach(({ textureSource, sway }) => {
      if (!textureSource.startsWith("/assets/tree/")) {
        expect(sway).toBeUndefined();
        return;
      }
      expect(sway).toBeDefined();
      expect(sway?.cut).toBeGreaterThan(0.5);
      expect(sway?.amplitude).toBeGreaterThanOrEqual(1);
      expect(sway?.amplitude).toBeLessThanOrEqual(2);
    });
  });

  it("declares the large buildings between four and six blocks tall", () => {
    const large = ENTITY_CONFIG.filter(({ textureSource }) => {
      const height = readTiles(textureSource)[2];
      return textureSource.startsWith("/assets/building/") && height >= 4 && height <= 6;
    });

    expect(large.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["skyscraper", "hotel_x", "hotel_y", "office_x", "office_y"]),
    );
    large.forEach(({ colorReplacements, gap }) => {
      expect(colorReplacements).toBeDefined();
      expect(gap).toBeGreaterThanOrEqual(2);
    });
  });

  it("lists at most one surface per footprint block", () => {
    ENTITY_CONFIG.forEach(({ footprintSurfaces, length }) => {
      expect((footprintSurfaces ?? []).length).toBeLessThanOrEqual(length ?? 1);
    });
  });

  // Piers reach from the shore into the water: water at the anchor, then sand, then grass.
  // The opposite orientation (grass at the anchor) is temporarily disabled.
  it("declares a pier over the water on both axes", () => {
    const piers = ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/pier/"));

    expect(
      piers.map(({ lengthAxis, footprintSurfaces }) => `${lengthAxis}:${footprintSurfaces?.join(",")}`).sort(),
    ).toEqual(["x:water,sand,grass", "y:water,sand,grass"]);
    piers.forEach(({ length }) => expect(length).toBe(3));
  });

  it("declares multi-storey houses and buildings", () => {
    const tall = ENTITY_CONFIG.filter(
      ({ textureSource }) => /\/(house|building)\//.test(textureSource) && readTiles(textureSource)[2] >= 2,
    );

    expect(tall.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["house_2x1", "house_balcony", "tower", "apartments_x", "apartments_y"]),
    );
    expect(tall.filter(({ textureSource }) => readTiles(textureSource)[2] === 3)).toHaveLength(3);
  });

  it.each(
    ENTITY_CONFIG.filter(({ formation }) => formation !== undefined).map(
      (definition) => [definition.id, definition] as const,
    ),
  )("declares a valid formation map for %s", (_, definition) => {
    expect(() => resolveFormation(definition.formation)).not.toThrow();
  });

  it("grows every tree, and only the trees, in the same forests", () => {
    const forests = ENTITY_CONFIG.filter(({ patches }) => patches !== undefined);

    expect(forests.map(({ id }) => id)).toEqual(
      ENTITY_CONFIG.filter(({ textureSource }) => textureSource.startsWith("/assets/tree/")).map(({ id }) => id),
    );
    expect(new Set(forests.map(({ patches }) => patches)).size).toBe(1);
    expect(forests[0].patches?.outside).toBeGreaterThanOrEqual(0.1);
  });

  it("groups the pine, cypress and birch in groves of three", () => {
    const groves = ENTITY_CONFIG.filter(({ formation }) => formation !== undefined);

    expect(groves.map(({ id }) => id)).toEqual(expect.arrayContaining(["tree_3", "tree_7", "tree_8"]));
    groves
      .filter(({ id }) => ["tree_3", "tree_7", "tree_8"].includes(id))
      .forEach(({ formation }) => {
        expect(parseFormationMap(formation?.map ?? [])).toHaveLength(3);
        expect(formation?.rotate).toBe(true);
      });
  });
});
