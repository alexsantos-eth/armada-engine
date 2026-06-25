import { describe, expect, it, vi } from "vitest";
import { getObstacleCellsFromObstacle, generateObstacle, generateObstacles } from "./obstacles";
import type { GameObstacle } from "../types/entities";
import { CLASSIC_MODE } from "../modes/classic";
import type { GameMode } from "../types/modes";

describe("obstacles", () => {
  describe("getObstacleCellsFromObstacle", () => {
    it("should get cells correctly", () => {
      const obs: GameObstacle = { coords: [1, 1], width: 2, height: 2, obstacleId: 0,  };
      const cells = getObstacleCellsFromObstacle(obs);
      expect(cells).toEqual([
        [1, 1], [2, 1], [1, 2], [2, 2]
      ]);
    });
  });

  describe("generateObstacle", () => {
    it("should generate valid obstacle", () => {
      const template = { width: 1, height: 1, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const obs = generateObstacle(template, 10, 10, [], [], [], 1, CLASSIC_MODE);
      expect(obs).not.toBeNull();
      expect(obs?.obstacleId).toBe(1);
    });

    it("should respect existing items and obstacles", () => {
      const template = { width: 1, height: 1, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const existingItem = { coords: [0, 0] as [number,number], part: 1, itemId: 0 };
      const existingObstacle = { coords: [1, 0] as [number,number], width: 1, height: 1, obstacleId: 0 };
      
      const obs = generateObstacle(
        template, 2, 1, [], [existingItem], [existingObstacle], 1, CLASSIC_MODE
      );
      // Since board is 2x1 and both [0,0] and [1,0] are occupied, it should fail
      expect(obs).toBeNull();
    });

    it("should fail when board is too small", () => {
      const template = { width: 5, height: 5, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const obs = generateObstacle(template, 2, 2, [], [], [], 1, CLASSIC_MODE);
      expect(obs).toBeNull();
    });

    it("should fallback to sequential search and then fail if occupied", () => {
      const template = { width: 1, height: 1, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const ship = { coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0, };
      const obs = generateObstacle(template, 1, 1, [ship], [], [], 1, CLASSIC_MODE);
      expect(obs).toBeNull();
    });

    it("should fallback to sequential search and succeed if a spot is found", () => {
      const template = { width: 1, height: 1, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const ship = { coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0, };

      // Mock random to always try to place at 0,0 which is occupied
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

      // The sequential search for obstacles checks borders first.
      // On a 3x3 board with a 1x1 obstacle, the borders are:
      // (0,0), (1,0), (2,0), (0,2), (1,2), (2,2), (0,1), (2,1)
      // Since (0,0) is occupied by ship, it will find another border spot.
      const obs = generateObstacle(template, 3, 3, [ship], [], [], 1, CLASSIC_MODE);
      expect(obs).not.toBeNull();
      
      randomSpy.mockRestore();
    });
  });

  describe("generateObstacles", () => {
    it("should generate all requested obstacles", () => {
      const config = { obstacleCounts: { rock: 1 } };
      const mockGameMode = {
        ...CLASSIC_MODE,
        obstacles: [
          { id: "rock", width: 1, height: 1, name: "Rock" }
        ]
      } as unknown as GameMode;

      const obstacles = generateObstacles(config, [], [], mockGameMode);
      expect(obstacles).toHaveLength(1);
      // GenerateObstacles uses 'templateId' internally for mapping? Wait, game entities don't always have templateId. Actually, let's just check length.
    });
    it("should use defaultCounts if config.obstacleCounts is undefined", () => {
      const config = {};
      const mockGameMode = {
        ...CLASSIC_MODE,
        defaultCounts: {
          obstacleCounts: { rock: 1 }
        },
        obstacles: [
          { id: "rock", width: 1, height: 1, name: "Rock" }
        ]
      } as unknown as GameMode;

      const obstacles = generateObstacles(config, [], [], mockGameMode);
      expect(obstacles).toHaveLength(1);
    });

    it("should skip unknown templates", () => {
      const config = { obstacleCounts: { unknown: 1 } };
      const obstacles = generateObstacles(config, [], [], CLASSIC_MODE);
      expect(obstacles).toHaveLength(0);
    });

    it("should skip obstacle if generateObstacle returns null", () => {
      const config = {
        obstacleCounts: { rock: 1 },
        boardView: { width: 1, height: 1 }
      };
      const mockGameMode = {
        ...CLASSIC_MODE,
        obstacles: [
          { id: "rock", width: 5, height: 5, name: "Rock" } // Too large
        ]
      } as unknown as GameMode;
      const obstacles = generateObstacles(config, [], [], mockGameMode);
      expect(obstacles).toHaveLength(0);
    });
  });
});
