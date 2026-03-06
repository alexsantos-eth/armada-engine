import type { GameShip, GameItem } from "../types/entities";
import type { GameConfig } from "../types/config";
import { getShipCellsFromShip } from "./ships";
import type { GameMode } from "../types/modes";

export function getItemCells(item: GameItem): [number, number][] {
  const [startX, y] = item.coords;
  return Array.from(
    { length: item.part },
    (_, i) => [startX + i, y] as [number, number],
  );
}

function buildOccupiedSet(
  ships: GameShip[],
  items: GameItem[],
  minDistFromShips: number,
): Set<string> {
  const occupied = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  for (const ship of ships) {
    for (const [sx, sy] of getShipCellsFromShip(ship)) {
      for (let dx = -minDistFromShips; dx <= minDistFromShips; dx++) {
        for (let dy = -minDistFromShips; dy <= minDistFromShips; dy++) {
          occupied.add(key(sx + dx, sy + dy));
        }
      }
    }
  }

  for (const item of items) {
    for (const [ix, iy] of getItemCells(item)) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          occupied.add(key(ix + dx, iy + dy));
        }
      }
    }
  }

  return occupied;
}

export function generateItem(
  template: GameItem,
  boardWidth: number,
  boardHeight: number,
  existingShips: GameShip[],
  existingItems: GameItem[],
  itemId: number,
  templateId: string | undefined,
  gameMode: GameMode,
): GameItem | null {
  const maxAttempts = gameMode.constants.ITEMS.MAX_PLACEMENT_ATTEMPTS;
  const minDist = gameMode.constants.ITEMS.MIN_DISTANCE_FROM_SHIPS;
  const occupied = buildOccupiedSet(existingShips, existingItems, minDist);
  const key = (x: number, y: number) => `${x},${y}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const maxX = boardWidth - template.part;
    if (maxX < 0) return null;

    const x = Math.floor(Math.random() * (maxX + 1));
    const y = Math.floor(Math.random() * boardHeight);

    let valid = true;
    for (let i = 0; i < template.part; i++) {
      if (occupied.has(key(x + i, y))) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return {
        part: template.part,
        onCollect: template.onCollect,
        onUse: template.onUse,
        coords: [x, y],
        itemId,
        templateId,
      };
    }
  }

  const maxX = boardWidth - template.part;
  if (maxX < 0) return null;

  for (let y = 0; y < boardHeight; y++) {
    for (let x = 0; x <= maxX; x++) {
      let valid = true;
      for (let i = 0; i < template.part; i++) {
        if (occupied.has(key(x + i, y))) {
          valid = false;
          break;
        }
      }

      if (valid) {
        return {
          part: template.part,
          onCollect: template.onCollect,
          onUse: template.onUse,
          coords: [x, y],
          itemId,
          templateId,
        };
      }
    }
  }

  return null;
}

export function equalizeItemCounts(
  boardA: GameItem[],
  boardB: GameItem[],
): [GameItem[], GameItem[]] {
  const groupA = new Map<string, GameItem[]>();
  const groupB = new Map<string, GameItem[]>();

  for (const item of boardA) {
    const t = item.templateId ?? "_";
    if (!groupA.has(t)) groupA.set(t, []);
    groupA.get(t)!.push(item);
  }

  for (const item of boardB) {
    const t = item.templateId ?? "_";
    if (!groupB.has(t)) groupB.set(t, []);
    groupB.get(t)!.push(item);
  }

  const allKeys = new Set([...groupA.keys(), ...groupB.keys()]);

  const resultA: GameItem[] = [];
  const resultB: GameItem[] = [];

  for (const key of allKeys) {
    const aItems = groupA.get(key) ?? [];
    const bItems = groupB.get(key) ?? [];
    const keep = Math.min(aItems.length, bItems.length);

    for (let i = 0; i < keep; i++) {
      resultA.push(aItems[i]);
      resultB.push(bItems[i]);
    }
  }

  return [
    resultA.map((item, idx) => ({ ...item, itemId: idx })),
    resultB.map((item, idx) => ({ ...item, itemId: idx })),
  ];
}

export function generateItems(
  config: Partial<GameConfig>,
  existingShips: GameShip[],
  gameMode: GameMode,
): GameItem[] {
  const items: GameItem[] = [];
  const boardWidth = config.boardView?.width ?? gameMode.boardView.width;
  const boardHeight = config.boardView?.height ?? gameMode.boardView.height;
  const counts = config.itemCounts ?? gameMode.defaultCounts.itemCounts;
  const itemTemplates = Object.fromEntries(
    gameMode.items.map(item => [item.id, item])
  );

  for (const [name, count] of Object.entries(counts)) {
    const template = itemTemplates[name];
    if (!template) continue;

    for (let i = 0; i < count; i++) {
      const item = generateItem(
        template,
        boardWidth,
        boardHeight,
        existingShips,
        items,
        items.length,
        name,
        gameMode,
      );

      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}
