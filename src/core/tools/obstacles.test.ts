import { describe, expect, it } from "vitest";
import { getObstacleCellsFromObstacle, generateObstacle, generateObstacles } from "./obstacles";
import type { GameObstacle } from "../types/entities";
import { TEST_MODE } from "../modes/test";
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
      const obs = generateObstacle(template, 10, 10, [], [], [], 1, TEST_MODE);
      expect(obs).not.toBeNull();
      expect(obs?.obstacleId).toBe(1);
    });

    it("should fail when board is too small", () => {
      const template = { width: 5, height: 5, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const obs = generateObstacle(template, 2, 2, [], [], [], 1, TEST_MODE);
      expect(obs).toBeNull();
    });

    it("should fallback to sequential search and then fail if occupied", () => {
      const template = { width: 1, height: 1, obstacleId: -1, coords: [0, 0] as [number,number],  };
      const ship = { coords: [0, 0] as [number,number], width: 1, height: 1, shipId: 0, };
      const obs = generateObstacle(template, 1, 1, [ship], [], [], 1, TEST_MODE);
      expect(obs).toBeNull();
    });
  });

  describe("generateObstacles", () => {
    it("should generate all requested obstacles", () => {
      const config = { obstacleCounts: { rock: 1 } };
      const mockGameMode = {
        ...TEST_MODE,
        obstacles: [
          { id: "rock", width: 1, height: 1, name: "Rock" }
        ]
      } as unknown as GameMode;

      const obstacles = generateObstacles(config, [], [], mockGameMode);
      expect(obstacles).toHaveLength(1);
      // GenerateObstacles uses 'templateId' internally for mapping? Wait, game entities don't always have templateId. Actually, let's just check length.
    });
  });
});
