import { describe, expect, it } from "vitest";
import { ENTITY_CONFIG } from "./config";

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
  it("uses unique entity ids", () => {
    const ids = ENTITY_CONFIG.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ENTITY_CONFIG.map((definition) => [definition.id, definition] as const))(
    "matches the data-tiles footprint of %s",
    (_, definition) => {
      const [assetX, assetY, assetZ] = readTiles(definition.textureSource);
      const length = definition.length ?? 1;
      // The engine's x axis runs up-right on screen, the asset's y axis down-left:
      // engine "x" pairs with a 1xN asset and engine "y" with an Nx1 asset.
      const engineAxisAsset = (definition.lengthAxis ?? "x") === "x"
        ? [1, length]
        : [length, 1];

      expect([assetX, assetY]).toEqual(engineAxisAsset);
      if (assetZ > 1) expect(definition.height).toBe(assetZ);
    },
  );

  it.each(
    ENTITY_CONFIG
      .filter(({ colorReplacements }) => colorReplacements !== undefined)
      .map((definition) => [definition.id, definition] as const),
  )("only replaces colours present in the assets sharing the map of %s", (_, definition) => {
    // A map may be shared by several assets (e.g. the 1- and 2-storey houses);
    // each source colour must exist in at least one of them.
    const svg = ENTITY_CONFIG
      .filter(({ colorReplacements }) => colorReplacements === definition.colorReplacements)
      .map(({ textureSource }) => readSvg(textureSource))
      .join("\n");
    const replacements = Object.entries(definition.colorReplacements ?? {});
    const variantCounts = new Set(replacements.map(([, target]) =>
      typeof target === "string" ? 1 : target.length,
    ));

    expect(replacements.filter(([source]) => !svg.includes(`"${source.toLowerCase()}"`)))
      .toEqual([]);
    expect(variantCounts.size).toBe(1);
  });

  it("recolours the roofs of the multi-storey buildings", () => {
    const recoloured = ENTITY_CONFIG
      .filter(({ colorReplacements }) => colorReplacements !== undefined)
      .map(({ id }) => id);

    expect(recoloured).toEqual(expect.arrayContaining([
      "house_balcony",
      "tower",
      "apartments_x",
      "apartments_y",
    ]));
  });

  it("declares the two-block-tall tree variants", () => {
    const tallTrees = ENTITY_CONFIG.filter(({ textureSource }) =>
      textureSource.startsWith("/assets/tree/") && readTiles(textureSource)[2] === 2,
    );

    expect(tallTrees.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "tree_3",
      "tree_7",
      "tree_8",
    ]));
    tallTrees.forEach(({ height }) => expect(height).toBe(2));
  });

  it("declares multi-storey houses and buildings", () => {
    const tall = ENTITY_CONFIG.filter(({ textureSource }) =>
      /\/(house|building)\//.test(textureSource) && readTiles(textureSource)[2] >= 2,
    );

    expect(tall.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "house_2x1",
      "house_balcony",
      "tower",
      "apartments_x",
      "apartments_y",
    ]));
    expect(tall.filter(({ textureSource }) => readTiles(textureSource)[2] >= 3))
      .toHaveLength(3);
  });
});
