import type { CellKey, WorldCoord } from "../../types";
import { cellFromKey, cellKey } from "./coords";

/** Read-only view of a {@link CellMap}. */
export type ReadonlyCellMap<T> = Pick<CellMap<T>, "get" | "has" | "size" | "forEach" | "values" | "entries">;

/**
 * One value per world column, keyed by numeric {@link cellKey}s instead of `"x:y"` strings.
 * Iteration follows insertion order, so results stay deterministic.
 */
export class CellMap<T> {
  private readonly cells = new Map<CellKey, T>();

  /** Builds a map with one entry per object, keyed by its `x`/`y`. Later objects win. */
  static from<O extends WorldCoord, T>(objects: Iterable<O>, value: (object: O) => T): CellMap<T> {
    const map = new CellMap<T>();
    for (const object of objects) map.set(object.x, object.y, value(object));
    return map;
  }

  /** Number of columns with a value. */
  get size(): number {
    return this.cells.size;
  }

  get(x: number, y: number): T | undefined {
    return this.cells.get(cellKey(x, y));
  }

  has(x: number, y: number): boolean {
    return this.cells.has(cellKey(x, y));
  }

  set(x: number, y: number, value: T): this {
    this.cells.set(cellKey(x, y), value);
    return this;
  }

  delete(x: number, y: number): boolean {
    return this.cells.delete(cellKey(x, y));
  }

  forEach(callback: (value: T, x: number, y: number) => void): void {
    this.cells.forEach((value, key) => {
      const { x, y } = cellFromKey(key);
      callback(value, x, y);
    });
  }

  values(): IterableIterator<T> {
    return this.cells.values();
  }

  *entries(): IterableIterator<[WorldCoord, T]> {
    for (const [key, value] of this.cells) yield [cellFromKey(key), value];
  }
}
