import { describe, expect, it } from "vitest";
import type { BoxType, WorldCoord } from "../../types";
import type { ReadonlyCellMap } from "../grid";
import { type PathGround, PATH_HUB_RADIUS, planPathNetwork } from "./network";

const AREA = { minX: 0, minY: 0, maxX: 19, maxY: 19 };

/** A 20 × 20 map from rows of characters, `y` = 0 first: `.` grass, `,` ground, `~` water, `s` sand, digits raise grass. */
function terrain(rows: readonly string[]): (x: number, y: number) => PathGround | undefined {
  return (x, y) => {
    const char = rows[y]?.[x];
    if (char === undefined) return undefined;
    const types: Record<string, BoxType> = { ".": "grass", ",": "ground", "~": "water", s: "sand" };
    return /\d/.test(char) ? { type: "grass", elevation: Number(char) } : { type: types[char], elevation: 0 };
  };
}

const OPEN = Array.from({ length: 20 }, () => ".".repeat(20));
const cells = (network: ReadonlyCellMap<true>) => {
  const list: WorldCoord[] = [];
  network.forEach((_, x, y) => list.push({ x, y }));
  return list;
};
const has = (network: ReadonlyCellMap<true>, x: number, y: number) => network.has(x, y);

describe("planPathNetwork", () => {
  it("lays a straight path from the hub to an exit on open ground", () => {
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(OPEN),
      hub: { x: 10, y: 10 },
      exits: [{ x: 19, y: 10 }],
      sites: [],
    });
    expect(cells(network)).toHaveLength(10);
    for (let x = 10; x <= 19; x += 1) expect(has(network, x, 10)).toBe(true);
  });

  it("joins every building's door to the network, never crossing a building", () => {
    const house = [
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(OPEN),
      hub: { x: 10, y: 10 },
      exits: [{ x: 10, y: 0 }],
      sites: [house],
    });
    expect(house.some(({ x, y }) => has(network, x, y))).toBe(false);
    const doors = [
      { x: 6, y: 4 },
      { x: 4, y: 5 },
      { x: 5, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ];
    expect(doors.some(({ x, y }) => has(network, x, y))).toBe(true);
    // The branch ends on the trunk at x = 10, one column wide.
    expect(cells(network).filter(({ y }) => y === 10)).toHaveLength(1);
  });

  it("joins later paths to earlier ones instead of running beside them", () => {
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(OPEN),
      hub: { x: 10, y: 10 },
      exits: [
        { x: 19, y: 10 },
        { x: 19, y: 11 },
      ],
      sites: [],
    });
    // The second exit branches off the first trunk next to it.
    expect(cells(network)).toHaveLength(11);
  });

  it("never crosses water, sand or a cliff", () => {
    const rows = OPEN.map((row, y) => (y === 5 ? "~~~~~~~~~~~~~~~~~~~." : y === 6 ? "sssssss333333333333." : row));
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(rows),
      hub: { x: 10, y: 15 },
      exits: [{ x: 10, y: 0 }],
      sites: [],
    });
    expect(has(network, 10, 0)).toBe(true);
    // The only way: up onto the 3s is a cliff and the beach and the water are closed, so through x = 19.
    expect(cells(network).filter(({ y }) => y === 5)).toEqual([{ x: 19, y: 5 }]);
    expect(cells(network).filter(({ y }) => y === 6)).toEqual([{ x: 19, y: 6 }]);
  });

  it("climbs one level at a time on bare ground too", () => {
    const rows = OPEN.map((row, y) => (y < 5 ? "1".repeat(20) : y === 5 ? ",".repeat(20) : row));
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(rows),
      hub: { x: 10, y: 10 },
      exits: [{ x: 10, y: 0 }],
      sites: [],
    });
    for (let y = 0; y <= 10; y += 1) expect(has(network, 10, y)).toBe(true);
  });

  it("meanders away from where the wiggle is high", () => {
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(OPEN),
      hub: { x: 0, y: 10 },
      exits: [{ x: 19, y: 10 }],
      sites: [],
      wiggle: (x, y) => (y === 10 && x > 3 && x < 16 ? 1 : 0),
    });
    expect(has(network, 10, 10)).toBe(false);
  });

  it("starts from the open ground nearest the hub, and leaves out what cannot be reached", () => {
    const rows = OPEN.map((row, y) => (y >= 8 && y <= 12 ? ".......~~~~~~......." : row));
    const network = planPathNetwork({
      area: AREA,
      columnAt: terrain(rows),
      hub: { x: 10, y: 10 },
      exits: [
        { x: 10, y: 19 },
        { x: 25, y: 10 },
      ],
      sites: [[{ x: 3, y: 3 }]],
    });
    expect(has(network, 10, 10)).toBe(false);
    expect(has(network, 10, 19)).toBe(true);
    expect(has(network, 3, 3)).toBe(false);
    // A building whose doors are all closed is left out.
    const walled = planPathNetwork({
      area: AREA,
      columnAt: terrain(
        OPEN.map((row, y) => (y === 0 ? ".~................." : y === 1 ? "~~.................." : row)),
      ),
      hub: { x: 10, y: 10 },
      exits: [],
      sites: [[{ x: 0, y: 0 }], [{ x: 30, y: 30 }]],
    });
    expect(cells(walled)).toEqual([{ x: 10, y: 10 }]);
  });

  it("is empty when there is no open ground near the hub", () => {
    const water = Array.from({ length: 20 }, () => "~".repeat(20));
    expect(
      planPathNetwork({ area: AREA, columnAt: terrain(water), hub: { x: 10, y: 10 }, exits: [], sites: [] }).size,
    ).toBe(0);
    const far = OPEN.map((row, y) => (Math.abs(y - 10) <= PATH_HUB_RADIUS ? "~".repeat(20) : row));
    expect(
      planPathNetwork({ area: AREA, columnAt: terrain(far), hub: { x: 10, y: 10 }, exits: [], sites: [] }).size,
    ).toBe(0);
  });

  it("gives the same network for the same terrain", () => {
    const plan = () =>
      cells(
        planPathNetwork({
          area: AREA,
          columnAt: terrain(OPEN),
          hub: { x: 9, y: 9 },
          exits: [
            { x: 0, y: 9 },
            { x: 19, y: 9 },
            { x: 9, y: 0 },
          ],
          sites: [
            [{ x: 3, y: 15 }],
            [
              { x: 15, y: 3 },
              { x: 15, y: 4 },
            ],
          ],
          wiggle: (x, y) => Math.abs(Math.sin(x * 1.3 + y * 0.7)),
        }),
      );
    expect(plan()).toEqual(plan());
  });
});
