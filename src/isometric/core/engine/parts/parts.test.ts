import { describe, expect, it } from "vitest";
import type { WorldPart, WorldPartKey } from "../../types";
import { WorldParts } from "./parts";

type Counter = { count: number };
type Ground = { start: number };

const counterPart: WorldPart<Counter, number, Ground> = {
  id: "counter",
  version: 2,
  create: (ground) => ({ count: ground.start }),
  serialize: (state) => state.count,
  restore: (saved, ground) => ({ count: saved + ground.start }),
};

const namePart: WorldPart<{ name: string }, string> = {
  id: "name",
  version: 1,
  create: () => ({ name: "armada" }),
  serialize: (state) => state.name,
  restore: (saved) => ({ name: saved }),
};

const COUNTER: WorldPartKey<Counter> = { id: "counter" };

describe("WorldParts.create", () => {
  it("creates every part's state from the world context, in list order", () => {
    const parts = WorldParts.create([counterPart, namePart], { start: 3 });

    expect(parts.get(counterPart)).toEqual({ count: 3 });
    expect(parts.get(namePart)).toEqual({ name: "armada" });
    expect(parts.ids).toEqual(["counter", "name"]);
  });

  it("reads a part through a plain key with the same id", () => {
    const parts = WorldParts.create([counterPart], { start: 1 });

    expect(parts.get(COUNTER)).toBe(parts.get(counterPart));
    expect(parts.has(COUNTER)).toBe(true);
    expect(parts.find(COUNTER)).toBe(parts.get(counterPart));
  });

  it("fails clearly when a part is missing, and finds nothing", () => {
    const parts = WorldParts.create([namePart], {});

    expect(() => parts.get(COUNTER)).toThrow('The world has no "counter" part');
    expect(parts.has(COUNTER)).toBe(false);
    expect(parts.find(COUNTER)).toBeUndefined();
  });

  it("rejects two parts with the same id before creating any", () => {
    let created = 0;
    const counting = { ...namePart, create: () => ({ name: String((created += 1)) }) };

    expect(() => WorldParts.create([counting, counting], {})).toThrow('World part "name" is registered twice');
    expect(created).toBe(0);
  });
});

describe("WorldParts serialize / restore", () => {
  it("saves each part with its own version, as plain JSON", () => {
    const parts = WorldParts.create([counterPart, namePart], { start: 4 });
    parts.get(counterPart).count = 9;

    expect(JSON.parse(JSON.stringify(parts.serialize()))).toEqual({
      counter: { version: 2, data: 9 },
      name: { version: 1, data: "armada" },
    });
  });

  it("restores each part from its saved data and the world context", () => {
    const saved = WorldParts.create([counterPart, namePart], { start: 0 }).serialize();
    const restored = WorldParts.restore([counterPart, namePart], saved, { start: 0 });

    expect(restored.get(counterPart)).toEqual({ count: 0 });
    expect(restored.get(namePart)).toEqual({ name: "armada" });
    expect(restored.serialize()).toEqual(saved);
  });

  it("gives a part added after the save a new state, so old saves keep loading", () => {
    const saved = WorldParts.create([namePart], {}).serialize();
    const restored = WorldParts.restore([namePart, counterPart], saved, { start: 5 });

    expect(restored.get(counterPart)).toEqual({ count: 5 });
  });

  it("keeps the saved data of a part nobody registers, and saves it again untouched", () => {
    const saved = WorldParts.create([counterPart, namePart], { start: 7 }).serialize();
    const restored = WorldParts.restore([namePart], saved, {});

    expect(restored.has(COUNTER)).toBe(false);
    expect(restored.ids).toEqual(["name"]);
    expect(restored.serialize()).toEqual(saved);
  });

  it("rejects a part saved at another version, naming the part and both versions", () => {
    const saved = { counter: { version: 1, data: 3 } };

    expect(() => WorldParts.restore([counterPart], saved, { start: 0 })).toThrow(
      'Unsupported save of world part "counter": version 1, expected 2',
    );
  });

  it("rejects two parts with the same id on restore too", () => {
    expect(() => WorldParts.restore([namePart, namePart], {}, {})).toThrow('World part "name" is registered twice');
  });
});
