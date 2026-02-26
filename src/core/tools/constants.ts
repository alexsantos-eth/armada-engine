import type { GameEntity } from "../types/entities";

/**
 * Utility for creating constant sets with unique `id` fields, providing easy access and a default fallback.
 * This is used to manage collections of game constants like ship templates, shot patterns, and board views.
 */
export type ConstantSet<T extends GameEntity> = {
  /**  A record mapping each item's `id` to the item itself for quick lookup. */
  map: Record<string, T>;
  /** A function to retrieve an item by its `id`, returning the default item if the `id` is not found. */
  getById: (id: string) => T;
  /** The default item to return when an `id` is not found, or when no `id` is provided. */
  default: T;
};

/**
 * Creates a GameEntity set utility object from an array of items with unique `id` fields.
 *
 * @template T - The type of items, which must have an optional `id` property.
 * @param items - The array of items to include in the GameEntity set.
 * @param fallbackId - (Optional) The `id` to use as the default item if provided and found in the set.
 * @returns An object containing:
 *   - `map`: A record mapping each item's `id` to the item.
 *   - `getById`: A function to retrieve an item by its `id`, falling back to the default item if not found.
 *   - `default`: The default item (either the one matching `fallbackId` or the first item in the array).
 *
 * @example
 * ```ts
 * const COLORS = [
 *   { id: "red", value: "#f00" },
 *   { id: "blue", value: "#00f" },
 * ];
 * const ColorSet = createEntitySet(COLORS, "blue");
 * ColorSet.getById("red"); // { id: "red", value: "#f00" }
 * ColorSet.default; // { id: "blue", value: "#00f" }
 * ```
 */
export function createEntitySet<T extends GameEntity>(
  items: T[],
  fallbackId?: string,
): ConstantSet<T> {
  const map: Record<string, T> = {};
  
  for (const item of items) {
    map[item.id || ""] = item;
  }

  const defaultItem =
    fallbackId && map[fallbackId] ? map[fallbackId] : items[0];

  return {
    map,
    getById: (id: string) => map[id] || defaultItem,
    default: defaultItem,
  };
}
