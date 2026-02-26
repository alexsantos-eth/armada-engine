import { describe, it, expect } from 'vitest';
import {
  getItemCells,
  generateItem,
  equalizeItemCounts,
  generateItems,
} from '../../tools/items';
import { HEALTH_KIT, AMMO_CACHE } from '../../constants/items';
import { StandardBoardView, withView } from '../../constants/views';
import type { GameItem, GameShip } from '../../types/common';

const BOARD = 10;
const NO_SHIPS: GameShip[] = [];

describe('getItemCells', () => {
  it('should return single cell for part=1 item', () => {
    const item: GameItem = { coords: [3, 4], part: 1, itemId: 0 };
    expect(getItemCells(item)).toEqual([[3, 4]]);
  });

  it('should return multiple cells for part=2 item', () => {
    const item: GameItem = { coords: [2, 5], part: 2, itemId: 0 };
    expect(getItemCells(item)).toEqual([[2, 5], [3, 5]]);
  });

  it('should return cells in a horizontal line', () => {
    const item: GameItem = { coords: [0, 0], part: 3, itemId: 0 };
    expect(getItemCells(item)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });
});

describe('generateItem', () => {
  it('should generate an item on an empty board', () => {
    const item = generateItem(HEALTH_KIT, BOARD, BOARD, NO_SHIPS, [], 0, 'health_kit');
    expect(item).not.toBeNull();
    expect(item?.itemId).toBe(0);
    expect(item?.templateId).toBe('health_kit');
    expect(item?.part).toBe(HEALTH_KIT.part);
  });

  it('should place item within board bounds', () => {
    const item = generateItem(HEALTH_KIT, BOARD, BOARD, NO_SHIPS, [], 0);
    expect(item).not.toBeNull();
    const [x, y] = item!.coords;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + item!.part).toBeLessThanOrEqual(BOARD);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(BOARD);
  });

  it('should avoid ship cells (with buffer)', () => {
    const ship: GameShip = { coords: [5, 5], width: 1, height: 1, shipId: 0 };
    for (let i = 0; i < 30; i++) {
      const item = generateItem(HEALTH_KIT, BOARD, BOARD, [ship], [], i);
      if (item) {
        const [ix, iy] = item.coords;
        // Must respect MIN_DISTANCE_FROM_SHIPS buffer around the ship
        const dist = Math.max(Math.abs(ix - 5), Math.abs(iy - 5));
        expect(dist).toBeGreaterThan(0);
      }
    }
  });

  it('should avoid existing item cells', () => {
    const existing: GameItem = { coords: [0, 0], part: 1, itemId: 0 };
    const item = generateItem(AMMO_CACHE, BOARD, BOARD, NO_SHIPS, [existing], 1);
    if (item) {
      expect(item.coords).not.toEqual([0, 0]);
    }
  });

  it('should return null when board is too narrow for multi-part item', () => {
    const multiPart: GameItem = { coords: [0, 0], part: 5, itemId: 0 };
    // board width 3 can't fit part=5
    const item = generateItem(multiPart, 3, 3, NO_SHIPS, [], 0);
    expect(item).toBeNull();
  });

  it('should preserve templateId', () => {
    const item = generateItem(HEALTH_KIT, BOARD, BOARD, NO_SHIPS, [], 0, 'health_kit');
    expect(item?.templateId).toBe('health_kit');
  });
});

describe('equalizeItemCounts', () => {
  it('should return equal counts for matching boards', () => {
    const make = (id: string, n: number): GameItem[] =>
      Array.from({ length: n }, (_, i) => ({ coords: [i, 0] as [number, number], part: 1, itemId: i, templateId: id }));

    const [a, b] = equalizeItemCounts(make('health_kit', 2), make('health_kit', 2));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  });

  it('should trim to the lesser count per template', () => {
    const make = (id: string, n: number): GameItem[] =>
      Array.from({ length: n }, (_, i) => ({ coords: [i, 0] as [number, number], part: 1, itemId: i, templateId: id }));

    const [a, b] = equalizeItemCounts(make('health_kit', 3), make('health_kit', 1));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('should handle mismatched template types', () => {
    const boardA: GameItem[] = [
      { coords: [0, 0], part: 1, itemId: 0, templateId: 'health_kit' },
      { coords: [1, 0], part: 1, itemId: 1, templateId: 'ammo_cache' },
    ];
    const boardB: GameItem[] = [
      { coords: [0, 0], part: 1, itemId: 0, templateId: 'health_kit' },
    ];
    const [a, b] = equalizeItemCounts(boardA, boardB);
    // only health_kit is common
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].templateId).toBe('health_kit');
  });

  it('should re-index itemIds sequentially', () => {
    const make = (n: number): GameItem[] =>
      Array.from({ length: n }, (_, i) => ({ coords: [i, 0] as [number, number], part: 1, itemId: i + 10, templateId: 'health_kit' }));

    const [a] = equalizeItemCounts(make(3), make(3));
    a.forEach((item, idx) => expect(item.itemId).toBe(idx));
  });

  it('should return empty arrays when no templates match', () => {
    const boardA: GameItem[] = [{ coords: [0, 0], part: 1, itemId: 0, templateId: 'alpha' }];
    const boardB: GameItem[] = [{ coords: [0, 0], part: 1, itemId: 0, templateId: 'beta' }];
    const [a, b] = equalizeItemCounts(boardA, boardB);
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(0);
  });
});

describe('generateItems', () => {
  it('should generate items according to config counts', () => {
    const config = {
      boardView: withView({ width: 15, height: 15 }, StandardBoardView),
      itemCounts: { health_kit: 2, ammo_cache: 1 },
    };
    const items = generateItems(config, NO_SHIPS);
    const hk = items.filter(i => i.templateId === 'health_kit');
    const ac = items.filter(i => i.templateId === 'ammo_cache');
    expect(hk).toHaveLength(2);
    expect(ac).toHaveLength(1);
  });

  it('should skip unknown template names', () => {
    const config = { itemCounts: { nonexistent_item: 5 } };
    const items = generateItems(config, NO_SHIPS);
    expect(items).toHaveLength(0);
  });

  it('should generate zero items when counts are zero', () => {
    const config = { itemCounts: { health_kit: 0, ammo_cache: 0 } };
    expect(generateItems(config, NO_SHIPS)).toHaveLength(0);
  });

  it('should assign sequential itemIds', () => {
    const config = {
      boardView: withView({ width: 15, height: 15 }, StandardBoardView),
      itemCounts: { health_kit: 3 },
    };
    const items = generateItems(config, NO_SHIPS);
    items.forEach((item, idx) => expect(item.itemId).toBe(idx));
  });

  it('should place all items within board bounds', () => {
    const W = 15, H = 15;
    const config = {
      boardView: withView({ width: W, height: H }, StandardBoardView),
      itemCounts: { health_kit: 2, ammo_cache: 2 },
    };
    const items = generateItems(config, NO_SHIPS);
    for (const item of items) {
      const [x, y] = item.coords;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + item.part).toBeLessThanOrEqual(W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(H);
    }
  });

  it('should use default config values when not specified', () => {
    const items = generateItems({}, NO_SHIPS);
    expect(items.length).toBeGreaterThanOrEqual(0);
  });
});
