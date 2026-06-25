import { describe, expect, it, vi } from "vitest";
import { getItemCells, generateItem, equalizeItemCounts, generateItems } from "./items";
import type { GameItem, GameShip } from "../types/entities";
import { CLASSIC_MODE } from "../modes/classic";
import type { GameMode } from "../types/modes";
import type { BoardViewConfig } from "../types/config";

describe("items", () => {
  it("should get item cells correctly", () => {
    const item: GameItem = { coords: [1, 1], part: 3, itemId: 1 };
    expect(getItemCells(item)).toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  describe("equalizeItemCounts", () => {
    it("should equalize by removing excess items based on templateId", () => {
      const boardA: GameItem[] = [
        { templateId: "health", itemId: 1, part: 1, coords: [0, 0] },
        { templateId: "health", itemId: 2, part: 1, coords: [0, 0] },
        { templateId: "radar", itemId: 3, part: 1, coords: [0, 0] },
      ];
      const boardB: GameItem[] = [
        { templateId: "health", itemId: 4, part: 1, coords: [1, 1] },
        { templateId: "health", itemId: 6, part: 1, coords: [2, 2] },
        { templateId: "nuke", itemId: 5, part: 1, coords: [1, 1] },
      ];

      const [resA, resB] = equalizeItemCounts(boardA, boardB);
      
      expect(resA.length).toBe(2);
      expect(resA[0].templateId).toBe("health");
      expect(resA[1].templateId).toBe("health");
      expect(resB.length).toBe(2);
      expect(resB[0].templateId).toBe("health");
      expect(resB[1].templateId).toBe("health");
      
      // Check ID assignment
      expect(resA[0].itemId).toBe(0);
      expect(resB[0].itemId).toBe(0);
    });

    it("should handle items without templateId", () => {
      const boardA: GameItem[] = [{ itemId: 1, part: 1, coords: [0, 0] }];
      const boardB: GameItem[] = [{ itemId: 2, part: 1, coords: [0, 0] }];
      
      const [resA, resB] = equalizeItemCounts(boardA, boardB);
      expect(resA.length).toBe(1);
      expect(resB.length).toBe(1);
    });
  });

  describe("generateItem", () => {
    it("should generate valid item", () => {
      const template: GameItem = { part: 2, itemId: -1, coords: [0, 0] };
      const item = generateItem(template, 10, 10, [], [], 1, "test", CLASSIC_MODE);
      expect(item).not.toBeNull();
      expect(item?.itemId).toBe(1);
      expect(item?.templateId).toBe("test");
      expect(item?.part).toBe(2);
    });

    it("should fail when board is too small for part", () => {
      const template: GameItem = { part: 5, itemId: -1, coords: [0, 0] };
      const item = generateItem(template, 4, 10, [], [], 1, "test", CLASSIC_MODE);
      expect(item).toBeNull();
    });

    it("should fail sequentially when board is too small for part and maxAttempts is 0", () => {
      const mockGameMode = {
        ...CLASSIC_MODE,
        constants: {
          ...CLASSIC_MODE.constants,
          ITEMS: {
            ...CLASSIC_MODE.constants.ITEMS,
            MAX_PLACEMENT_ATTEMPTS: 0,
          }
        }
      } as unknown as GameMode;
      const template: GameItem = { part: 5, itemId: -1, coords: [0, 0] };
      const item = generateItem(template, 4, 10, [], [], 1, "test", mockGameMode);
      expect(item).toBeNull();
    });

    it("should fallback to sequential search and then fail if completely occupied", () => {
      // Small board, 1x1, occupied by a ship
      const template: GameItem = { part: 1, itemId: -1, coords: [0, 0] };
      const ship: GameShip = { coords: [0, 0], width: 1, height: 1, shipId: 0, };
      
      const item = generateItem(template, 1, 1, [ship], [], 1, "test", CLASSIC_MODE);
      expect(item).toBeNull();
    });

    it("should fallback to sequential search and succeed if a spot is found", () => {
      const template: GameItem = { part: 1, itemId: -1, coords: [0, 0] };
      // Place a ship at 0,0. This makes 0,0 occupied. Board is 2x1. So 1,0 is free.
      const ship: GameShip = { coords: [0, 0], width: 1, height: 1, shipId: 0, };

      // Mock random to always try to place at 0,0.
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

      // It will fail all maxAttempts and then fall back to sequential loop, which will find 2,0.
      const item = generateItem(template, 3, 1, [ship], [], 1, "test", CLASSIC_MODE);
      expect(item).not.toBeNull();
      expect(item?.coords).toEqual([2, 0]);

      randomSpy.mockRestore();
    });
  });

  describe("generateItems", () => {
    it("should generate all requested items", () => {
      const config = { itemCounts: { health: 2 } };
      const mockGameMode = {
        ...CLASSIC_MODE,
        items: [
          { id: "health", part: 1, name: "Health" }
        ]
      } as unknown as GameMode;

      const items = generateItems(config, [], mockGameMode);
      expect(items.length).toBe(2);
      expect(items[0].templateId).toBe("health");
      expect(items[1].templateId).toBe("health");
    });

    it("should use defaultCounts if config.itemCounts is undefined", () => {
      const config = {};
      const mockGameMode = {
        ...CLASSIC_MODE,
        defaultCounts: {
          itemCounts: { health: 1 }
        },
        items: [
          { id: "health", part: 1, name: "Health" }
        ]
      } as unknown as GameMode;

      const items = generateItems(config, [], mockGameMode);
      expect(items.length).toBe(1);
      expect(items[0].templateId).toBe("health");
    });

    it("should skip unknown templates", () => {
      const config = { itemCounts: { unknown: 1 } };
      const items = generateItems(config, [], CLASSIC_MODE);
      expect(items.length).toBe(0);
    });

    it("should skip item if generateItem returns null", () => {
      const config = {
        itemCounts: { health: 1 },
        boardView: { width: 1, height: 1 } as unknown as BoardViewConfig
      };
      const mockGameMode = {
        ...CLASSIC_MODE,
        items: [
          { id: "health", part: 5, name: "Health" } // Too large for 1x1 board
        ]
      } as unknown as GameMode;
      const items = generateItems(config, [], mockGameMode);
      expect(items.length).toBe(0);
    });
  });
});
