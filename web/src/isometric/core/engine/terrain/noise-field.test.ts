import { describe, expect, it } from "vitest";
import { createNoiseField } from "./noise-field";

const sample = (field: (x: number, y: number) => number) =>
  Array.from({ length: 40 }, (_, index) => field(index * 3 - 60, index * 7 - 100));

describe("createNoiseField", () => {
  it("is deterministic: the same seed and label give the same field", () => {
    expect(sample(createNoiseField(1337, "a", { scale: 8 }))).toEqual(
      sample(createNoiseField(1337, "a", { scale: 8 })),
    );
  });

  it("gives every label and seed its own stream", () => {
    const field = sample(createNoiseField(1337, "a", { scale: 8 }));

    expect(sample(createNoiseField(1337, "b", { scale: 8 }))).not.toEqual(field);
    expect(sample(createNoiseField(7, "a", { scale: 8 }))).not.toEqual(field);
  });

  it("stays in [-1, 1] and is smooth: neighbouring columns are close on average", () => {
    const field = createNoiseField(1337, "a", { scale: 8, detail: 0.35 });
    let steps = 0;
    for (let x = -40; x < 40; x += 1) {
      expect(Math.abs(field(x, 5))).toBeLessThanOrEqual(1);
      steps += Math.abs(field(x + 1, 5) - field(x, 5));
    }
    expect(steps / 80).toBeLessThan(0.2);
  });
});
