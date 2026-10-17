import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadedTextures = new Map<string, { source: string }>();
const renderCalls: Array<{
  texture: { source: string };
  elevation: number;
  tint: number | undefined;
  height?: number;
  length?: number;
}> = [];

vi.mock("pixi.js", () => {
  class Container {
    public sortableChildren = false;
    public children: unknown[] = [];

    addChild(child: unknown): void {
      this.children.push(child);
    }

    destroy(): void {}
  }

  return {
    Assets: {
      load: vi.fn(async (source: string) => {
        const texture = { source };
        loadedTextures.set(source, texture);
        return texture;
      }),
      unload: vi.fn(async () => undefined),
    },
    Container,
  };
});

vi.mock("../render", () => ({
  createSvgColorVariant: vi.fn(async (source: string, _replacements?: unknown, variation = 0) =>
    _replacements ? `${source}#${variation}` : source),
  createBlockViews: vi.fn(
    ({ texture, box, tint, height, length }: {
      texture: { source: string };
      box: { box: { elevation: number }; baseScreenY: number };
      tint?: number;
      height?: number;
      length?: number;
    }) => {
      renderCalls.push({ texture, elevation: box.box.elevation, tint, height, length });
      return [{ view: { cullable: false, source: texture.source }, depth: box.baseScreenY }];
    },
  ),
  addInDepthOrder: vi.fn(
    (container: { addChild: (child: unknown) => void }, views: { view: unknown; depth: number }[]) => {
      [...views].sort((a, b) => a.depth - b.depth).forEach(({ view }) => container.addChild(view));
    },
  ),
}));

import { Assets } from "pixi.js";
import type { TerrainPoint } from "../../types";
import { Entity, indexEntities } from "../entities";
import { addInDepthOrder, createSvgColorVariant } from "../render";
import { Box, classifyColumnSurfaces } from "../terrain";
import { generateWorld, type World } from "../world";
import { createIsometricScene } from "./scene";

type EntityFactory = (columns: readonly Box[]) => Entity[];

/** The generated default terrain (no configured entities) with test entities on top. */
const defaultWorld = (createEntities: EntityFactory = () => []): World => {
  const world = generateWorld({ entityDefinitions: [] });
  const entities = createEntities(world.columns);
  return { ...world, entities, occupancy: indexEntities(entities) };
};

/** A world built from explicit terrain points, for precise material checks. */
const worldFrom = (points: TerrainPoint[], createEntities: EntityFactory = () => []): World => {
  const columns = points.map(({ x, y, elevation }) => new Box(x, y, { elevation }));
  const entities = createEntities(columns);
  return {
    seed: 0,
    width: 0,
    height: 0,
    columns,
    surfaces: classifyColumnSurfaces(columns),
    entities,
    occupancy: indexEntities(entities),
  };
};

const createTestEntities = (boxes: readonly Box[]) =>
  boxes.length > 0
    ? [
        new Entity(
          boxes[0].x,
          boxes[0].y,
          {
            id: "statue",
            textureSource: "/assets/statue/block.svg",
            height: 1,
            length: 2,
            spawnChance: 1,
            surface: "grass",
          },
          boxes[0].elevation,
        ),
      ]
    : [];

const createColorizedEntities = (boxes: readonly Box[]) =>
  boxes.slice(0, 2).map((box, index) => new Entity(
    box.x,
    box.y,
    {
      id: `house-${index}`,
      textureSource: "/assets/house/block.svg",
      height: 1,
      spawnChance: 1,
      surface: "grass",
      colorReplacements: {
        "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"],
      },
    },
    box.elevation,
  ));

