import type { EntityDefinition, WorldCoord, WorldRect } from "../../types";
import { createEntitiesFromConfig, createPatchFields, getEntityFootprint } from "../entities";
import { CellMap, cellKey, type ReadonlyCellMap } from "../grid";
import { type PathGround, PATH_GROUND_TYPES, PATH_MAX_CLIMB, planPathNetwork } from "../paths";
import { type Box, createNoiseField, generateTerrainColumns } from "../terrain";

/** Whether column `(x, y)` is on a settlement path. */
export type SettlementPaths = (x: number, y: number) => boolean;

/** Options of {@link createSettlementPaths}. */
export type SettlementPathsOptions = {
  readonly seed: number;
  /** Entity definitions (game content): the ones with a `settlementLot` are the buildings the paths reach. */
  readonly entityDefinitions: readonly EntityDefinition[];
  /** Edge of a bounded world: paths never leave it. Defaults to none. */
  readonly clip?: WorldRect;
};

/** Regions whose paths are kept once planned, the most recent ones: a chunk asks its own region again and again. */
export const SETTLEMENT_PATH_REGIONS_KEPT = 16;
/** Sampling distance of the noise that makes paths meander, in columns. */
export const SETTLEMENT_PATH_WIGGLE_SCALE = 6;
/**
 * Offsets from the middle of a region's side, in order, tried for the column where a path leaves
 * it: the first one with open ground on both sides of the edge.
 */
const EXIT_OFFSETS = [0, 1, -1, 2, -2, 3, -3] as const;

/**
 * The paths of the settlements of a world: in each region of every `settlementLot.regionSize`, a
 * network (`planPathNetwork()`) from the middle of the region (its square) to the middle
 * of each of its four sides, and from the door of each building placed in its
 * lots to the nearest path. Where two regions meet, both pick the same pair of columns across
 * their edge (the first of {@link EXIT_OFFSETS} with open ground on both sides), so their paths join.
 *
 * Only settled regions have paths: those with a lot inside its `settlementLot.zone` (or with no
 * zone), told from the noise alone. A region leaves by the sides whose neighbour is settled too, so
 * a town's regions join and its edge has no paths running off into the country.
 *
 * A region is planned from the seed alone the first time a column of it is asked for: its terrain
 * (`generateTerrainColumns()`, one column past its edges) and its buildings
 * (`createEntitiesFromConfig()` with the settlement definitions, which always spawn), so every chunk
 * of a region sees the same paths whatever was generated before. The last
 * {@link SETTLEMENT_PATH_REGIONS_KEPT} regions are kept. Without settlement definitions there are no paths.
 */
export function createSettlementPaths({ seed, entityDefinitions, clip }: SettlementPathsOptions): SettlementPaths {
  const settlements = entityDefinitions.filter(({ settlementLot }) => settlementLot !== undefined);
  const sizes = [
    ...new Set(settlements.map(({ settlementLot }) => (settlementLot as { regionSize: number }).regionSize)),
  ];
  if (sizes.length === 0) return () => false;
  const wiggleField = createNoiseField(seed, "settlement-paths", { scale: SETTLEMENT_PATH_WIGGLE_SCALE });
  const wiggle = (x: number, y: number) => (wiggleField(x, y) + 1) / 2;
  const patchFields = createPatchFields(seed);
  /** Whether region `(rx, ry)` of `size` has a lot inside its zone. */
  const isSettled = (size: number, rx: number, ry: number): boolean =>
    settlements.some(({ settlementLot }) => {
      const { regionSize, offset, zone } = settlementLot as NonNullable<EntityDefinition["settlementLot"]>;
      return (
        regionSize === size &&
        (!zone || patchFields(zone.field, zone.scale)(rx * size + offset.x, ry * size + offset.y) < zone.below)
      );
    });

  const plan = (size: number, rx: number, ry: number): ReadonlyCellMap<true> => {
    if (!isSettled(size, rx, ry)) return new CellMap<true>();
    const region = { minX: rx * size, minY: ry * size, maxX: rx * size + size - 1, maxY: ry * size + size - 1 };
    const grown = { minX: region.minX - 1, minY: region.minY - 1, maxX: region.maxX + 1, maxY: region.maxY + 1 };
    const terrain = generateTerrainColumns(grown, { seed, clip });
    const columns = CellMap.from(terrain, (column) => column);
    const inside = terrain.filter(
      ({ x, y }) => x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY,
    );
    const buildings = createEntitiesFromConfig(
      inside,
      settlements.filter(({ settlementLot }) => settlementLot?.regionSize === size),
      () => 0,
      undefined,
      seed,
    );
    return planPathNetwork({
      area: region,
      columnAt: (x, y) => columns.get(x, y),
      hub: { x: region.minX + Math.floor(size / 2), y: region.minY + Math.floor(size / 2) },
      exits: findExits(region, columns, ({ x, y }) => isSettled(size, rx + x, ry + y)),
      sites: buildings.map(getEntityFootprint),
      wiggle,
    });
  };

  const networks = sizes.map((size) => {
    const regions = new Map<number, ReadonlyCellMap<true>>();
    return (x: number, y: number): boolean => {
      const rx = Math.floor(x / size);
      const ry = Math.floor(y / size);
      const key = cellKey(rx, ry);
      let network = regions.get(key);
      if (!network) {
        network = plan(size, rx, ry);
        regions.set(key, network);
        if (regions.size > SETTLEMENT_PATH_REGIONS_KEPT) regions.delete(regions.keys().next().value as number);
      }
      return network.has(x, y);
    };
  });
  return (x, y) => networks.some((onPath) => onPath(x, y));
}

/** Whether two columns can be the two ends of a path step. */
function canJoin(a: PathGround | undefined, b: PathGround | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    PATH_GROUND_TYPES.includes(a.type) &&
    PATH_GROUND_TYPES.includes(b.type) &&
    Math.abs(a.elevation - b.elevation) <= PATH_MAX_CLIMB
  );
}

/**
 * The column on each side of `region` (`+x`, `+y`, `−x`, `−y`) where its network leaves it: near the
 * middle of the side, with open ground on both sides of the edge (see {@link EXIT_OFFSETS}), on the
 * sides `leaves` accepts (given the side's outward step).
 */
function findExits(
  region: WorldRect,
  columns: ReadonlyCellMap<Box>,
  leaves: (out: WorldCoord) => boolean,
): WorldCoord[] {
  const midX = region.minX + Math.floor((region.maxX - region.minX + 1) / 2);
  const midY = region.minY + Math.floor((region.maxY - region.minY + 1) / 2);
  const sides = [
    { at: (offset: number) => ({ x: region.maxX, y: midY + offset }), out: { x: 1, y: 0 } },
    { at: (offset: number) => ({ x: midX + offset, y: region.maxY }), out: { x: 0, y: 1 } },
    { at: (offset: number) => ({ x: region.minX, y: midY + offset }), out: { x: -1, y: 0 } },
    { at: (offset: number) => ({ x: midX + offset, y: region.minY }), out: { x: 0, y: -1 } },
  ];
  const exits: WorldCoord[] = [];
  for (const { at, out } of sides) {
    if (!leaves(out)) continue;
    for (const offset of EXIT_OFFSETS) {
      const exit = at(offset);
      if (canJoin(columns.get(exit.x, exit.y), columns.get(exit.x + out.x, exit.y + out.y))) {
        exits.push(exit);
        break;
      }
    }
  }
  return exits;
}
