import { describe, expect, it } from "vitest";
import { Box } from "./box";

describe("Box", () => {
  it("keeps metadata when an update does not include it", () => {
    const box = new Box(0, 0, { metadata: { biome: "grass" } });

    box.update({ elevation: 2 });

    expect(box.elevation).toBe(2);
    expect(box.metadata).toEqual({ biome: "grass" });
  });

  it("applies defaults and preserves coordinates", () => {
    const box = new Box(2, 3);

    expect(box.x).toBe(2);
    expect(box.y).toBe(3);
    expect(box.type).toBe("EMPTY");
    expect(box.walkable).toBe(true);
    expect(box.elevation).toBe(0);
    expect(box.metadata).toEqual({});
  });

  it("merges data and metadata during construction and updates", () => {
    const box = new Box(0, 0, {
      elevation: 2,
      metadata: { biome: "grass", wet: false },
    });

    box.update({ elevation: 4, metadata: { wet: true } });

    expect(box.elevation).toBe(4);
    expect(box.metadata).toEqual({ biome: "grass", wet: true });
    expect(box.getData()).toEqual({
      type: "EMPTY",
      walkable: true,
      elevation: 4,
      metadata: { biome: "grass", wet: true },
    });
  });

  it("returns defensive metadata copies", () => {
    const box = new Box(0, 0, { metadata: { tag: "original" } });
    const data = box.getData();
    data.metadata.tag = "changed";

    expect(box.metadata.tag).toBe("original");
  });
});
