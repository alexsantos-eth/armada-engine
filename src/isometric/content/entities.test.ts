import { describe, expect, it } from "vitest";
import { parseFormationMap, resolveFormation, validateEntityDefinitions } from "../core/engine";
import { createEntitiesFromConfig } from "../core/engine/entities";
import { Box } from "../core/engine/terrain";
import { ENTITY_CONFIG, TREE_TRUNK_COLLISION } from "./entities";

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

  it("places houses and civic services at fixed lots in each neighborhood", () => {
    const ids = ["house", "house_2x1", "house_balcony", "hospital", "restaurant", "market", "townhall"];
    const buildings = ENTITY_CONFIG.filter(({ id }) => ids.includes(id));
    const lots = buildings.map(({ settlementLot }) => settlementLot);

    expect(buildings.map(({ id }) => id)).toEqual(ids);
    expect(lots.every((lot) => lot?.regionSize === 128)).toBe(true);
    expect(new Set(lots.map((lot) => `${lot?.offset.x}:${lot?.offset.y}`)).size).toBe(ids.length);
    expect(buildings.every(({ spawnChance }) => spawnChance === 1)).toBe(true);
  });

  it("generates all neighborhood structures and keeps their route cross open", () => {
    const columns = Array.from({ length: 128 }, (_, x) =>
      Array.from({ length: 128 }, (__, y) => new Box(x, y, { elevation: 1 })),
    ).flat();
    const settlementDefinitions = ENTITY_CONFIG.filter(({ settlementLot }) => settlementLot !== undefined);
    const buildings = createEntitiesFromConfig(columns, settlementDefinitions, () => 0);

    expect(buildings.map(({ id }) => id)).toEqual([
      "house@24,24",
      "house_2x1@88,24",
      "house_balcony@24,88",
      "hospital@88,88",
      "restaurant@24,52",
      "market@88,52",
      "townhall@52,24",
    ]);
    expect(buildings.every(({ x, y }) => !(x >= 60 && x < 68) && !(y >= 60 && y < 68))).toBe(true);
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
