import { describe, expect, it, vi } from "vitest";
import { getShip2DCells, getShipCellsFromShip, generateShips, generateShip, generateShip2D, generateRandomPosition, findFreeShipPosition, getShipSize, getQuadrantPreferences } from "./ships";
import type { GameShip } from "../types/entities";
import { CLASSIC_MODE } from "../modes/classic";
import type { GameMode } from "../types/modes";
import type { BoardViewConfig } from "../types/config";

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


  describe("findFreeShipPosition", () => {
    it("should return preferred if it fits", () => {
      const pos = findFreeShipPosition(1, 1, [], [], 10, 10, [5, 5]);
      expect(pos).toEqual([5, 5]);
    });

    it("should consider shotCells and avoid them", () => {
      const pos = findFreeShipPosition(1, 1, [], [{ x: 0, y: 0 }], 2, 2, [0, 0]);
      // 0,0 is preferred but occupied by shot. Should fallback to 1,0.
      expect(pos).toEqual([1, 0]);
    });

    it("should consider existingShips and avoid them", () => {
      const existing = [{ coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0 }];
      const pos = findFreeShipPosition(1, 1, existing, [], 2, 2, [0, 0]);
      // 0,0 is preferred but occupied by ship. Should fallback to 1,0.
      expect(pos).toEqual([1, 0]);
    });

    it("should ignore preferred position if out of bounds", () => {
      // Preferred position [-1, -1] is out of bounds, should fallback to [0, 0]
      const pos1 = findFreeShipPosition(1, 1, [], [], 2, 2, [-1, 0]);
      expect(pos1).toEqual([0, 0]);

      // Preferred position [0, -1] is out of bounds on Y, should fallback to [0, 0]
      const pos2 = findFreeShipPosition(1, 1, [], [], 2, 2, [0, -1]);
      expect(pos2).toEqual([0, 0]);
    });

    it("should return null if no spots fit", () => {
      const pos = findFreeShipPosition(2, 2, [], [], 1, 1);
      expect(pos).toBeNull();
    });
  });

  describe("getShipSize", () => {
    it("should return width * height", () => {
      expect(getShipSize({ coords: [0, 0], width: 3, height: 2, shipId: 0 })).toBe(6);
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
      ...CLASSIC_MODE,
      constants: {
        ...CLASSIC_MODE.constants,
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

    it("should fallback to sequential search and succeed if a spot is found", () => {
      const template = { width: 1, height: 1, shipId: -1, coords: [0,0] as [number,number] };
      const existing = [{ coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0, }];
      
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

      // On a 3x1 board, existing ship at 0,0. Min distance is 1, so 1,0 is occupied. 2,0 is free.
      // Random will try 0,0 (occupied) and fail maxAttempts times. 
      // Then it will scan from 0,0 sequentially and find 2,0.
      const ship = generateShip(template, 3, 1, existing, mockGameMode);
      expect(ship).not.toBeNull();
      expect(ship?.coords).toEqual([1, 0]);

      randomSpy.mockRestore();
    });

    it("should fallback to sequential search and succeed for non-square ship", () => {
      const template = { width: 2, height: 1, shipId: -1, coords: [0,0] as [number,number] };
      const existing = [{ coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0, }];
      
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

      // On a 4x1 board, existing ship at 0,0. Min distance is 1, so 1,0 is occupied. 2,0 is free. 
      // The 2x1 ship can fit at [2, 0].
      const ship = generateShip(template, 4, 1, existing, mockGameMode);
      expect(ship).not.toBeNull();
      expect(ship?.coords).toEqual([1, 0]);
      expect(ship?.width).toBe(2);

      randomSpy.mockRestore();
    });
  });

  describe("generateShip2D", () => {
    const mockGameMode = {
      ...CLASSIC_MODE,
      constants: {
        ...CLASSIC_MODE.constants,
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
        ...CLASSIC_MODE,
        ships: [
          { id: "small", width: 2, height: 1, name: "Small" },
          { id: "large", width: 3, height: 2, name: "Large" }
        ],
        constants: {
          ...CLASSIC_MODE.constants,
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

    it("should use default 0 if config.shipCounts is undefined", () => {
      const config = {};
      const mockGameMode = {
        ...CLASSIC_MODE,
        ships: [
          { id: "small", width: 2, height: 1, name: "Small" }
        ],
        constants: {
          ...CLASSIC_MODE.constants,
          SHIPS: {
            MAX_PLACEMENT_ATTEMPTS: 1,
            MIN_DISTANCE: 1,
          }
        }
      } as unknown as GameMode;

      const ships = generateShips(config, mockGameMode);
      expect(ships).toHaveLength(0);
    });

    it("should skip unknown templates", () => {
      const config = { shipCounts: { unknown: 1 } };
      const ships = generateShips(config, CLASSIC_MODE);
      expect(ships).toHaveLength(0);
    });

    it("should skip ship if generateShip returns null", () => {
      const config = {
        shipCounts: { small: 1 },
        boardView: { width: 1, height: 1 } as unknown as BoardViewConfig
      };
      const mockGameMode = {
        ...CLASSIC_MODE,
        ships: [
          { id: "small", width: 5, height: 5, name: "Small" } // Too large
        ]
      } as unknown as GameMode;
      const ships = generateShips(config, mockGameMode);
      expect(ships).toHaveLength(0);
    });
  });

  describe("getQuadrantPreferences", () => {
    it("should return correct preferences based on total cells", () => {
      expect(getQuadrantPreferences(2)).toEqual([[0, 1], [2, 3]]);
      expect(getQuadrantPreferences(3)).toEqual([[1, 2], [0, 3]]);
      expect(getQuadrantPreferences(4)).toEqual([[0, 2], [1, 3]]);
      expect(getQuadrantPreferences(5)).toEqual([[0, 1, 2, 3]]);
    });
  });
});
