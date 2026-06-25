import { describe, expect, it } from "vitest";
import { getItemCells, generateItem, equalizeItemCounts, generateItems } from "./items";
import type { GameItem, GameShip } from "../types/entities";
import { TEST_MODE } from "../modes/test";
import type { GameMode } from "../types/modes";

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
        { templateId: "nuke", itemId: 5, part: 1, coords: [1, 1] },
      ];

      const [resA, resB] = equalizeItemCounts(boardA, boardB);
      
      expect(resA.length).toBe(1);
      expect(resA[0].templateId).toBe("health");
      expect(resB.length).toBe(1);
      expect(resB[0].templateId).toBe("health");
      
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
      const item = generateItem(template, 10, 10, [], [], 1, "test", TEST_MODE);
      expect(item).not.toBeNull();
      expect(item?.itemId).toBe(1);
      expect(item?.templateId).toBe("test");
      expect(item?.part).toBe(2);
    });

    it("should fail when board is too small for part", () => {
      const template: GameItem = { part: 5, itemId: -1, coords: [0, 0] };
      const item = generateItem(template, 4, 10, [], [], 1, "test", TEST_MODE);
      expect(item).toBeNull();
    });

    it("should fallback to sequential search and then fail if completely occupied", () => {
      // Small board, 1x1, occupied by a ship
      const template: GameItem = { part: 1, itemId: -1, coords: [0, 0] };
      const ship: GameShip = { coords: [0, 0], width: 1, height: 1, shipId: 0, };
      
      const item = generateItem(template, 1, 1, [ship], [], 1, "test", TEST_MODE);
      expect(item).toBeNull();
    });
  });

  describe("generateItems", () => {
    it("should generate all requested items", () => {
      const config = { itemCounts: { health: 2 } };
      const mockGameMode = {
        ...TEST_MODE,
        items: [
          { id: "health", part: 1, name: "Health" }
        ]
      } as unknown as GameMode;

      const items = generateItems(config, [], mockGameMode);
      expect(items.length).toBe(2);
      expect(items[0].templateId).toBe("health");
      expect(items[1].templateId).toBe("health");
    });
  });
});
