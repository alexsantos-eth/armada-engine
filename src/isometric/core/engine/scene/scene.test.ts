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
    public isRenderGroup: boolean;
    public tintWrites: number[] = [];

    constructor(options: { isRenderGroup?: boolean } = {}) {
      this.isRenderGroup = options.isRenderGroup ?? false;
    }

    set tint(value: number) {
      this.tintWrites.push(value);
    }

    get tint(): number {
      return this.tintWrites.at(-1) ?? 0xffffff;
    }

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
    UPDATE_PRIORITY: { HIGH: 50, NORMAL: 0, LOW: -50 },
  };
});

vi.mock("../render", async () => ({
  // Real color conversion: the scene test checks the exact ambient tint.
  rgbToTint: (await vi.importActual<typeof import("../render/color")>("../render/color")).rgbToTint,
  createSvgColorVariant: vi.fn(async (source: string, _replacements?: unknown, variation = 0) =>
    _replacements ? `${source}#${variation}` : source),
  createBlockViews: vi.fn(
    ({ texture, box, tint, height, length }: {
      texture: { source: string };
      box: { box: { elevation: number }; baseScreenY: number; x: number; y: number };
      tint?: number;
      height?: number;
      length?: number;
    }) => {
      renderCalls.push({ texture, elevation: box.box.elevation, tint, height, length });
      return [{
        view: { cullable: false, source: texture.source, x: box.x, y: box.y },
        depth: box.baseScreenY,
      }];
    },
  ),
  createShadowView: vi.fn(
    (texture: { source: string }, box: { x: number; y: number; baseScreenY: number }) => ({
      view: { cullable: false, source: texture.source, x: box.x, y: box.y, shadow: true },
      depth: box.baseScreenY,
    }),
  ),
  placeShadowView: vi.fn(
    (view: { shape?: unknown; origin?: unknown }, shape: unknown, origin: unknown) => {
      view.shape = shape;
      view.origin = origin;
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
import { addInDepthOrder, createShadowView, createSvgColorVariant, placeShadowView } from "../render";
import { getShadowShape } from "../lighting";
import { Box, classifyColumnSurfaces } from "../terrain";
import { generateWorld, type World } from "../world";
import { DEFAULT_SKY_PALETTE, TICKS_PER_DAY, getSunState } from "../time";
import { rgbToTint } from "../render/color";
import { createIsometricScene } from "./scene";

type TickerListener = () => void;

/** Minimal Pixi ticker: records listeners so a test can run a frame by hand. */
const createTicker = () => {
  const listeners: { fn: TickerListener; priority: number }[] = [];
  return {
    listeners,
    add: vi.fn((fn: TickerListener, _context?: unknown, priority = 0) => {
      listeners.push({ fn, priority });
    }),
    remove: vi.fn((fn: TickerListener) => {
      const index = listeners.findIndex((listener) => listener.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    }),
    frame: () => listeners.forEach(({ fn }) => fn()),
  };
};

type TintedContainer = {
  isRenderGroup: boolean;
  tint: number;
  tintWrites: number[];
};

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
    clock: { tick: 0 },
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
      ticker: createTicker(),
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(Assets.load).toHaveBeenCalledWith("/assets/grass/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/ground/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/water/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/sand/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/statue/block.svg");
    expect(Assets.load).toHaveBeenCalledWith("/assets/shadow/blob.svg");
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
    expect(Assets.unload).toHaveBeenCalledWith("/assets/shadow/blob.svg");
  });

  it("does not render when a required texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementationOnce(
      async () => undefined as never,
    );
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(renderCalls).toHaveLength(0);
    destroyScene();
  });

  it("creates one colorized SVG variant per entity type and variation", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
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
      ticker: createTicker(),
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
      ticker: createTicker(),
      stage: { addChild: (child: never) => stageChildren.push(child) },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));
    const [scene] = stageChildren;

    expect(addInDepthOrder).toHaveBeenCalledTimes(1);
    expect(scene.sortableChildren).toBe(false);
    // Off-screen views are created too: Pixi's culler hides them per frame.
    expect(scene.children).toHaveLength(
      renderCalls.length + vi.mocked(createShadowView).mock.calls.length,
    );
    expect(scene.children.every(({ cullable }) => cullable)).toBe(true);
    destroyScene();
  });

  it("only reads the world: rendering it twice gives the same result", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
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
      ticker: createTicker(),
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
      ticker: createTicker(),
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
      ticker: createTicker(),
      stage: { addChild: vi.fn() },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(renderCalls.some(({ texture }) => texture.source.includes("tree"))).toBe(false);
    destroyScene();
  });

  describe("ambient light", () => {
    const sceneOf = async (world: World) => {
      const ticker = createTicker();
      const stageChildren: TintedContainer[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        stage: { addChild: (child: TintedContainer) => stageChildren.push(child) },
      };
      const destroyScene = await createIsometricScene(app as never, world);
      return { ticker, scene: stageChildren[0], destroyScene };
    };
    const atHour = (hour: number) => {
      const world = defaultWorld();
      world.clock.tick = (hour / 24) * TICKS_PER_DAY;
      return world;
    };

    it("makes the world a render group so its tint is applied on the GPU", async () => {
      const { scene, destroyScene } = await sceneOf(atHour(12));

      expect(scene.isRenderGroup).toBe(true);
      destroyScene();
    });

    it("tints the world with the ambient light of the current hour", async () => {
      const noon = await sceneOf(atHour(12));
      const midnight = await sceneOf(atHour(0));

      expect(noon.scene.tint).toBe(0xffffff);
      expect(midnight.scene.tint).toBe(rgbToTint(DEFAULT_SKY_PALETTE[0].color));
      noon.destroyScene();
      midnight.destroyScene();
    });

    it("updates the tint on frames where the clock advanced, between simulation and render", async () => {
      const world = atHour(6);
      const { ticker, scene, destroyScene } = await sceneOf(world);

      expect(ticker.add).toHaveBeenCalledWith(expect.any(Function), undefined, 0);
      const writes = scene.tintWrites.length;

      ticker.frame();
      expect(scene.tintWrites).toHaveLength(writes);

      world.clock.tick += TICKS_PER_DAY / 4;
      ticker.frame();
      expect(scene.tintWrites).toHaveLength(writes + 1);
      expect(scene.tint).toBe(rgbToTint(getSunState(world.clock.tick).ambient));
      destroyScene();
    });

    it("stops updating when the scene is destroyed", async () => {
      const { ticker, destroyScene } = await sceneOf(atHour(9));

      destroyScene();

      expect(ticker.remove).toHaveBeenCalledWith(ticker.add.mock.calls[0][0], undefined);
      expect(ticker.listeners).toHaveLength(0);
    });
  });

  describe("shadows", () => {
    // An earlier test replaces the loader's implementation; start from the default one.
    beforeEach(() => {
      vi.mocked(Assets.load).mockImplementation(async (source) => {
        const texture = { source: source as unknown as string };
        loadedTextures.set(texture.source, texture);
        return texture as never;
      });
    });

    type View = { source: string; x: number; y: number; shadow?: boolean; shape?: unknown; origin?: unknown };

    const sceneOf = async (world: World) => {
      const ticker = createTicker();
      const stageChildren: { children: View[] }[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        stage: { addChild: (child: { children: View[] }) => stageChildren.push(child) },
      };
      const destroyScene = await createIsometricScene(app as never, world);
      return { ticker, children: stageChildren[0].children, destroyScene };
    };
    const withEntitiesAt = (hour: number) => {
      const world = defaultWorld(createTestEntities);
      world.clock.tick = (hour / 24) * TICKS_PER_DAY;
      return world;
    };
    const caster = (world: World) => world.entities[0];

    it("creates one shadow per entity, drawn over its ground and under the entity", async () => {
      const world = withEntitiesAt(12);
      const { children, destroyScene } = await sceneOf(world);
      const { x, y } = caster(world);
      const shadowIndex = children.findIndex(({ shadow }) => shadow);
      const entityIndex = children.findIndex(({ source }) => source.includes("statue"));
      const groundIndex = children.reduce(
        (last, view, index) =>
          !view.shadow && !view.source.includes("statue") && view.x === x && view.y === y ? index : last,
        -1,
      );

      expect(createShadowView).toHaveBeenCalledTimes(world.entities.length);
      expect(children[shadowIndex].source).toBe("/assets/shadow/blob.svg");
      expect(groundIndex).toBeLessThan(shadowIndex);
      expect(shadowIndex).toBeLessThan(entityIndex);
      destroyScene();
    });

    it("lays shadows for the sun of the current tick, from the caster's ground point", async () => {
      const world = withEntitiesAt(15);
      const { children, destroyScene } = await sceneOf(world);
      const shadow = children.find(({ shadow: isShadow }) => isShadow);
      const entity = caster(world);

      expect(shadow?.shape).toEqual(getShadowShape(getSunState(world.clock.tick), {
        height: entity.height,
        length: entity.length,
        lengthAxis: "x",
      }));
      expect(shadow?.origin).toEqual({ x: expect.any(Number), y: expect.any(Number) });
      destroyScene();
    });

    it("hides shadows at night", async () => {
      const { children, destroyScene } = await sceneOf(withEntitiesAt(0));

      expect(children.find(({ shadow }) => shadow)?.shape).toBeNull();
      destroyScene();
    });

    it("moves shadows only on frames where the clock advanced", async () => {
      const world = withEntitiesAt(9);
      const { ticker, children, destroyScene } = await sceneOf(world);
      const placed = vi.mocked(placeShadowView).mock.calls.length;

      ticker.frame();
      expect(placeShadowView).toHaveBeenCalledTimes(placed);

      world.clock.tick += TICKS_PER_DAY / 6;
      ticker.frame();
      expect(placeShadowView).toHaveBeenCalledTimes(placed + world.entities.length);
      expect(children.find(({ shadow }) => shadow)?.shape).toEqual(
        getShadowShape(getSunState(world.clock.tick), {
          height: caster(world).height,
          length: caster(world).length,
          lengthAxis: "x",
        }),
      );
      destroyScene();
    });

    it("skips shadows when the shadow texture is unavailable", async () => {
      vi.mocked(Assets.load).mockImplementation(async (source) => {
        const assetSource = source as unknown as string;
        if (assetSource.includes("/shadow/")) return undefined as never;
        return { source: assetSource } as never;
      });

      const { children, destroyScene } = await sceneOf(withEntitiesAt(12));

      expect(createShadowView).not.toHaveBeenCalled();
      expect(children.some(({ source }) => source.includes("statue"))).toBe(true);
      destroyScene();
    });
  });
});
