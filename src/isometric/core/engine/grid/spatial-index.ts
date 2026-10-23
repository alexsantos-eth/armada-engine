import type { CellKey, WorldCoord, WorldRect } from "../../types";
import { cellFromKey, cellKey } from "./coords";

const EMPTY: readonly never[] = Object.freeze([]);

/**
 * Which items occupy which world columns. An item can cover several cells (multi-block
 * footprints) and a cell can hold several items. Lookups use numeric cell keys; queries
 * return items in insertion order, so they stay deterministic.
 *
 * It is a derived lookup: rebuild it from the domain state instead of serializing it.
 */
export class SpatialIndex<T> {
  private readonly byCell = new Map<CellKey, T[]>();
  private readonly cellsByItem = new Map<T, CellKey[]>();
  private readonly order = new Map<T, number>();
  private sequence = 0;

  /** Number of indexed items. */
  get size(): number {
    return this.cellsByItem.size;
  }

  has(item: T): boolean {
    return this.cellsByItem.has(item);
  }

  /**
   * Adds `item` on `cells` (repeated cells count once).
   *
   * @throws When `item` is already indexed; use {@link SpatialIndex.move} instead.
   */
  insert(item: T, cells: readonly WorldCoord[]): void {
    if (this.cellsByItem.has(item)) throw new Error("Item is already in the index; use move()");

    const keys = [...new Set(cells.map(({ x, y }) => cellKey(x, y)))];
    keys.forEach((key) => {
      const items = this.byCell.get(key);
      if (items) items.push(item);
      else this.byCell.set(key, [item]);
    });
    this.cellsByItem.set(item, keys);
    this.order.set(item, this.sequence++);
  }

  /** Removes `item`; returns whether it was indexed. */
  remove(item: T): boolean {
    const keys = this.cellsByItem.get(item);
    if (!keys) return false;

    keys.forEach((key) => {
      const remaining = (this.byCell.get(key) as T[]).filter((other) => other !== item);
      if (remaining.length === 0) this.byCell.delete(key);
      else this.byCell.set(key, remaining);
    });
    this.cellsByItem.delete(item);
    this.order.delete(item);
    return true;
  }

  /** Moves `item` to `cells`, adding it when it was not indexed. */
  move(item: T, cells: readonly WorldCoord[]): void {
    this.remove(item);
    this.insert(item, cells);
  }

  /** Items covering the column `(x, y)`. */
  at(x: number, y: number): readonly T[] {
    return this.byCell.get(cellKey(x, y)) ?? EMPTY;
  }

  isOccupied(x: number, y: number): boolean {
    return this.byCell.has(cellKey(x, y));
  }

  /** Cells covered by `item`, or an empty list when it is not indexed. */
  cellsOf(item: T): WorldCoord[] {
    return (this.cellsByItem.get(item) ?? []).map(cellFromKey);
  }

  /** Indexed items in insertion order. */
  items(): IterableIterator<T> {
    return this.cellsByItem.keys();
  }

  /** Items with at least one cell inside `rect` (and matching `filter`), in insertion order. */
  queryRect(rect: WorldRect, filter: (item: T) => boolean = () => true): T[] {
    const found = new Set<T>();
    this.visitRect(rect, (item) => {
      if (filter(item)) found.add(item);
      return false;
    });
    return [...found].sort((a, b) => (this.order.get(a) as number) - (this.order.get(b) as number));
  }

  /** Whether any item (matching `filter`) has a cell inside `rect`. Stops at the first hit. */
  anyInRect(rect: WorldRect, filter: (item: T) => boolean = () => true): boolean {
    return this.visitRect(rect, filter);
  }

  /** Items within `radius` columns of `(x, y)`, diagonals included (Chebyshev distance). */
  queryRadius(x: number, y: number, radius: number, filter?: (item: T) => boolean): T[] {
    return this.queryRect({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius }, filter);
  }

  /**
   * Visits the items inside `rect` until `visit` returns `true`. Scans the rectangle's
   * cells when it is small, or the items when the rectangle is larger than the index.
   */
  private visitRect(rect: WorldRect, visit: (item: T) => boolean): boolean {
    const { minX, minY, maxX, maxY } = rect;
    if (maxX < minX || maxY < minY) return false;

    const area = (maxX - minX + 1) * (maxY - minY + 1);
    if (area <= this.byCell.size) {
      // Indexed loops: placement asks this for every candidate column, and iterators allocate.
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const items = this.byCell.get(cellKey(x, y));
          if (items === undefined) continue;
          for (let index = 0; index < items.length; index += 1) if (visit(items[index])) return true;
        }
      }
      return false;
    }

    for (const [key, items] of this.byCell) {
      const { x, y } = cellFromKey(key);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      for (const item of items) if (visit(item)) return true;
    }
    return false;
  }
}
