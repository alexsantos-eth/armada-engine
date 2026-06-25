import { describe, expect, it } from "vitest";
import { createEntitySet } from "./constants";

describe("createEntitySet", () => {
  it("should create map, values, default, and getById", () => {
    const items = [
      { id: "item1", name: "Item 1" },
      { id: "item2", name: "Item 2" },
    ];
    
    const set = createEntitySet(items, "item2");
    
    expect(set.map["item1"]).toEqual(items[0]);
    expect(set.values).toHaveLength(2);
    expect(set.default).toEqual(items[1]);
    expect(set.getById("item1")).toEqual(items[0]);
    expect(set.getById("unknown")).toEqual(items[1]); // fallback
  });

  it("should handle missing ids", () => {
    const items = [
      { name: "No ID 1" },
      { id: "item2", name: "Item 2" },
    ];
    
    const set = createEntitySet(items as unknown as import("../types/entities").GameEntity[]);
    
    expect(set.map[""]).toEqual(items[0]);
    expect(set.default).toEqual(items[0]); // first item is default if fallback absent
    expect(set.getById("unknown")).toEqual(items[0]); 
  });
});
