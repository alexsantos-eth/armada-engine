import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Assets } from "pixi.js";
import { createBlockViews, createSpritePool } from "../render";
import {
  columnsOf,
  createTestEntities,
  defaultWorld,
  mountScene,
  renderCalls,
  resetHarness,
  worldFrom,
} from "../flow-check/scene-harness";
import { DEFAULT_MAX_ELEVATION } from "../terrain";
import { getTerrainTint, createTerrainView } from "./terrain-view";

const renderTerrain = (world: Parameters<typeof mountScene>[0]) => mountScene(world, [createTerrainView()]);

describe("createTerrainView", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("loads the SVG of every material and draws every layer with its texture", async () => {
    const { scene } = await renderTerrain(defaultWorld(createTestEntities));

    ["grass", "ground", "water", "sand"].forEach((material) =>
      expect(Assets.load).toHaveBeenCalledWith({ src: `/assets/${material}/block.svg`, data: expect.anything() }),
    );
    expect(renderCalls.some(({ texture }) => texture.source.includes("water"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("ground"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("grass"))).toBe(true);
    // Darker the further below the top: more than one tint above water.
    expect(
      new Set(renderCalls.filter(({ elevation, tint }) => elevation > 0 && tint !== undefined).map(({ tint }) => tint))
        .size,
    ).toBeGreaterThan(1);
    // Entities are not the terrain's.
    expect(renderCalls.some(({ texture }) => texture.source.includes("statue"))).toBe(false);
    scene.destroy();
  });

  it("takes the blocks' sprites from its pool and gives a hidden chunk's back to it", async () => {
    const { root, scene } = await renderTerrain(defaultWorld());
    const pool = vi.mocked(createSpritePool).mock.results[0].value as ReturnType<typeof createSpritePool> & {
      kept: unknown[];
    };
    const drawn = [...root.children];

    expect(vi.mocked(createBlockViews).mock.calls.every(([options]) => options.sprites === pool)).toBe(true);
    scene.destroy();
    // Hidden with the scene: every block back in the pool, never destroyed by the scene.
    expect(pool.kept).toEqual(expect.arrayContaining(drawn));
    expect(pool.kept).toHaveLength(drawn.length);
    expect(drawn.every(({ destroy }) => vi.mocked(destroy).mock.calls.length === 0)).toBe(true);
    expect(pool.destroy).toHaveBeenCalled();
  });

  it("draws no terrain when a material's SVG cannot be used", async () => {
    vi.mocked(Assets.load).mockImplementationOnce(() => Promise.resolve(undefined as never));
    const { root, scene } = await renderTerrain(defaultWorld());

    expect(renderCalls).toHaveLength(0);
    expect(root.children).toHaveLength(0);
    scene.destroy();
  });

  it("only reads the world: rendering it twice gives the same result", async () => {
    const random = vi.spyOn(Math, "random");
    const world = defaultWorld();
    const before = columnsOf(world).map(({ elevation }) => elevation);

    (await renderTerrain(world)).scene.destroy();
    const first = renderCalls.splice(0);
    (await renderTerrain(world)).scene.destroy();

    expect(renderCalls).toEqual(first);
    expect(columnsOf(world).map(({ elevation }) => elevation)).toEqual(before);
    expect(random).not.toHaveBeenCalled();
  });

  it("tints by height from the highest elevation the terrain reaches, the same in every chunk", async () => {
    const { scene } = await renderTerrain(worldFrom([{ x: 0, y: 0, elevation: 0 }]));
    const grass = { kind: "height", topTint: 0xe8ffb0, step: 0.05 } as const;

    expect(renderCalls.find(({ texture }) => texture.source.includes("grass"))?.tint).toBe(
      getTerrainTint(grass, 0, DEFAULT_MAX_ELEVATION),
    );
    scene.destroy();
  });

  it("renders sand only on the shore of a landmass, with its own tint", async () => {
    const { scene } = await renderTerrain(
      worldFrom([
        { x: 0, y: 0, elevation: -1 },
        { x: 1, y: 0, elevation: 0 },
        { x: 2, y: 0, elevation: 0 },
        { x: 3, y: 0, elevation: 0 },
        { x: 5, y: 0, elevation: 2 },
        { x: 7, y: 0, elevation: -1 },
        { x: 8, y: 0, elevation: 0 },
        { x: 9, y: 0, elevation: -1 },
      ]),
    );
    const topCalls = renderCalls.filter(({ elevation }) => elevation === 0);

    // (1,0) is the shore of the (2,0)–(3,0) landmass → sand; (2,0) and (3,0) → grass;
    // (5,0) is taller → ground at 0; (8,0) is an islet in the water → grass, not sand.
    expect(topCalls.map(({ texture }) => texture.source).sort()).toEqual([
      "/assets/grass/block.svg",
      "/assets/grass/block.svg",
      "/assets/grass/block.svg",
      "/assets/ground/block.svg",
      "/assets/sand/block.svg",
    ]);
    const sand = topCalls.find(({ texture }) => texture.source.includes("sand"));
    const grass = topCalls.find(({ texture }) => texture.source.includes("grass"));
    expect(sand?.tint).toBeDefined();
    expect(sand?.tint).not.toBe(grass?.tint);
    scene.destroy();
  });

  it("draws each block with the material its box was typed with, without classifying again", async () => {
    const world = worldFrom([{ x: 0, y: 0, elevation: 2 }]);
    // Typed sand two blocks up, far from any water: only the box's type can make it sand.
    columnsOf(world)[0].update({ type: "sand" });

    const { scene } = await renderTerrain(world);

    expect(renderCalls.find(({ elevation }) => elevation === 2)?.texture.source).toBe("/assets/sand/block.svg");
    expect(renderCalls.find(({ elevation }) => elevation === 1)?.texture.source).toBe("/assets/ground/block.svg");
    expect(renderCalls.find(({ elevation }) => elevation === -1)?.texture.source).toBe("/assets/water/block.svg");
    scene.destroy();
  });

  it("never creates the buried blocks: only the ones the camera can see", async () => {
    // A 3×3 plateau two blocks high, filled down to DEFAULT_MIN_ELEVATION (−3): 9 columns of 6.
    const points = Array.from({ length: 9 }, (_, index) => ({ x: index % 3, y: Math.floor(index / 3), elevation: 2 }));

    const { scene } = await renderTerrain(worldFrom(points));

    // Behind the camera-side faces (x = 0 or y = 0), the 4 inner columns keep only their top.
    expect(renderCalls).toHaveLength(9 * 6 - 4 * 5);
    expect(renderCalls.filter(({ elevation }) => elevation === 2)).toHaveLength(9);
    scene.destroy();
  });

  it("covers the blocks on a chunk's edge with its neighbour's columns, as if the terrain were one", async () => {
    // A 4×3 plateau across the edge between chunks 0 and 1 (x = 31 | 32 or y = 31 | 32), and the same one inside chunk 0.
    const plateau = (fromX: number, fromY = 0) =>
      Array.from({ length: 12 }, (_, index) => ({
        x: fromX + (index % 4),
        y: fromY + Math.floor(index / 4),
        elevation: 2,
      }));

    (await renderTerrain(worldFrom(plateau(0)))).scene.destroy();
    const inside = renderCalls.splice(0).length;
    for (const across of [plateau(30), plateau(0, 30)]) {
      const { scene } = await renderTerrain(worldFrom(across));
      expect(scene.shownChunks()).toHaveLength(2);
      expect(renderCalls.splice(0)).toHaveLength(inside);
      scene.destroy();
    }
  });

  it("lets blocks behind a sunken top show", async () => {
    // A 3×3 plateau whose front corner is sand: half a block lower, it hides nothing behind it.
    const points = Array.from({ length: 9 }, (_, index) => ({ x: index % 3, y: Math.floor(index / 3), elevation: 2 }));
    const world = worldFrom(points);
    columnsOf(world)[0].update({ type: "sand" });

    const { scene } = await renderTerrain(world);

    expect(renderCalls.length).toBeGreaterThan(9 * 6 - 4 * 5);
    scene.destroy();
  });
});

describe("getTerrainTint", () => {
  it("darkens underwater blocks with depth from white, at least one level", () => {
    const tint = { kind: "depth", step: 0.15 } as const;

    expect(getTerrainTint(tint, 0, 4)).toBe(getTerrainTint(tint, -1, 4));
    expect(getTerrainTint(tint, -1, 4)).toBe(0xd9d9d9);
    expect(getTerrainTint(tint, -2, 4)).toBe(0xb3b3b3);
  });

  it("darkens land from its top tint by the levels below the highest one, never under 35 %", () => {
    const tint = { kind: "height", topTint: 0xffffff, step: 0.05 } as const;

    expect(getTerrainTint(tint, 4, 4)).toBe(0xffffff);
    expect(getTerrainTint(tint, 2, 4)).toBe(0xe6e6e6);
    expect(getTerrainTint(tint, -100, 4)).toBe(0x595959);
    expect(getTerrainTint(tint, 0, 0)).toBeUndefined();
  });
});
