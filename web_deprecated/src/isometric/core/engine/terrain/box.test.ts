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
    expect(box.type).toBe("grass");
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
      type: "grass",
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

  it("takes the material of its elevation unless one is given: water below zero, else grass", () => {
    expect(new Box(0, 0, { elevation: -1 }).type).toBe("water");
    expect(new Box(0, 0, { elevation: 0 }).type).toBe("grass");
    expect(new Box(0, 0, { elevation: 0, type: "sand" }).type).toBe("sand");
    expect(new Box(0, 0, { elevation: 2, type: "ground" }).getData().type).toBe("ground");
  });

  it("shares one frozen empty metadata among the boxes without any, so a column is one object (#96)", () => {
    const plain = new Box(0, 0);
    const empty = new Box(1, 0, { metadata: {} });

    expect(plain.metadata).toBe(empty.metadata);
    expect(Object.isFrozen(plain.metadata)).toBe(true);
    expect(new Box(0, 0, { metadata: { tag: "a" } }).metadata).not.toBe(plain.metadata);
  });

  it("keeps its metadata read-only: changing it throws, update() replaces it", () => {
    const given = { tag: "original" };
    const box = new Box(0, 0, { metadata: given });
    given.tag = "changed";

    expect(box.metadata.tag).toBe("original");
    expect(() => {
      (box.metadata as { tag: string }).tag = "changed";
    }).toThrow(TypeError);
    box.update({ metadata: { tag: "updated" } });
    expect(box.metadata).toEqual({ tag: "updated" });
    expect(Object.isFrozen(box.metadata)).toBe(true);
  });

  it("uses a frozen metadata object as given instead of copying it", () => {
    const shared = Object.freeze({ biome: "forest" });

    expect(new Box(0, 0, { metadata: shared }).metadata).toBe(shared);
    expect(new Box(0, 0, { metadata: shared }).getData().metadata).not.toBe(shared);
  });

  it("returns a new data object on every call", () => {
    const box = new Box(0, 0);

    expect(box.getData()).not.toBe(box.getData());
    expect(box.getData().metadata).not.toBe(box.metadata);
  });

  it("changes only the fields an update gives", () => {
    const box = new Box(0, 0, { elevation: 1, type: "sand", walkable: false, metadata: { a: 1 } });

    box.update({ walkable: true });
    expect(box.getData()).toEqual({ type: "sand", walkable: true, elevation: 1, metadata: { a: 1 } });
    box.update({ type: "ground" });
    expect(box.type).toBe("ground");
  });
});
