import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Assets } from "pixi.js";
import { createBlockViews, createSpritePool } from "../render";
import {
  columnsOf,
  createTestEntities,
  defaultWorld,
  loadTexture,
  mountScene,
  renderCalls,
  resetHarness,
  TEST_TERRAIN,
  worldFrom,
} from "../flow-check/scene-harness";
import type { Texture } from "pixi.js";
import type { SceneModule } from "../scene";
import { DEFAULT_MAX_ELEVATION } from "../terrain";
import { applyNoiseTint, getTerrainTint, createTerrainView } from "./terrain-view";
import { createVariantPicker } from "./variants";

const renderTerrain = (world: Parameters<typeof mountScene>[0]) => mountScene(world, [createTerrainView()]);

describe("createTerrainView", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("loads the SVG of every material and draws every layer with its texture", async () => {
    const { scene } = await renderTerrain(defaultWorld(createTestEntities));

    ["grass", "ground", "water", "sand"].forEach((material) =>
      expect(Assets.load).toHaveBeenCalledWith({
        src: `/assets/${material}/block.svg`,
        parser: "svg",
        data: expect.anything(),
      }),
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
    // A set: `arrayContaining` compares every pair, seconds for thousands of blocks.
    const kept = new Set(pool.kept);
    expect(drawn.every((view) => kept.has(view))).toBe(true);
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

  it("varies land tint by seeded noise while keeping chunks deterministic", async () => {
    const world = worldFrom(Array.from({ length: 24 }, (_, index) => ({ x: index, y: 0, elevation: 0 })));
    const terrain = {
      ...TEST_TERRAIN,
      grass: {
        ...TEST_TERRAIN.grass,
        noiseTints: { scale: 8, colors: [0xffffff, 0xfff3d2, 0xd8efaa, 0xe1e8a8] },
      },
    };
    const { scene } = await mountScene(world, [createTerrainView()], { terrain });
    const first = renderCalls.map(({ tint }) => tint);
    scene.destroy();
    renderCalls.splice(0);

    const { scene: secondScene } = await mountScene(world, [createTerrainView()], { terrain });
    expect(new Set(renderCalls.map(({ tint }) => tint)).size).toBeGreaterThan(1);
    expect(renderCalls.map(({ tint }) => tint)).toEqual(first);
    secondScene.destroy();
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

  it("draws a block with the texture a terrainSurfaces module gives for it, or with its own", async () => {
    const water = { source: "surface:water" } as unknown as Texture;
    const surfaces: SceneModule = {
      id: "surfaces",
      setup: () => ({
        destroy: () => undefined,
        provides: {
          terrainSurfaces: { textureAt: (material) => (material === "water" ? water : undefined) },
        },
      }),
    };

    const { scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 2 }]), [surfaces, createTerrainView()]);

    expect(renderCalls.find(({ elevation }) => elevation === -1)?.texture).toBe(water);
    expect(renderCalls.find(({ elevation }) => elevation === 2)?.texture.source).toBe("/assets/grass/block.svg");
    scene.destroy();
  });

  describe("variants", () => {
    const variants = [
      { textureSource: "/assets/grass/block_flowers.svg", chance: 0.3 },
      { textureSource: "/assets/grass/block_leaves.svg", chance: 0.3 },
    ];
    const terrain = { ...TEST_TERRAIN, grass: { ...TEST_TERRAIN.grass, variants } };
    // A 6×6 plateau two blocks high, with ground under its grass tops.
    const points = Array.from({ length: 36 }, (_, index) => ({ x: index % 6, y: Math.floor(index / 6), elevation: 2 }));

    it("draws the top of each column with the variant picked for it from the seed, and the rest plain", async () => {
      const world = worldFrom(points);
      const { scene } = await mountScene(world, [createTerrainView()], { terrain });
      const tops = vi
        .mocked(createBlockViews)
        .mock.calls.map(([options]) => options)
        .filter(({ box }) => box.box.elevation === 2);
      const pick = createVariantPicker(variants, world.seed, "terrain-variants:grass");
      const expected = (x: number, y: number) => {
        const index = pick(x, y);
        return index < 0 ? "/assets/grass/block.svg" : variants[index].textureSource;
      };

      expect(tops.length).toBeGreaterThan(0);
      tops.forEach(({ box, texture }) =>
        expect((texture as unknown as { source: string }).source).toBe(expected(box.box.x, box.box.y)),
      );
      expect(new Set(tops.map(({ texture }) => texture)).size).toBe(3);
      // The blocks under the tops keep their material's own texture.
      expect(
        renderCalls.filter(({ elevation }) => elevation < 2).every(({ texture }) => !texture.source.includes("_")),
      ).toBe(true);
      scene.destroy();
    });

    it("keeps the material's own texture where a variant cannot be loaded", async () => {
      vi.mocked(Assets.load).mockImplementation(((asset: string | { src: string }) => {
        const source = typeof asset === "string" ? asset : asset.src;
        return Promise.resolve(source.includes("_") ? undefined : { source });
      }) as never);
      const { scene } = await mountScene(worldFrom(points), [createTerrainView()], { terrain });

      expect(renderCalls.length).toBeGreaterThan(0);
      expect(renderCalls.every(({ texture }) => !texture.source.includes("_"))).toBe(true);
      scene.destroy();
      vi.mocked(Assets.load).mockImplementation(loadTexture as never);
    });

    it("crops shared variant frames from their one spritesheet source", async () => {
      const sheetVariants = [
        { textureSource: "/assets/grass/sheet.svg", chance: 0.3, frame: { x: 0, y: 0, width: 100, height: 80 } },
        { textureSource: "/assets/grass/sheet.svg", chance: 0.3, frame: { x: 100, y: 0, width: 100, height: 80 } },
      ];
      const sheetTerrain = { ...TEST_TERRAIN, grass: { ...TEST_TERRAIN.grass, variants: sheetVariants } };
      vi.mocked(Assets.load).mockImplementation(((asset: string | { src: string }) => {
        const source = typeof asset === "string" ? asset : asset.src;
        return Promise.resolve(
          source === "/assets/grass/sheet.svg"
            ? { source, frame: { x: 0, y: 0, width: 400, height: 160 } }
            : { source },
        );
      }) as never);

      const { scene } = await mountScene(worldFrom(points), [createTerrainView()], { terrain: sheetTerrain });
      const sheetTextures = renderCalls
        .map(({ texture }) => texture as unknown as { source: string; frame?: { x: number; width: number } })
        .filter(({ source }) => source === "/assets/grass/sheet.svg");

      expect(sheetTextures.length).toBeGreaterThan(0);
      expect(new Set(sheetTextures.map(({ frame }) => frame?.width))).toEqual(new Set([200]));
      expect(new Set(sheetTextures.map(({ frame }) => frame?.x))).toEqual(new Set([0, 200]));
      scene.destroy();
      vi.mocked(Assets.load).mockImplementation(loadTexture as never);
    });

    it("fails the setup with invalid variants", async () => {
      const invalid = { ...TEST_TERRAIN, grass: { ...TEST_TERRAIN.grass, variants: [{ ...variants[0], chance: 2 }] } };

      await expect(mountScene(worldFrom(points), [createTerrainView()], { terrain: invalid })).rejects.toThrow(
        'Terrain "grass": variants[0].chance must be in [0, 1]',
      );
    });
  });

  describe("connections", () => {
    // Frame `mask` of the sheet is at x = 10 · mask, so a cropped texture tells its mask.
    const frames = Array.from({ length: 16 }, (_, mask) => ({ x: mask * 10, y: 0, width: 10, height: 10 }));
    const connections = { textureSource: "/assets/path/sheet.svg", frames };
    const terrain = { ...TEST_TERRAIN, path: { ...TEST_TERRAIN.path, connections } };
    const loadSheet = ((asset: string | { src: string }) => {
      const source = typeof asset === "string" ? asset : asset.src;
      return Promise.resolve(
        source === connections.textureSource ? { source, frame: { x: 0, y: 0, width: 160, height: 10 } } : { source },
      );
    }) as never;
    // A 5×5 plateau one block high; a 2 rises two levels at (4, 4).
    const points = Array.from({ length: 25 }, (_, index) => {
      const x = index % 5;
      const y = Math.floor(index / 5);
      return { x, y, elevation: x === 4 && y === 4 ? 3 : 1 };
    });
    // A tee at (1, 1): +x, +y and −x; a straight along x; an end; a lone path; a path a cliff away.
    const PATH = [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [1, 3],
      [3, 3],
      [4, 3],
      [4, 4],
    ];
    const masks = () =>
      new Map(
        vi
          .mocked(createBlockViews)
          .mock.calls.map(([options]) => options)
          .filter(({ texture }) => (texture as unknown as { source: string }).source === connections.textureSource)
          .map(({ box, texture }) => [
            `${box.box.x},${box.box.y}`,
            (texture as unknown as { frame: { x: number } }).frame.x / 10,
          ]),
      );

    it("draws each path top with the frame of the neighbours it joins, across a walkable step only", async () => {
      vi.mocked(Assets.load).mockImplementation(loadSheet);
      const world = worldFrom(points);
      columnsOf(world).forEach((column) => {
        if (PATH.some(([x, y]) => column.x === x && column.y === y)) column.update({ type: "path" });
      });

      const { scene } = await mountScene(world, [createTerrainView()], { terrain });

      expect(Object.fromEntries(masks())).toEqual({
        "0,1": 1,
        "1,1": 1 | 2 | 4,
        "2,1": 4,
        "1,2": 2 | 8,
        "1,3": 8,
        "3,3": 1,
        "4,3": 4,
        "4,4": 0,
      });
      // The ground under a path keeps its own texture.
      expect(
        renderCalls
          .filter(({ elevation }) => elevation === 0)
          .every(({ texture }) => texture.source.includes("ground")),
      ).toBe(true);
      scene.destroy();
      vi.mocked(Assets.load).mockImplementation(loadTexture as never);
    });

    it("keeps the material's own texture when the sheet cannot be loaded", async () => {
      vi.mocked(Assets.load).mockImplementation(((asset: string | { src: string }) => {
        const source = typeof asset === "string" ? asset : asset.src;
        return Promise.resolve(source === connections.textureSource ? undefined : { source });
      }) as never);
      const world = worldFrom(points);
      columnsOf(world)[0].update({ type: "path" });

      const { scene } = await mountScene(world, [createTerrainView()], { terrain });

      expect(renderCalls.some(({ texture }) => texture.source === "/assets/path/block.svg")).toBe(true);
      expect(masks().size).toBe(0);
      scene.destroy();
      vi.mocked(Assets.load).mockImplementation(loadTexture as never);
    });

    it("tints a path like the grass around it when they share a noise field", async () => {
      const noiseTints = { scale: 3, colors: [0xff0000, 0x00ff00, 0x0000ff] };
      const shared = {
        ...TEST_TERRAIN,
        grass: { ...TEST_TERRAIN.grass, noiseTints },
        path: {
          ...TEST_TERRAIN.grass,
          textureSource: "/assets/path/block.svg",
          noiseTints: { ...noiseTints, field: "grass" },
        },
      };
      const grassWorld = worldFrom(points);
      const { scene } = await mountScene(grassWorld, [createTerrainView()], { terrain: shared });
      const grassTints = renderCalls.filter(({ elevation }) => elevation === 1).map(({ tint }) => tint);
      scene.destroy();
      renderCalls.splice(0);

      const pathWorld = worldFrom(points);
      columnsOf(pathWorld).forEach((column) => column.update({ type: "path" }));
      const { scene: pathScene } = await mountScene(pathWorld, [createTerrainView()], { terrain: shared });

      expect(new Set(grassTints).size).toBeGreaterThan(1);
      expect(renderCalls.filter(({ elevation }) => elevation === 1).map(({ tint }) => tint)).toEqual(grassTints);
      pathScene.destroy();
    });

    it("fails the setup with invalid connections", async () => {
      const invalid = { ...TEST_TERRAIN, path: { ...TEST_TERRAIN.path, connections: { ...connections, frames: [] } } };

      await expect(mountScene(worldFrom(points), [createTerrainView()], { terrain: invalid })).rejects.toThrow(
        'Terrain "path": connections.frames must have one frame per mask, 16 (got 0)',
      );
    });
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
  it("uses the noise color as a base when no elevation tint is defined", () => {
    expect(applyNoiseTint(undefined, 0xe5e9a8)).toBe(0xe5e9a8);
  });

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
