import { describe, expect, it } from "vitest";
import catalog from "../../../content/entities.v2.json";
import type { EntityDefinition } from "../../types";
import { EntityCatalogV2Error, exportEntityCatalogV2, validateEntityCatalogV2 } from "./catalog-v2";

const single: EntityDefinition = {
  id: "tree",
  textureSource: "/assets/tree/block.svg",
  height: 2,
  spawnChance: 0.1,
  surface: "grass",
};

describe("version 2 entity catalog", () => {
  it("contains the migrated visual and physical data for all current entities", () => {
    const valid = validateEntityCatalogV2(catalog);
    expect(valid.entities).toHaveLength(31);
    expect(valid.entities.find(({ id }) => id === "pier_x_reverse")).toMatchObject({
      shape: { length: 3, axis: "x", collision: [1, 1, 0] },
      placement: { surfaces: ["water", "sand", "grass"] },
    });
  });

  it("converts the old content once without preserving its spawn algorithm", () => {
    const converted = exportEntityCatalogV2([
      single,
      {
        ...single,
        id: "pier",
        length: 3,
        lengthAxis: "y",
        footprintSurfaces: ["water", "sand", "grass"],
        collision: [1, 0.5],
        reflectionSource: "/assets/pier/reflection.svg",
        colorReplacements: { "#000000": ["#ffffff"] },
        sway: { cut: 0.5, amplitude: 1, period: 1000 },
        contactShadow: false,
      },
      { ...single, id: "rock", collision: 0.25 },
    ]);

    expect(converted.entities[0]).toEqual({
      id: "tree",
      asset: { sprite: "/assets/tree/block.svg" },
      shape: { height: 2, length: 1, axis: "x", collision: [1] },
      placement: { surfaces: ["grass"] },
    });
    expect(converted.entities[1]).toMatchObject({
      asset: { reflection: "/assets/pier/reflection.svg", contactShadow: false },
      shape: { length: 3, axis: "y", collision: [1, 0.5, 1] },
      placement: { surfaces: ["water", "sand", "grass"] },
    });
    expect(converted.entities[2].shape.collision).toEqual([0.25]);
    expect(validateEntityCatalogV2(converted)).toEqual(converted);
    expect("spawnChance" in converted.entities[0]).toBe(false);
  });

  it.each([
    [null, "catalog must be an object"],
    [{ schemaVersion: 2, entities: [] }, "schemaVersion must be 1"],
    [{ schemaVersion: 1, entities: null }, "entities must be an array"],
    [{ schemaVersion: 1, entities: [null] }, "must be an object"],
  ])("rejects malformed catalog %o", (value, issue) => {
    expect(() => validateEntityCatalogV2(value)).toThrow(issue);
  });

  it.each([
    [
      (entry: Record<string, unknown>) => {
        entry.id = "";
      },
      "id must be a nonempty string",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.asset = null;
      },
      "asset.sprite must be an absolute SVG path",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.asset = { sprite: "relative.png" };
      },
      "asset.sprite must be an absolute SVG path",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.asset = { sprite: "/ok.svg", reflection: 3 };
      },
      "asset.reflection must be an absolute SVG path",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = null;
      },
      "shape must be an object",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = { height: 0, length: 1, axis: "x", collision: [1] };
      },
      "shape.height must be a positive integer",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = { height: 1, length: 0, axis: "x", collision: [] };
      },
      "shape.length must be a positive integer",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = { height: 1, length: 1, axis: "z", collision: [1] };
      },
      "shape.axis must be x or y",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = { height: 1, length: 1, axis: "x", collision: null };
      },
      "shape.collision must have one size",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = { height: 1, length: 2, axis: "x", collision: [1] };
      },
      "shape.collision must have one size",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.shape = { height: 1, length: 1, axis: "x", collision: [-1] };
      },
      "shape.collision must have one size",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.placement = null;
      },
      "placement.surfaces must have one known surface",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.placement = { surfaces: null };
      },
      "placement.surfaces must have one known surface",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.placement = { surfaces: [] };
      },
      "placement.surfaces must have one known surface",
    ],
    [
      (entry: Record<string, unknown>) => {
        entry.placement = { surfaces: ["lava"] };
      },
      "placement.surfaces must have one known surface",
    ],
  ] as const)("rejects invalid entity data: %s", (mutate, issue) => {
    const value: { schemaVersion: number; entities: Record<string, unknown>[] } = {
      schemaVersion: 1,
      entities: [
        {
          id: "test",
          asset: { sprite: "/ok.svg" },
          shape: { height: 1, length: 1, axis: "x", collision: [1] },
          placement: { surfaces: ["grass"] },
        },
      ],
    };
    mutate(value.entities[0]);
    expect(() => validateEntityCatalogV2(value)).toThrow(issue);
  });

  it("reports duplicate ids alongside other errors", () => {
    const duplicate = { ...catalog, entities: [catalog.entities[0], catalog.entities[0]] };
    try {
      validateEntityCatalogV2(duplicate);
    } catch (error) {
      expect(error).toBeInstanceOf(EntityCatalogV2Error);
      expect((error as EntityCatalogV2Error).issues).toContain("pier_x_reverse: id is declared more than once");
    }
  });
});
