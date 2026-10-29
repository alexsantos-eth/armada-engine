import type { BoxType, WorldCoord, WorldRect } from "../../types";
import { CellMap, type ReadonlyCellMap } from "../grid";
import { findPath, PATH_STEPS } from "./astar";

/** What a path needs to know of a terrain column. */
export type PathGround = { readonly elevation: number; readonly type: BoxType };

/** Surfaces a path can be laid on: land with nothing built on it (no water, no beach). */
export const PATH_GROUND_TYPES: readonly BoxType[] = ["grass", "ground"];
/** Highest step between two columns of a path, in blocks: what the player climbs. */
export const PATH_MAX_CLIMB = 1;
/** Cost of a step onto open ground. */
export const PATH_STEP_COST = 1;
/** Extra cost per block climbed or descended: paths prefer to follow the contour. */
export const PATH_CLIMB_COST = 3;
/** Cost of a step along a path already laid, so new paths join the network instead of running beside it. */
export const PATH_REUSE_COST = 0.3;
/** Extra cost of a step onto a column next to the network (but not on it): no paths two columns wide. */
export const PATH_BESIDE_COST = 1.5;
/** Most a column's `wiggle` adds to a step onto it: what makes paths meander. */
export const PATH_WIGGLE_COST = 1;
/** How far from the wanted hub (in columns, ring by ring) the network looks for ground to start from. */
export const PATH_HUB_RADIUS = 6;

/** One network of {@link planPathNetwork}. */
export type PathNetworkOptions = {
  /** Columns the paths may cross. */
  readonly area: WorldRect;
  /** The terrain column at a position, if any. */
  readonly columnAt: (x: number, y: number) => PathGround | undefined;
  /** Where the network starts (a square, a crossroads): the nearest open ground to it. */
  readonly hub: WorldCoord;
  /** Columns the network reaches from the hub, in order (where it leaves the area). */
  readonly exits: readonly WorldCoord[];
  /** Footprints of the buildings the network reaches, in order; paths never cross them. */
  readonly sites: readonly (readonly WorldCoord[])[];
  /** How much a column makes a path turn away from it, in `[0, 1]` (smooth noise). Defaults to none. */
  readonly wiggle?: (x: number, y: number) => number;
};

const NO_WIGGLE = () => 0;

/**
 * Lays a network of paths one column wide (A*, {@link findPath}): from the open ground nearest
 * `hub`, a path to each of `exits`, then one from the door of each building in `sites` (any
 * open column beside its footprint) to the nearest path. Paths only cross {@link PATH_GROUND_TYPES},
 * never a building, and climb at most {@link PATH_MAX_CLIMB} per step. Steps cost more uphill and
 * where `wiggle` is high, and less along a path already laid, so later paths join earlier ones in
 * corners and tees instead of running beside them. A target that cannot be reached is left out.
 *
 * Deterministic: the same terrain and options always give the same network. Returns its columns
 * (empty when there is no open ground near the hub).
 */
export function planPathNetwork({
  area,
  columnAt,
  hub,
  exits,
  sites,
  wiggle = NO_WIGGLE,
}: PathNetworkOptions): ReadonlyCellMap<true> {
  // The terrain of the area, read once into arrays: a search asks for each column many times.
  const height = area.maxY - area.minY + 1;
  const size = (area.maxX - area.minX + 1) * height;
  const indexOf = (x: number, y: number) => (x - area.minX) * height + (y - area.minY);
  const inside = (x: number, y: number) => x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;
  const elevation = new Float64Array(size);
  const openGround = new Uint8Array(size);
  const turns = new Float64Array(size);
  for (let x = area.minX; x <= area.maxX; x += 1) {
    for (let y = area.minY; y <= area.maxY; y += 1) {
      const column = columnAt(x, y);
      if (!column || !PATH_GROUND_TYPES.includes(column.type)) continue;
      const index = indexOf(x, y);
      openGround[index] = 1;
      elevation[index] = column.elevation;
      turns[index] = PATH_WIGGLE_COST * wiggle(x, y);
    }
  }
  sites.forEach((site) =>
    site.forEach(({ x, y }) => {
      if (inside(x, y)) openGround[indexOf(x, y)] = 0;
    }),
  );
  const laid = new Uint8Array(size);
  const network = new CellMap<true>();

  const open = (x: number, y: number) => inside(x, y) && openGround[indexOf(x, y)] === 1;
  const onNetwork = (x: number, y: number) => inside(x, y) && laid[indexOf(x, y)] === 1;
  const beside = (x: number, y: number) => PATH_STEPS.some((step) => onNetwork(x + step.x, y + step.y));
  // `findPath()` only asks for steps between columns of the area.
  const cost = (fromX: number, fromY: number, toX: number, toY: number): number => {
    const to = indexOf(toX, toY);
    if (openGround[to] === 0) return Infinity;
    const climb = Math.abs(elevation[to] - elevation[indexOf(fromX, fromY)]);
    if (climb > PATH_MAX_CLIMB) return Infinity;
    if (laid[to] === 1) return PATH_REUSE_COST;
    return PATH_STEP_COST + PATH_CLIMB_COST * climb + turns[to] + (beside(toX, toY) ? PATH_BESIDE_COST : 0);
  };
  const lay = (path: readonly WorldCoord[] | undefined) =>
    path?.forEach(({ x, y }) => {
      laid[indexOf(x, y)] = 1;
      network.set(x, y, true);
    });

  const start = findOpenGround(hub, open);
  if (!start) return network;
  lay([start]);

  for (const exit of exits) {
    lay(
      findPath({
        area,
        starts: [start],
        isGoal: (x, y) => x === exit.x && y === exit.y,
        cost,
        heuristic: (x, y) => PATH_REUSE_COST * (Math.abs(exit.x - x) + Math.abs(exit.y - y)),
      }),
    );
  }

  for (const site of sites) {
    const doors: WorldCoord[] = [];
    site.forEach(({ x, y }) =>
      PATH_STEPS.forEach((step) => {
        const door = { x: x + step.x, y: y + step.y };
        if (open(door.x, door.y)) doors.push(door);
      }),
    );
    lay(findPath({ area, starts: doors, isGoal: onNetwork, cost }));
  }
  return network;
}

/** The open column nearest `centre`, ring by ring up to {@link PATH_HUB_RADIUS}, in a fixed order. */
function findOpenGround(centre: WorldCoord, open: (x: number, y: number) => boolean): WorldCoord | undefined {
  for (let radius = 0; radius <= PATH_HUB_RADIUS; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (open(centre.x + dx, centre.y + dy)) return { x: centre.x + dx, y: centre.y + dy };
      }
    }
  }
  return undefined;
}