describe("createIsometricScene", () => {
  beforeEach(() => {
    loadedTextures.clear();
    renderCalls.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the terrain block SVGs and renders all material layers", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(Assets.load).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/sand/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/statue/block.svg");
    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls.some(({ texture }) => texture.source.includes("water"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("ground"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("grass"))).toBe(true);
    expect(renderCalls.some(({ texture, elevation, tint }) =>
      texture.source.includes("grass") && elevation > 0 && tint !== undefined,
    )).toBe(true);
    expect(renderCalls.some(({ texture, elevation, tint }) =>
      texture.source.includes("ground") && elevation >= 0 && tint !== 0xe8ffb0,
    )).toBe(true);
    expect(new Set(
      renderCalls
        .filter(({ elevation, tint }) => elevation > 0 && tint !== undefined)
        .map(({ tint }) => tint),
    ).size).toBeGreaterThan(1);
    expect(renderCalls.some(({ texture, height }) => texture.source.includes("statue") && height === 1)).toBe(true);
    expect(renderCalls.some(({ texture, length }) => texture.source.includes("statue") && length === 2)).toBe(true);

    destroyScene();

    expect(Assets.unload).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/sand/block.svg");
    expect(Assets.unload).toHaveBeenCalledWith("/assets/statue/block.svg");
  });

  it("does not render when a required texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementationOnce(
      async () => undefined as never,
    );
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(renderCalls).toHaveLength(0);
    destroyScene();
  });

  it("creates one colorized SVG variant per entity type and variation", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createColorizedEntities));

    // Two different types → one variant each, with the variation stored on the entity.
    expect(createSvgColorVariant).toHaveBeenCalledTimes(2);
    vi.mocked(createSvgColorVariant).mock.calls.forEach(([source, replacements, variation]) => {
      expect(source).toBe("/assets/house/block.svg");
      expect(replacements).toEqual({ "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] });
      expect(variation).toBe(0);
    });

    destroyScene();
  });

  it("shares variant textures between instances of the same type and variation", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };
    const definition = {
      id: "house",
      textureSource: "/assets/house/block.svg",
      height: 1,
      spawnChance: 1,
      surface: "grass" as const,
      colorReplacements: { "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld((columns) =>
      columns.slice(0, 40).map((box, index) =>
        new Entity(box.x, box.y, definition, box.elevation, { colorVariant: index % 3 }))));

    const variations = vi.mocked(createSvgColorVariant).mock.calls.map(([, , variation]) => variation);
    expect(variations.sort()).toEqual([0, 1, 2]);
    expect(
      renderCalls.filter(({ texture }) => texture.source.startsWith("/assets/house/")).length,
    ).toBeGreaterThan(3);

    destroyScene();
  });

  it("adds every view once, in depth order, as cullable, without sortableChildren", async () => {
    const stageChildren: { sortableChildren: boolean; children: { cullable: boolean }[] }[] = [];
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: (child: never) => stageChildren.push(child) },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));
    const [scene] = stageChildren;

    expect(addInDepthOrder).toHaveBeenCalledTimes(1);
    expect(scene.sortableChildren).toBe(false);
    // Off-screen views are created too: Pixi's culler hides them per frame.
    expect(scene.children).toHaveLength(renderCalls.length);
    expect(scene.children.every(({ cullable }) => cullable)).toBe(true);
    destroyScene();
  });

  it("only reads the world: rendering it twice gives the same result", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };
    const randomSpy = vi.spyOn(Math, "random");
    const world = defaultWorld(createTestEntities);
    const before = world.columns.map(({ elevation }) => elevation);

    (await createIsometricScene(app as never, world))();
    const first = renderCalls.splice(0);
    (await createIsometricScene(app as never, world))();

    expect(renderCalls).toEqual(first);
    expect(world.columns.map(({ elevation }) => elevation)).toEqual(before);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it("handles a terrain without positive elevations", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, worldFrom([
      { x: 0, y: 0, elevation: 0 },
    ]));

    expect(renderCalls.some(({ texture, tint }) =>
      texture.source.includes("grass") && tint === undefined,
    )).toBe(true);
    destroyScene();
  });

  it("renders sand only on the shore of a landmass", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, worldFrom([
      { x: 0, y: 0, elevation: -1 },
      { x: 1, y: 0, elevation: 0 },
      { x: 2, y: 0, elevation: 0 },
      { x: 3, y: 0, elevation: 0 },
      { x: 5, y: 0, elevation: 2 },
      { x: 7, y: 0, elevation: -1 },
      { x: 8, y: 0, elevation: 0 },
      { x: 9, y: 0, elevation: -1 },
    ]));
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
    destroyScene();
  });

  it("skips an entity when its configured texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementation(async (source) => {
      const assetSource = source as unknown as string;
      if (assetSource.includes("/statue/")) return undefined as never;
      return { source: assetSource } as never;
    });
    const app = {
      screen: { width: 1300, height: 1000 },
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(renderCalls.some(({ texture }) => texture.source.includes("tree"))).toBe(false);
    destroyScene();
  });
});