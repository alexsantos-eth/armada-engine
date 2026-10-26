import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());

import { Container } from "pixi.js";
import { resetHarness } from "../flow-check/scene-harness";
import { compareViews, createDrawOrder, DRAW_BAND_DEPTH, firstAfter } from "./draw-order";
import type { SceneLayer, SceneView } from "./module";

type Named = { name: string; destroy: ReturnType<typeof vi.fn> };
type Band = { children: Named[]; destroy: ReturnType<typeof vi.fn> };

const view = (name: string) => ({ name, destroy: vi.fn() }) as unknown as Container;
const at = (name: string, depth: number, layer: SceneLayer = 0): SceneView => ({ view: view(name), depth, layer });

/** A world container with its draw order. */
const drawn = () => {
  const root = new Container();
  const bands = () => (root as unknown as { children: Band[] }).children;
  return {
    order: createDrawOrder(root),
    bands,
    names: () => bands().flatMap(({ children }) => children.map(({ name }) => name)),
  };
};

describe("compareViews", () => {
  it("orders by depth, then layer", () => {
    expect(compareViews(at("a", 1, 3), at("b", 2, 0))).toBeLessThan(0);
    expect(compareViews(at("a", 1, 2), at("b", 1, 0))).toBeGreaterThan(0);
    expect(compareViews(at("a", 1, 2), at("b", 1, 2))).toBe(0);
  });
});

describe("firstAfter", () => {
  it("finds the first entry past a point of sorted entries", () => {
    const past = (limit: number) => (value: number) => value > limit;

    expect(firstAfter([], past(3))).toBe(0);
    expect(firstAfter([1, 2, 2, 5], past(0))).toBe(0);
    expect(firstAfter([1, 2, 2, 5], past(2))).toBe(3);
    expect(firstAfter([1, 2, 2, 5], past(9))).toBe(4);
  });
});

describe("createDrawOrder", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("draws the views by depth, then layer, equals in the order they came", () => {
    const { order, names } = drawn();

    order.add([at("c", 2), at("b2", 1, 2), at("a", 1), at("b3", 1, 2)]);
    order.add([at("b4", 1, 2), at("first", -3)]);

    expect(names()).toEqual(["first", "a", "b2", "b3", "b4", "c"]);
  });

  it("keeps one band per row of depths with views in it, from the back", () => {
    const { order, bands } = drawn();

    order.add([at("far", 5 * DRAW_BAND_DEPTH + 1), at("near", -DRAW_BAND_DEPTH / 2), at("twin", 5 * DRAW_BAND_DEPTH)]);

    expect(bands().map(({ children }) => children.map(({ name }) => name))).toEqual([["near"], ["twin", "far"]]);
  });

  it("takes views out without destroying them, and drops a band once it is empty", () => {
    const { order, bands, names } = drawn();
    const back = at("back", 0);
    const front = at("front", 3 * DRAW_BAND_DEPTH);
    order.add([back, at("beside", 1), front]);
    const [, frontBand] = bands();

    order.remove([front, back, at("never added", 0)]);

    expect(names()).toEqual(["beside"]);
    expect(bands()).toHaveLength(1);
    expect(frontBand.destroy).toHaveBeenCalled();
    expect((front.view as unknown as Named).destroy).not.toHaveBeenCalled();
  });

  it("places a view after every view at its depth or behind, moving it between bands", () => {
    const { order, bands, names } = drawn();
    order.add([at("a", 1, 3), at("b", 2), at("far", 4 * DRAW_BAND_DEPTH)]);
    const moving = view("moving");

    order.placeAt(moving, 1, 2);
    expect(names()).toEqual(["a", "moving", "b", "far"]);
    order.placeAt(moving, 4 * DRAW_BAND_DEPTH, 2);
    expect(names()).toEqual(["a", "b", "far", "moving"]);
    order.placeAt(moving, 9 * DRAW_BAND_DEPTH, 2);
    expect(bands()).toHaveLength(3);
    // Added after it was placed, at the same depth and layer: drawn after it.
    order.add([at("later", 9 * DRAW_BAND_DEPTH, 2)]);
    expect(names()).toEqual(["a", "b", "far", "moving", "later"]);
  });

  it("moves a view to another depth or layer, after the views of the same depth and layer", () => {
    const { order, names } = drawn();
    const top = at("top", 1, 0);
    order.add([top, at("tree", 1, 2), at("far", 4 * DRAW_BAND_DEPTH, 0)]);
    const shadow = { view: view("shadow"), depth: 1, layer: 1 as const };

    order.move(shadow);
    expect(names()).toEqual(["top", "shadow", "tree", "far"]);
    order.move({ ...shadow, depth: 4 * DRAW_BAND_DEPTH });
    expect(names()).toEqual(["top", "tree", "far", "shadow"]);
    order.move({ ...top, layer: 3 });
    expect(names()).toEqual(["tree", "top", "far", "shadow"]);
  });
});
