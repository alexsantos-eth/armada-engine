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
    Rectangle: class {
      public x: number;
      public y: number;
      public width: number;
      public height: number;
      constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
      }
    },
    Texture: class {
      public source: unknown;
      public frame: unknown;
      constructor({ source, frame }: { source: unknown; frame: unknown }) {
        this.source = source;
        this.frame = frame;
      }
    },
    RenderTexture: {
      create: vi.fn((options: { width: number; height: number }) => ({
        ...options,
        source: { renderTarget: true },
        destroy: vi.fn(),
      })),
    },
    BlurFilter: class {
      public options: unknown;
      constructor(options: unknown) {
        this.options = options;
      }
    },
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
  SHADOW_MAP_PIXELS_PER_TILE: 16,
  SHADOW_BLUR: 2,
  createGroundShadowView: vi.fn(
    (texture: { source: unknown; frame: unknown }, tileTop: { x: number; y: number }, _metrics: unknown, depth: number) => ({
      view: { cullable: false, source: "ground-shadow", groundShadow: true, texture, tileTop, visible: false, alpha: 1 },
      depth,
    }),
  ),
  createSilhouettes: vi.fn((_views: unknown, box: { x: number; y: number; box: { elevation: number } }) => [{
    sprite: { visible: false, silhouetteOf: box.box },
    worldFoot: { x: box.x, y: box.y },
    screenFoot: { x: 0, y: 0 },
    display: { left: 0, top: 0, width: 1, height: 1 },
  }]),
  placeSilhouette: vi.fn((silhouette: { sprite: { visible: boolean } }) => {
    silhouette.sprite.visible = true;
  }),
  addInDepthOrder: vi.fn(
    (container: { addChild: (child: unknown) => void }, views: { view: unknown; depth: number }[]) => {
      [...views].sort((a, b) => a.depth - b.depth).forEach(({ view }) => container.addChild(view));
    },
  ),
}));

