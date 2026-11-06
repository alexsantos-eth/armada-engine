import { describe, expect, it, vi } from "vitest";
import type { EntityDefinition, WorldRect } from "../../types";
import { createEntitiesFromConfig, createPatchFields, getEntityFootprint } from "../entities";
import { CellMap } from "../grid";
import { PATH_STEPS } from "../paths";
import * as terrain from "../terrain";
import { generateTerrainColumns } from "../terrain";
import { createSettlementPaths, SETTLEMENT_PATH_REGIONS_KEPT } from "./settlement-paths";

const HOUSE: EntityDefinition = {
  id: "house",
  textureSource: "/assets/house/block.svg",
  height: 1,
  spawnChance: 1,
  surface: "grass",
  settlementLot: { regionSize: 64, offset: { x: 12, y: 12 }, reservedPathWidth: 4 },
};
const SHOP: EntityDefinition = {
  ...HOUSE,
  id: "shop",
  length: 2,
  settlementLot: { regionSize: 64, offset: { x: 44, y: 14 }, reservedPathWidth: 4 },
};
const TREE: EntityDefinition = { ...HOUSE, id: "tree", settlementLot: undefined, spawnChance: 0.1 };
const SETTLEMENT = [HOUSE, SHOP, TREE];
const SEED = 21;

const cellsIn = (onPath: (x: number, y: number) => boolean, rect: WorldRect) => {
  const cells: { x: number; y: number }[] = [];
  for (let x = rect.minX; x <= rect.maxX; x += 1) {
    for (let y = rect.minY; y <= rect.maxY; y += 1) if (onPath(x, y)) cells.push({ x, y });
  }
  return cells;
};
const REGION = { minX: 0, minY: 0, maxX: 63, maxY: 63 };

describe("createSettlementPaths", () => {
  it("has no paths without settlement definitions", () => {
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: [TREE] });
    expect(cellsIn(paths, { minX: 0, minY: 0, maxX: 70, maxY: 70 })).toEqual([]);
  });

  it("lays paths only in the regions with a lot in its zone, and leaves them only towards settled ones", () => {
    const zone = { field: "towns", scale: 40, below: 0 };
    const zoned = [HOUSE, SHOP].map((definition) => ({
      ...definition,
      settlementLot: { ...definition.settlementLot!, zone },
    }));
    const field = createPatchFields(SEED)(zone.field, zone.scale);
    const settled = (rx: number, ry: number) => field(rx * 64 + 32, ry * 64 + 32) < 0;
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: zoned });
    const regions = [-3, -2, -1, 0, 1, 2].flatMap((rx) => [-3, -2, -1, 0, 1, 2].map((ry) => ({ rx, ry })));
    const rectOf = ({ rx, ry }: { rx: number; ry: number }) => ({
      minX: rx * 64,
      minY: ry * 64,
      maxX: rx * 64 + 63,
      maxY: ry * 64 + 63,
    });

    expect(regions.some(({ rx, ry }) => settled(rx, ry))).toBe(true);
    expect(regions.some(({ rx, ry }) => !settled(rx, ry))).toBe(true);
    regions.forEach((region) => {
      const cells = cellsIn(paths, rectOf(region));
      if (!settled(region.rx, region.ry)) expect(cells).toEqual([]);
      else expect(cells.length).toBeGreaterThan(0);
      // A path on the region's edge always continues into a settled neighbour.
      cells.forEach(({ x, y }) => {
        const rect = rectOf(region);
        if (x === rect.maxX && paths(x + 1, y)) expect(settled(region.rx + 1, region.ry)).toBe(true);
        if (x === rect.minX && paths(x - 1, y)) expect(settled(region.rx - 1, region.ry)).toBe(true);
      });
    });
  });

  it("lays one network per region, on open land, from its middle", () => {
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT });
    const cells = cellsIn(paths, REGION);
    const columns = CellMap.from(generateTerrainColumns(REGION, { seed: SEED }), (column) => column);

    expect(cells.length).toBeGreaterThan(40);
    expect(cells.every(({ x, y }) => ["grass", "ground"].includes(columns.get(x, y)?.type as string))).toBe(true);
    // Every column of the network but its ends touches another one.
    const touching = cells.filter(({ x, y }) => PATH_STEPS.some((step) => paths(x + step.x, y + step.y)));
    expect(touching).toHaveLength(cells.length);
  });

  it("reaches the door of every building placed in the region's lots", () => {
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT });
    const buildings = createEntitiesFromConfig(generateTerrainColumns(REGION, { seed: SEED }), [HOUSE, SHOP], () => 0);

    expect(buildings.length).toBeGreaterThan(0);
    buildings.forEach((building) => {
      const footprint = getEntityFootprint(building);
      expect(footprint.some(({ x, y }) => paths(x, y))).toBe(false);
      expect(footprint.some(({ x, y }) => PATH_STEPS.some((step) => paths(x + step.x, y + step.y)))).toBe(true);
    });
  });

  it("joins the networks of neighbouring regions across their edges", () => {
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT });
    let joins = 0;
    for (let offset = 0; offset < 64 * 4; offset += 1) {
      // Along the edges between regions: x = 63|64 and y = 63|64, and the ones beyond.
      const along = (offset % 64) + 64 * Math.floor(offset / 128);
      const vertical = offset % 128 < 64;
      const [a, b] = vertical ? [paths(63, along), paths(64, along)] : [paths(along, 63), paths(along, 64)];
      if (a && b) joins += 1;
    }
    expect(joins).toBeGreaterThan(0);
  });

  it("plans each region once while it is kept, and again once it is forgotten", () => {
    const generate = vi.spyOn(terrain, "generateTerrainColumns");
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT });
    const first = cellsIn(paths, REGION);
    cellsIn(paths, REGION);
    expect(generate).toHaveBeenCalledTimes(1);
    for (let region = 1; region <= SETTLEMENT_PATH_REGIONS_KEPT; region += 1) paths(region * 64, 0);
    expect(generate).toHaveBeenCalledTimes(SETTLEMENT_PATH_REGIONS_KEPT + 1);
    expect(cellsIn(paths, REGION)).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(SETTLEMENT_PATH_REGIONS_KEPT + 2);
    generate.mockRestore();
  });

  it("is the same for every instance of one seed, and differs between seeds", () => {
    const area = { minX: -64, minY: -64, maxX: 63, maxY: 63 };
    const a = cellsIn(createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT }), area);
    expect(cellsIn(createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT }), area)).toEqual(a);
    expect(cellsIn(createSettlementPaths({ seed: SEED + 1, entityDefinitions: SETTLEMENT }), area)).not.toEqual(a);
  });

  it("keeps paths inside a bounded world", () => {
    const clip = { minX: 0, minY: 0, maxX: 40, maxY: 40 };
    const paths = createSettlementPaths({ seed: SEED, entityDefinitions: SETTLEMENT, clip });
    expect(cellsIn(paths, REGION).every(({ x, y }) => x <= 40 && y <= 40)).toBe(true);
  });

  it("lays the networks of every region size", () => {
    const small = { ...HOUSE, id: "hut", settlementLot: { regionSize: 16, offset: { x: 3, y: 3 } } };
    const both = createSettlementPaths({ seed: SEED, entityDefinitions: [HOUSE, small] });
    const large = createSettlementPaths({ seed: SEED, entityDefinitions: [HOUSE] });
    const only = createSettlementPaths({ seed: SEED, entityDefinitions: [small] });
    const area = { minX: 0, minY: 0, maxX: 63, maxY: 63 };
    expect(cellsIn(both, area)).toEqual(cellsIn((x, y) => large(x, y) || only(x, y), area));
  });
});
