import { describe, expect, it } from "vitest";
import { getShip2DCells, getShipCellsFromShip, generateShips, generateShip, generateShip2D, generateRandomPosition } from "./ships";
import type { GameShip } from "../types/entities";
import { TEST_MODE } from "../modes/test";
import type { GameMode } from "../types/modes";

describe("ships", () => {
  describe("getShip2DCells", () => {
    it("should get cells for 2x3 ship", () => {
      const cells = getShip2DCells(1, 1, 2, 3);
      expect(cells).toEqual([
        [1, 1], [2, 1],
        [1, 2], [2, 2],
        [1, 3], [2, 3]
      ]);
    });
  });

  describe("getShipCellsFromShip", () => {
    it("should get cells from GameShip", () => {
      const ship: GameShip = { coords: [0, 0], width: 1, height: 2, shipId: 0, };
      const cells = getShipCellsFromShip(ship);
      expect(cells).toEqual([[0, 0], [0, 1]]);
    });
  });



  describe("generateRandomPosition", () => {
    it("should generate horizontal position", () => {
      const pos = generateRandomPosition(2, "horizontal", 10, 10);
      expect(pos[0]).toBeLessThanOrEqual(8);
      expect(pos[1]).toBeLessThanOrEqual(9);
    });

    it("should generate vertical position", () => {
      const pos = generateRandomPosition(2, "vertical", 10, 10);
      expect(pos[0]).toBeLessThanOrEqual(9);
      expect(pos[1]).toBeLessThanOrEqual(8);
    });
  });

  describe("generateShip", () => {
    const mockGameMode = {
      ...TEST_MODE,
      constants: {
        ...TEST_MODE.constants,
        SHIPS: {
          MAX_PLACEMENT_ATTEMPTS: 2,
          MIN_DISTANCE: 1, // 1 cell padding between ships
        }
      }
    } as unknown as GameMode;

    it("should generate valid ship", () => {
      const template = { width: 2, height: 2, shipId: -1, coords: [0,0] as [number,number] };
      const ship = generateShip(template, 10, 10, [], mockGameMode);
      expect(ship).not.toBeNull();
    });

    it("should fail when board is too small", () => {
      const template = { width: 5, height: 5, shipId: -1, coords: [0,0] as [number,number] };
      const ship = generateShip(template, 2, 2, [], mockGameMode);
      expect(ship).toBeNull();
    });

    it("should fail when board is fully occupied", () => {
      const template = { width: 2, height: 2, shipId: -1, coords: [0,0] as [number,number] };
      // 2x2 board, with a 1x1 ship at 0,0, meaning space is too tight with min distance
      const existing = [{ coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0, }];
      const ship = generateShip(template, 2, 2, existing, mockGameMode);
      expect(ship).toBeNull();
    });
  });

  describe("generateShip2D", () => {
    const mockGameMode = {
      ...TEST_MODE,
      constants: {
        ...TEST_MODE.constants,
        SHIPS: {
          MAX_PLACEMENT_ATTEMPTS: 2,
          MIN_DISTANCE: 1, // 1 cell padding between ships
        }
      }
    } as unknown as GameMode;

    it("should generate valid ship 2D", () => {
      const ship = generateShip2D(2, 2, 10, 10, [], mockGameMode);
      expect(ship).not.toBeNull();
      expect(ship?.width).toBe(2);
    });

    it("should fail when board is too small", () => {
      const ship = generateShip2D(5, 5, 2, 2, [], mockGameMode);
      expect(ship).toBeNull();
    });
  });

  describe("generateShips", () => {
    it("should generate all requested ships and sort templates by size", () => {
      const config = { shipCounts: { small: 2, large: 1 } };
      const mockGameMode = {
        ...TEST_MODE,
        ships: [
          { id: "small", width: 2, height: 1, name: "Small" },
          { id: "large", width: 3, height: 2, name: "Large" }
        ],
        constants: {
          ...TEST_MODE.constants,
          SHIPS: {
            MAX_PLACEMENT_ATTEMPTS: 100,
            MIN_DISTANCE: 1,
          }
        }
      } as unknown as GameMode;

      const ships = generateShips(config, mockGameMode);
      expect(ships).toHaveLength(3);
      // Large should be generated first because it's 3x2=6 area, small is 2x1=2 area.
      expect(ships[0].width * ships[0].height).toBe(6);
      expect(ships[2].width * ships[2].height).toBe(2);
    });
  });
});