import { Assets } from "pixi.js";
import type { TerrainPoint } from "../../types";
import { Entity, indexEntities } from "../entities";
import { Assets as PixiAssets, RenderTexture } from "pixi.js";
import {
  addInDepthOrder,
  createGroundShadowView,
  createSilhouettes,
  createSvgColorVariant,
  placeSilhouette,
} from "../render";
import { getShadowProjection, getSilhouetteMatrix, SHADOW_REFRESH_TICKS } from "../lighting";
import { Box, classifyColumnSurfaces } from "../terrain";
import { generateWorld, type World } from "../world";
import { DEFAULT_SKY_PALETTE, TICKS_PER_DAY, getSunState } from "../time";
import { TILE_METRICS } from "../constants";
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
      renderer: { render: vi.fn() },
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
      ticker: createTicker(),
      renderer: { render: vi.fn() },
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
      renderer: { render: vi.fn() },
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
      renderer: { render: vi.fn() },
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
      renderer: { render: vi.fn() },
      stage: { addChild: (child: never) => stageChildren.push(child) },
    };

    const destroyScene = await createIsometricScene(app as never, defaultWorld(createTestEntities));
    const [scene] = stageChildren;

    expect(addInDepthOrder).toHaveBeenCalledTimes(1);
    expect(scene.sortableChildren).toBe(false);
    // Off-screen views are created too: Pixi's culler hides them per frame.
    expect(scene.children).toHaveLength(
      renderCalls.length + vi.mocked(createGroundShadowView).mock.calls.length,
    );
    expect(scene.children.every(({ cullable }) => cullable)).toBe(true);
    destroyScene();
  });

  it("only reads the world: rendering it twice gives the same result", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: { render: vi.fn() },
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
      renderer: { render: vi.fn() },
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
      renderer: { render: vi.fn() },
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
      renderer: { render: vi.fn() },
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
        renderer: { render: vi.fn() },
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
    type View = {
      source: string;
      x?: number;
      y?: number;
      groundShadow?: boolean;
      tileTop?: { x: number; y: number };
      texture?: { source: unknown; frame: { x: number; y: number; width: number; height: number } };
      visible?: boolean;
      alpha?: number;
    };

    // An earlier test replaces the loader's implementation; start from the default one.
    beforeEach(() => {
      vi.mocked(PixiAssets.load).mockImplementation(async (source) => {
        const texture = { source: source as unknown as string };
        loadedTextures.set(texture.source, texture);
        return texture as never;
      });
    });

    const sceneOf = async (world: World) => {
      const ticker = createTicker();
      const renderer = { render: vi.fn() };
      const stageChildren: { children: View[] }[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        renderer,
        stage: { addChild: (child: { children: View[] }) => stageChildren.push(child) },
      };
      const destroyScene = await createIsometricScene(app as never, world);
      return { ticker, renderer, children: stageChildren[0].children, destroyScene };
    };
    const at = (world: World, hour: number) => {
      world.clock.tick = Math.round((hour / 24) * TICKS_PER_DAY);
      return world;
    };
    const groundShadows = (children: View[]) => children.filter(({ groundShadow }) => groundShadow);

    it("puts a shadow layer on the top of every column, right after its top block", async () => {
      const world = at(defaultWorld(createTestEntities), 12);
      const { children, destroyScene } = await sceneOf(world);
      const entity = world.entities[0];
      const isAt = (view: View, x: number, y: number) => view.x === x && view.y === y;
      const topIndex = children.reduce(
        (last, view, index) => (!view.groundShadow && !view.source.includes("statue") && isAt(view, entity.x, entity.y) ? index : last),
        -1,
      );
      const shadowIndex = children.findIndex(
        (view) => view.groundShadow && view.texture?.frame.x === (entity.x - 0) * 16 && view.texture.frame.y === entity.y * 16,
      );
      const entityIndex = children.findIndex(({ source }) => source.includes("statue"));

      expect(groundShadows(children)).toHaveLength(world.columns.length);
      expect(topIndex).toBeLessThan(shadowIndex);
      expect(shadowIndex).toBeLessThan(entityIndex);
      destroyScene();
    });

    it("gives each tile its square of the shadow map of its own elevation", async () => {
      const world = worldFrom([
        { x: 0, y: 0, elevation: 2 },
        { x: 1, y: 0, elevation: 2 },
        { x: 0, y: 1, elevation: 1 },
        { x: 1, y: 1, elevation: -1 },
      ]);
      const { children, destroyScene } = await sceneOf(world);
      const shadows = groundShadows(children);

      expect(RenderTexture.create).toHaveBeenCalledTimes(3);
      expect(RenderTexture.create).toHaveBeenCalledWith({ width: 32, height: 32 });
      const frames = shadows.map(({ texture }) => texture?.frame);
      expect(frames).toEqual(expect.arrayContaining([
        { x: 0, y: 0, width: 16, height: 16 },
        { x: 16, y: 0, width: 16, height: 16 },
        { x: 0, y: 16, width: 16, height: 16 },
        { x: 16, y: 16, width: 16, height: 16 },
      ]));
      const sourceOf = (fx: number, fy: number) =>
        shadows.find(({ texture }) => texture?.frame.x === fx && texture.frame.y === fy)?.texture?.source;
      expect(sourceOf(0, 0)).toBe(sourceOf(16, 0));
      expect(sourceOf(0, 0)).not.toBe(sourceOf(0, 16));
      destroyScene();
    });

    it("lays the shadow of a sand tile on its half-height top", async () => {
      const { children, destroyScene } = await sceneOf(worldFrom([
        { x: 0, y: 0, elevation: -1 },
        { x: 1, y: 0, elevation: 0 },
        { x: 2, y: 0, elevation: 0 },
        { x: 3, y: 0, elevation: 0 },
      ]));
      const blockAt = (x: number) =>
        children.filter((view) => !view.groundShadow && view.x === x && view.source.includes("/")).at(-1);
      const shadowAt = (frameX: number) => groundShadows(children).find(({ texture }) => texture?.frame.x === frameX);

      expect(blockAt(1)?.source).toBe("/assets/sand/block.svg");
      // (2, 0) is half a tile higher on screen than (1, 0); the sand top is half a block lower still.
      expect((shadowAt(16)?.tileTop?.y ?? 0) - (shadowAt(32)?.tileTop?.y ?? 0))
        .toBeCloseTo(TILE_METRICS.tileHeight / 2 + TILE_METRICS.boxHeight / 2);
      destroyScene();
    });

    it("draws every caster into each shadow map at or below its own ground", async () => {
      const world = at(defaultWorld(createTestEntities), 15);
      const { renderer, destroyScene } = await sceneOf(world);
      const levels = new Set(world.columns.map(({ elevation }) => elevation));
      const entity = world.entities[0];
      const projection = getShadowProjection(getSunState(world.clock.tick));
      const lowerLevels = [...levels].filter((level) => level <= entity.elevation);

      expect(createSilhouettes).toHaveBeenCalledTimes(world.entities.length);
      expect(renderer.render).toHaveBeenCalledTimes(levels.size);
      expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ clear: true, clearColor: [0, 0, 0, 0] }));
      expect(placeSilhouette).toHaveBeenCalledTimes(lowerLevels.length);
      lowerLevels.forEach((level) => {
        expect(placeSilhouette).toHaveBeenCalledWith(
          expect.anything(),
          getSilhouetteMatrix(projection as never, { x: entity.x, y: entity.y }, entity.elevation - level, TILE_METRICS),
          { x: -0.5, y: -0.5 },
          16,
        );
      });
      destroyScene();
    });

    it("shows the shadow layer by day with the sun's opacity and hides it at night", async () => {
      const day = await sceneOf(at(defaultWorld(), 9));
      const night = await sceneOf(at(defaultWorld(), 0));
      const alpha = getShadowProjection(getSunState(Math.round((9 / 24) * TICKS_PER_DAY)))?.alpha;

      expect(groundShadows(day.children).every(({ visible, alpha: a }) => visible && a === alpha)).toBe(true);
      expect(groundShadows(night.children).every(({ visible }) => !visible)).toBe(true);
      expect(night.renderer.render).not.toHaveBeenCalled();
      day.destroyScene();
      night.destroyScene();
    });

    it("redraws the shadow maps only every SHADOW_REFRESH_TICKS ticks", async () => {
      const world = at(defaultWorld(createTestEntities), 10);
      const { ticker, renderer, destroyScene } = await sceneOf(world);
      const draws = renderer.render.mock.calls.length;

      world.clock.tick += SHADOW_REFRESH_TICKS - 1;
      ticker.frame();
      expect(renderer.render).toHaveBeenCalledTimes(draws);

      world.clock.tick += 1;
      ticker.frame();
      expect(renderer.render).toHaveBeenCalledTimes(2 * draws);
      destroyScene();
    });

    it("redraws the maps as soon as the sun rises again", async () => {
      const world = at(defaultWorld(createTestEntities), 5.9);
      const { ticker, renderer, destroyScene } = await sceneOf(world);
      expect(renderer.render).not.toHaveBeenCalled();

      world.clock.tick = Math.round((6.2 / 24) * TICKS_PER_DAY);
      ticker.frame();

      expect(renderer.render).toHaveBeenCalled();
      destroyScene();
    });

    it("destroys the shadow maps when the scene is destroyed", async () => {
      const { destroyScene } = await sceneOf(at(defaultWorld(), 12));
      const maps = vi.mocked(RenderTexture.create).mock.results.map(({ value }) => value as { destroy: ReturnType<typeof vi.fn> });

      destroyScene();

      maps.forEach((map) => expect(map.destroy).toHaveBeenCalledWith(true));
    });
  });
});
