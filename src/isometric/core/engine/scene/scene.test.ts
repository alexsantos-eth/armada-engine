import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ColorModule from "../render/color";

const loadedTextures = new Map<string, { source: string }>();
const renderCalls: Array<{
  texture: { source: string };
  elevation: number;
  tint: number | undefined;
  height?: number;
  length?: number;
}> = [];

const containers: unknown[] = [];

vi.mock("pixi.js", () => {
  class Container {
    public sortableChildren = false;
    public children: unknown[] = [];
    public isRenderGroup: boolean;
    public tintWrites: number[] = [];
    public filters: unknown[] | undefined;
    public filterArea: unknown;
    public visibleWrites: boolean[] = [];
    public eventMode = "passive";
    public position = { x: 0, y: 0, set: vi.fn((x: number, y: number) => Object.assign(this.position, { x, y })) };
    public scale = { x: 1, y: 1, set: vi.fn((value: number) => Object.assign(this.scale, { x: value, y: value })) };
    public destroy = vi.fn();

    constructor(options: { isRenderGroup?: boolean } = {}) {
      this.isRenderGroup = options.isRenderGroup ?? false;
      containers.push(this);
    }

    set visible(value: boolean) {
      this.visibleWrites.push(value);
    }

    get visible(): boolean {
      return this.visibleWrites.at(-1) ?? true;
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

    /** Like Pixi: a child already in the container is moved, the index counting without it. */
    addChildAt(child: unknown, index: number): void {
      const current = this.children.indexOf(child);
      if (current >= 0) this.children.splice(current, 1);
      this.children.splice(index, 0, child);
    }
  }

  return {
    Assets: {
      load: vi.fn((asset: string | { src: string }) => {
        const source = typeof asset === "string" ? asset : asset.src;
        const texture = { source };
        loadedTextures.set(source, texture);
        return Promise.resolve(texture);
      }),
      unload: vi.fn(() => Promise.resolve(undefined)),
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
      public destroy = vi.fn();
      constructor({ source, frame }: { source: unknown; frame?: unknown }) {
        this.source = source;
        this.frame = frame;
      }
    },
    Sprite: class {
      public texture: unknown;
      public scale = {
        value: 1,
        set: vi.fn(function (this: { value: number }, value: number) {
          this.value = value;
        }),
      };
      constructor(texture: unknown) {
        this.texture = texture;
      }
    },
    BufferImageSource: class {
      public options: { resource: Uint8ClampedArray; width: number; height: number };
      constructor(options: { resource: Uint8ClampedArray; width: number; height: number }) {
        this.options = options;
      }
    },
    AlphaFilter: class {
      public alpha: number;
      constructor({ alpha }: { alpha: number }) {
        this.alpha = alpha;
      }
    },
    Culler: { shared: { cull: vi.fn() } },
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
  rgbToTint: (await vi.importActual<typeof ColorModule>("../render/color")).rgbToTint,
  createSvgColorVariant: vi.fn((source: string, _replacements?: unknown, variation = 0) =>
    Promise.resolve(_replacements ? `${source}#${variation}` : source),
  ),
  createBlockViews: vi.fn(
    ({
      texture,
      box,
      tint,
      height,
      length,
    }: {
      texture: { source: string };
      box: { box: { elevation: number }; baseScreenY: number; screenX: number; screenY: number; x: number; y: number };
      tint?: number;
      height?: number;
      length?: number;
    }) => {
      renderCalls.push({ texture, elevation: box.box.elevation, tint, height, length });
      // The sprite's top-left sits 30 px above the top of its box.
      const position = {
        x: box.screenX,
        y: box.screenY - 30,
        set: vi.fn((x: number, y: number) => Object.assign(position, { x, y })),
      };
      return [
        {
          view: { cullable: false, source: texture.source, x: box.x, y: box.y, position },
          depth: box.baseScreenY,
        },
      ];
    },
  ),
  getBlockDepth: vi.fn((box: { baseScreenY: number }) => box.baseScreenY),
  SHADOW_MAP_PIXELS_PER_TILE: 16,
  SHADOW_BLUR: 2,
  createGroundShadowView: vi.fn(
    (
      texture: { source: unknown; frame: unknown },
      tileTop: { x: number; y: number },
      _metrics: unknown,
      depth: number,
    ) => ({
      view: { cullable: false, source: "ground-shadow", groundShadow: true, texture, tileTop, visible: true, alpha: 1 },
      depth,
    }),
  ),
  getSvgResolution: vi.fn((tileWidth: number, resolution = 1) => (tileWidth * resolution * 1.5) / 1024),
  createSilhouettes: vi.fn(
    (views: { view: unknown; depth: number }[], box: { x: number; y: number; box: { elevation: number } }) => [
      {
        sprite: { silhouetteOf: box.box },
        source: views[0].view,
        depth: views[0].depth,
        worldFoot: { x: box.x, y: box.y },
        screenFoot: { x: 0, y: 0 },
        display: { left: 0, top: 0, width: 1, height: 1 },
      },
    ],
  ),
  createReceivedShadows: vi.fn((receivers: { own: { source: unknown; depth: number } }[]) => ({
    views: receivers.map(({ own }) => ({
      view: { cullable: false, source: "received-shadow", receivedShadowOf: own.source },
      depth: own.depth,
    })),
    casters: { visible: true },
    atlas: {},
    draw: vi.fn(),
    destroy: vi.fn(),
  })),
  placeSilhouette: vi.fn(),
  addInDepthOrder: vi.fn(
    (container: { addChild: (child: unknown) => void }, views: { view: unknown; depth: number }[]) => {
      [...views].sort((a, b) => a.depth - b.depth).forEach(({ view }) => container.addChild(view));
    },
  ),
}));

import { Assets } from "pixi.js";
import type { TerrainPoint } from "../../types";
import { Entity, indexEntities } from "../entities";
import { CellMap } from "../grid";
import { createPlayer } from "../player";
import { Assets as PixiAssets, Culler, RenderTexture } from "pixi.js";
import {
  addInDepthOrder,
  createBlockViews,
  createGroundShadowView,
  createReceivedShadows,
  createSilhouettes,
  createSvgColorVariant,
  getBlockDepth,
  getSvgResolution,
  placeSilhouette,
} from "../render";
import {
  AO_PIXELS_PER_TILE,
  getCastShadowOffset,
  getShadowProjection,
  getSilhouetteMatrix,
  SHADOW_REFRESH_TICKS,
} from "../lighting";
import { type Box, createTerrainColumns } from "../terrain";
import { generateWorld, type World } from "../world";
import { DEFAULT_SKY_PALETTE, TICKS_PER_DAY, getSunState } from "../time";
import { TILE_METRICS } from "../constants";
import { CAMERA_MAX_ZOOM, CAMERA_START_ZOOM, getCullRect, getGroundPointBelow } from "../camera";
import { projectGridPoint } from "../projection";
import { rgbToTint } from "../render/color";
import { createIsometricScene } from "./scene";

type TickerListener = (ticker: { elapsedMS: number }) => void;

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
    frame: (elapsedMS = 16) => listeners.forEach(({ fn }) => fn({ elapsedMS })),
  };
};

/** Minimal Pixi renderer: render-to-texture calls and resize listeners. */
const createRenderer = (resolution = 1) => {
  const listeners = new Map<string, Set<() => void>>();
  return {
    resolution,
    screen: { x: 0, y: 0, width: 1300, height: 1000 },
    render: vi.fn(),
    listeners,
    on: vi.fn((event: string, fn: () => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(fn));
    }),
    off: vi.fn((event: string, fn: () => void) => {
      listeners.get(event)?.delete(fn);
    }),
    emit: (event: string) => listeners.get(event)?.forEach((fn) => fn()),
  };
};

type SceneContainer = {
  eventMode: string;
  position: { x: number; y: number };
  scale: { x: number; y: number };
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
  const columns = createTerrainColumns(points);
  const entities = createEntities(columns);
  const ground = { columnIndex: CellMap.from(columns, (column) => column), occupancy: indexEntities(entities) };
  return {
    seed: 0,
    width: 0,
    height: 0,
    columns,
    entities,
    ...ground,
    clock: { tick: 0 },
    player: createPlayer(ground, { x: 0, y: 0 }),
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
  boxes.slice(0, 2).map(
    (box, index) =>
      new Entity(
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
      ),
  );

describe("createIsometricScene", () => {
  beforeEach(() => {
    loadedTextures.clear();
    renderCalls.length = 0;
    containers.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the terrain block SVGs and renders all material layers", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };

    const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/grass/block.svg",
      data: { resolution: expect.any(Number), autoGenerateMipmaps: true },
    });
    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/ground/block.svg",
      data: { resolution: expect.any(Number), autoGenerateMipmaps: true },
    });
    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/water/block.svg",
      data: { resolution: expect.any(Number), autoGenerateMipmaps: true },
    });
    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/sand/block.svg",
      data: { resolution: expect.any(Number), autoGenerateMipmaps: true },
    });
    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/statue/block.svg",
      data: { resolution: expect.any(Number), autoGenerateMipmaps: true },
    });
    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls.some(({ texture }) => texture.source.includes("water"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("ground"))).toBe(true);
    expect(renderCalls.some(({ texture }) => texture.source.includes("grass"))).toBe(true);
    expect(
      renderCalls.some(
        ({ texture, elevation, tint }) => texture.source.includes("grass") && elevation > 0 && tint !== undefined,
      ),
    ).toBe(true);
    expect(
      renderCalls.some(
        ({ texture, elevation, tint }) => texture.source.includes("ground") && elevation >= 0 && tint !== 0xe8ffb0,
      ),
    ).toBe(true);
    expect(
      new Set(renderCalls.filter(({ elevation, tint }) => elevation > 0 && tint !== undefined).map(({ tint }) => tint))
        .size,
    ).toBeGreaterThan(1);
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
    vi.mocked(Assets.load).mockImplementationOnce(() => Promise.resolve(undefined as never));
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };

    const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(renderCalls).toHaveLength(0);
    destroyScene();
  });

  it("creates one colorized SVG variant per entity type and variation", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };

    const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createColorizedEntities));

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
      renderer: createRenderer(),
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

    const { destroy: destroyScene } = await createIsometricScene(
      app as never,
      defaultWorld((columns) =>
        columns
          .slice(0, 40)
          .map((box, index) => new Entity(box.x, box.y, definition, box.elevation, { colorVariant: index % 3 })),
      ),
    );

    const variations = vi.mocked(createSvgColorVariant).mock.calls.map(([, , variation]) => variation);
    expect(variations.sort()).toEqual([0, 1, 2]);
    expect(renderCalls.filter(({ texture }) => texture.source.startsWith("/assets/house/")).length).toBeGreaterThan(3);

    destroyScene();
  });

  it("adds every view once, in depth order, as cullable, without sortableChildren", async () => {
    const stageChildren: { sortableChildren: boolean; children: { cullable: boolean }[] }[] = [];
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: (child: never) => stageChildren.push(child) },
    };

    const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createTestEntities));
    const [scene] = stageChildren;

    expect(addInDepthOrder).toHaveBeenCalledTimes(1);
    expect(scene.sortableChildren).toBe(false);
    // Off-screen views are created too, so a moving camera reveals them.
    expect(scene.children).toHaveLength(renderCalls.length + vi.mocked(createGroundShadowView).mock.calls.length);
    expect(scene.children.every(({ cullable }) => cullable)).toBe(true);
    destroyScene();
  });

  it("only reads the world: rendering it twice gives the same result", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };
    const randomSpy = vi.spyOn(Math, "random");
    const world = defaultWorld(createTestEntities);
    const before = world.columns.map(({ elevation }) => elevation);

    (await createIsometricScene(app as never, world)).destroy();
    const first = renderCalls.splice(0);
    (await createIsometricScene(app as never, world)).destroy();

    expect(renderCalls).toEqual(first);
    expect(world.columns.map(({ elevation }) => elevation)).toEqual(before);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it("handles a terrain without positive elevations", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };

    const { destroy: destroyScene } = await createIsometricScene(
      app as never,
      worldFrom([{ x: 0, y: 0, elevation: 0 }]),
    );

    expect(renderCalls.some(({ texture, tint }) => texture.source.includes("grass") && tint === undefined)).toBe(true);
    destroyScene();
  });

  it("renders sand only on the shore of a landmass", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };

    const { destroy: destroyScene } = await createIsometricScene(
      app as never,
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
    destroyScene();
  });

  it("draws each block with the material its box was typed with, without classifying again", async () => {
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };
    const world = worldFrom([{ x: 0, y: 0, elevation: 2 }]);
    // Typed sand two blocks up, far from any water: only the box's type can make it sand.
    world.columns[0].update({ type: "sand" });

    const { destroy: destroyScene } = await createIsometricScene(app as never, world);

    expect(renderCalls.find(({ elevation }) => elevation === 2)?.texture.source).toBe("/assets/sand/block.svg");
    expect(renderCalls.find(({ elevation }) => elevation === 1)?.texture.source).toBe("/assets/ground/block.svg");
    expect(renderCalls.find(({ elevation }) => elevation === -1)?.texture.source).toBe("/assets/water/block.svg");
    destroyScene();
  });

  it("skips an entity when its configured texture is unavailable", async () => {
    vi.mocked(Assets.load).mockImplementation((asset) => {
      const assetSource = (asset as unknown as { src: string }).src;
      if (assetSource.includes("/statue/")) return Promise.resolve(undefined as never);
      return Promise.resolve({ source: assetSource });
    });
    const app = {
      screen: { width: 1300, height: 1000 },
      ticker: createTicker(),
      renderer: createRenderer(),
      stage: { addChild: vi.fn() },
    };

    const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createTestEntities));

    expect(renderCalls.some(({ texture }) => texture.source.includes("tree"))).toBe(false);
    destroyScene();
  });

  describe("performance", () => {
    it("rasterizes every SVG at the size it is drawn at the largest zoom, for the device's pixel ratio", async () => {
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker: createTicker(),
        renderer: createRenderer(2),
        stage: { addChild: vi.fn() },
      };

      const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createColorizedEntities));
      const resolution = getSvgResolution(40 * CAMERA_MAX_ZOOM, 2);

      expect(getSvgResolution).toHaveBeenCalledWith(40 * CAMERA_MAX_ZOOM, 2);
      expect(vi.mocked(Assets.load).mock.calls.length).toBeGreaterThan(4);
      vi.mocked(Assets.load).mock.calls.forEach(([asset]) => {
        expect(asset).toEqual({ src: expect.any(String), data: { resolution, autoGenerateMipmaps: true } });
      });
      // Colorized variants too.
      expect(Assets.load).toHaveBeenCalledWith({
        src: "/assets/house/block.svg#0",
        data: { resolution, autoGenerateMipmaps: true },
      });
      destroyScene();
    });

    it("never creates the buried blocks: only the ones the camera can see", async () => {
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker: createTicker(),
        renderer: createRenderer(),
        stage: { addChild: vi.fn() },
      };
      // A 3×3 plateau two blocks high, filled down to DEFAULT_MIN_ELEVATION (−3): 9 columns of 6.
      const points = Array.from({ length: 9 }, (_, index) => ({
        x: index % 3,
        y: Math.floor(index / 3),
        elevation: 2,
      }));

      const { destroy: destroyScene } = await createIsometricScene(app as never, worldFrom(points));

      // Behind the camera-side faces (x = 0 or y = 0), the 4 inner columns keep only their top.
      expect(renderCalls).toHaveLength(9 * 6 - 4 * 5);
      expect(renderCalls.filter(({ elevation }) => elevation === 2)).toHaveLength(9);
      destroyScene();
    });

    it("culls on demand: once when built and on every renderer resize, never per frame", async () => {
      // Against the screen grown by the camera's cull margin.
      const cullRect = getCullRect({ width: 1300, height: 1000 });
      const ticker = createTicker();
      const renderer = createRenderer();
      const stageChildren: unknown[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        renderer,
        stage: { addChild: (child: unknown) => stageChildren.push(child) },
      };

      const { destroy: destroyScene } = await createIsometricScene(app as never, defaultWorld(createTestEntities));
      const [scene] = stageChildren;

      expect(Culler.shared.cull).toHaveBeenCalledTimes(1);
      expect(Culler.shared.cull).toHaveBeenCalledWith(scene, cullRect, false);
      ticker.frame();
      ticker.frame();
      expect(Culler.shared.cull).toHaveBeenCalledTimes(1);

      renderer.emit("resize");
      expect(Culler.shared.cull).toHaveBeenCalledTimes(2);

      destroyScene();
      expect(renderer.off).toHaveBeenCalledWith("resize", renderer.on.mock.calls[0][1]);
      renderer.emit("resize");
      expect(Culler.shared.cull).toHaveBeenCalledTimes(2);
    });
  });

  describe("camera", () => {
    const sceneOf = async (world: World, options?: Parameters<typeof createIsometricScene>[2]) => {
      const renderer = createRenderer();
      const stageChildren: SceneContainer[] = [];
      const app = {
        screen: renderer.screen,
        ticker: createTicker(),
        renderer,
        stage: { addChild: (child: SceneContainer) => stageChildren.push(child) },
      };
      const scene = await createIsometricScene(app as never, world, options);
      return { renderer, container: stageChildren[0], scene };
    };

    it("projects ground (0, 0) at scene (0, 0) and puts the camera's ground point at the screen centre", async () => {
      const { container, scene } = await sceneOf(worldFrom([{ x: 0, y: 0, elevation: 0 }]), {
        camera: { x: 0, y: 0, zoom: 2 },
      });
      const top = vi.mocked(createBlockViews).mock.calls.find(([{ box }]) => box.box.elevation === 0)?.[0].box;

      expect(top).toMatchObject({ screenX: 0, screenY: 0 });
      expect(scene.camera.state).toEqual({ x: 0, y: 0, zoom: 2 });
      expect(container.position).toMatchObject({ x: 650, y: 500 });
      expect(container.scale).toMatchObject({ x: 2, y: 2 });
      scene.destroy();
    });

    it("starts zoomed in at the centre of the world, and keeps the world views out of hit testing", async () => {
      const world = defaultWorld();
      const { scene, container } = await sceneOf(world);
      const centre = (world.width - 1) / 2;

      expect(scene.camera.state).toEqual({ x: centre, y: centre, zoom: CAMERA_START_ZOOM });
      // Ground (c, c) is drawn c · tileHeight above scene (0, 0).
      expect(container.position.x).toBeCloseTo(650);
      expect(container.position.y).toBeCloseTo(500 + centre * TILE_METRICS.tileHeight * CAMERA_START_ZOOM);
      expect(container.eventMode).toBe("none");
      scene.destroy();
    });

    it("keeps the camera inside the world's columns", async () => {
      const world = defaultWorld();
      const { scene } = await sceneOf(world, { camera: { x: 1e6, y: -5 } });

      expect(scene.camera.state).toMatchObject({ x: world.width - 1, y: 0, zoom: CAMERA_START_ZOOM });
      scene.destroy();
    });

    it("moves the world container when the camera pans or zooms", async () => {
      const { container, scene } = await sceneOf(defaultWorld());
      const { x, y } = container.position;

      scene.camera.pan({ x: 30, y: -15 });
      expect(container.position.x).toBeCloseTo(x + 30);
      expect(container.position.y).toBeCloseTo(y - 15);
      scene.camera.zoomAt(0.5, { x: 650, y: 500 });
      expect(container.scale).toMatchObject({ x: CAMERA_START_ZOOM / 2 });
      scene.destroy();
    });

    it("applies the camera to a resized screen", async () => {
      const { renderer, container, scene } = await sceneOf(defaultWorld());
      const { x } = container.position;

      renderer.screen.width = 800;
      renderer.emit("resize");
      expect(container.position.x).toBeCloseTo(x - 250);
      scene.destroy();
    });
  });

  describe("player", () => {
    const PLAYER = { textureSource: "/assets/player/block.svg", height: 1 } as const;
    const projection = {
      tileWidth: TILE_METRICS.tileWidth,
      tileHeight: TILE_METRICS.tileHeight,
      elevationStep: TILE_METRICS.boxHeight,
      originX: 0,
      originY: 0,
    };
    type PlayerView = {
      source: string;
      cullable: boolean;
      x?: number;
      y?: number;
      position: { x: number; y: number; set: ReturnType<typeof vi.fn> };
    };

    /** A flat 4 × 4 field at elevation 1 with the player standing on `at`. */
    const fieldWithPlayer = (at = { x: 1, y: 1 }): World => {
      const points = Array.from({ length: 16 }, (_, index) => ({
        x: index % 4,
        y: Math.floor(index / 4),
        elevation: 1,
      }));
      const world = worldFrom(points);
      return { ...world, player: createPlayer(world, at) };
    };

    const sceneOf = async (world: World, interpolation?: () => number) => {
      const ticker = createTicker();
      const stageChildren: { children: PlayerView[] }[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        renderer: createRenderer(),
        stage: { addChild: (child: { children: PlayerView[] }) => stageChildren.push(child) },
      };
      const scene = await createIsometricScene(app as never, world, { player: PLAYER, interpolation });
      const container = stageChildren[0];
      const view = container.children.find(({ source }) => source === PLAYER.textureSource) as PlayerView;
      return { ticker, container, view, scene };
    };

    /** Where the sprite of a player at `at` is drawn: 30 px above its top (see the mock). */
    const spriteAt = (at: { x: number; y: number; elevation: number }) => {
      const ground = projectGridPoint(at, projection);
      return { x: ground.x, y: ground.y - at.elevation * TILE_METRICS.boxHeight - 30 };
    };

    it("loads the player's SVG and draws it once, standing on its column and never culled", async () => {
      const { view, scene } = await sceneOf(fieldWithPlayer());

      expect(PixiAssets.load).toHaveBeenCalledWith(expect.objectContaining({ src: PLAYER.textureSource }));
      expect(renderCalls.filter(({ texture }) => texture.source === PLAYER.textureSource)).toEqual([
        expect.objectContaining({ elevation: 1, height: 1 }),
      ]);
      expect(view.cullable).toBe(false);
      expect(view.position).toMatchObject(spriteAt({ x: 1, y: 1, elevation: 1 }));
      scene.destroy();
    });

    it("starts the camera on the player, lifted by its elevation", async () => {
      const { scene } = await sceneOf(fieldWithPlayer({ x: 2, y: 1 }));

      expect(scene.camera.state).toEqual({
        ...getGroundPointBelow({ x: 2, y: 1 }, 1, projection),
        zoom: CAMERA_START_ZOOM,
      });
      scene.destroy();
    });

    it("puts the player in the draw order after the columns behind it and before the ones in front", async () => {
      const { container, view, scene } = await sceneOf(fieldWithPlayer());
      const index = container.children.indexOf(view);
      const blocks = container.children.filter((child) => child.x !== undefined && child !== view);

      // Depth grows towards the camera: x + y ≥ 2 is behind or level with column (1, 1).
      blocks.forEach((block) => {
        const behind = (block.x ?? 0) + (block.y ?? 0) >= 2;
        expect(container.children.indexOf(block) < index).toBe(behind);
      });
      scene.destroy();
    });

    it("draws the player between its last two ticks and glides the camera after it", async () => {
      const world = fieldWithPlayer();
      const { ticker, container, view, scene } = await sceneOf(world, () => 0.5);
      const addChildAt = vi.spyOn(container as never, "addChildAt");
      const before = scene.camera.state;

      world.player.x = 1.4;
      ticker.frame(50);
      expect(view.position).toMatchObject(spriteAt({ x: 1.2, y: 1, elevation: 1 }));
      // Still on column (1, 1): the draw order is kept.
      expect(addChildAt).not.toHaveBeenCalled();
      expect(scene.camera.state.x).toBeGreaterThan(before.x);
      expect(scene.camera.state.x).toBeLessThan(getGroundPointBelow({ x: 1.2, y: 1 }, 1, projection).x);

      for (let frame = 0; frame < 100; frame += 1) ticker.frame(50);
      expect(scene.camera.state).toEqual({
        ...getGroundPointBelow({ x: 1.2, y: 1 }, 1, projection),
        zoom: CAMERA_START_ZOOM,
      });
      scene.destroy();
    });

    it("computes the player's depth again only when it enters another column", async () => {
      const world = fieldWithPlayer();
      const { ticker, scene } = await sceneOf(world, () => 0.5);
      const depth = vi.mocked(getBlockDepth);
      depth.mockClear();

      world.player.x = 1.4;
      ticker.frame();
      world.player.previous = { x: 1.4, y: 1, elevation: 1 };
      ticker.frame();
      expect(depth).not.toHaveBeenCalled();

      world.player.x = 2.2;
      ticker.frame();
      expect(depth).toHaveBeenCalledTimes(1);
      scene.destroy();
    });

    it("keeps the player's place in the draw order on another column at the same depth", async () => {
      const world = fieldWithPlayer();
      const { ticker, container, scene } = await sceneOf(world);
      const addChildAt = vi.spyOn(container as never, "addChildAt");

      // Column (2, 0): same x + y and elevation as (1, 1), so the same depth.
      Object.assign(world.player, { x: 1.8, y: 0.4, previous: { x: 1.8, y: 0.4, elevation: 1 } });
      ticker.frame();
      expect(vi.mocked(getBlockDepth)).toHaveBeenCalled();
      expect(addChildAt).not.toHaveBeenCalled();
      scene.destroy();
    });

    it("moves the player in the draw order only when it enters another column", async () => {
      const world = fieldWithPlayer();
      const { ticker, container, view, scene } = await sceneOf(world);
      const addChildAt = vi.spyOn(container as never, "addChildAt");

      world.player.previous = { x: 1, y: 1, elevation: 1 };
      world.player.x = 1.8;
      ticker.frame();
      ticker.frame();
      expect(view.position).toMatchObject(spriteAt({ x: 1.8, y: 1, elevation: 1 }));
      expect(addChildAt).toHaveBeenCalledTimes(1);
      const index = container.children.indexOf(view);
      container.children
        .filter((child) => child.x !== undefined && child !== view)
        .forEach((block) => {
          expect(container.children.indexOf(block) < index).toBe((block.x ?? 0) + (block.y ?? 0) >= 3);
        });
      scene.destroy();
    });

    it("stands the player on the half-height top of a sand column", async () => {
      const shore = worldFrom([
        { x: 0, y: 0, elevation: -1 },
        { x: 1, y: 0, elevation: 0 },
        { x: 2, y: 0, elevation: 0 },
        { x: 3, y: 0, elevation: 0 },
      ]);
      expect(shore.columnIndex.get(1, 0)?.type).toBe("sand");
      const { view, scene } = await sceneOf({ ...shore, player: createPlayer(shore, { x: 1, y: 0 }) });

      const onGrass = spriteAt({ x: 1, y: 0, elevation: 0 });
      expect(view.position).toMatchObject({ x: onGrass.x, y: onGrass.y + TILE_METRICS.boxHeight / 2 });
      scene.destroy();
    });

    it("does not touch the sprite while the player stands still", async () => {
      const { ticker, view, scene } = await sceneOf(fieldWithPlayer());
      view.position.set.mockClear();

      ticker.frame();
      ticker.frame();
      expect(view.position.set).not.toHaveBeenCalled();
      scene.destroy();
    });

    it("draws a player off the terrain at its own elevation, behind everything", async () => {
      const world = fieldWithPlayer();
      const { ticker, container, view, scene } = await sceneOf(world);

      Object.assign(world.player, { x: 9, y: 9, elevation: 2 });
      ticker.frame();
      expect(view.position).toMatchObject(spriteAt({ x: 9, y: 9, elevation: 2 }));
      expect(container.children[0]).toBe(view);
      scene.destroy();
    });

    it("stops updating the player and unloads its SVG when destroyed", async () => {
      const { ticker, scene } = await sceneOf(fieldWithPlayer());

      scene.destroy();
      expect(ticker.listeners).toHaveLength(0);
      expect(PixiAssets.unload).toHaveBeenCalledWith(PLAYER.textureSource);
    });

    it("is neither drawn nor followed without an appearance", async () => {
      const ticker = createTicker();
      const app = { screen: {}, ticker, renderer: createRenderer(), stage: { addChild: vi.fn() } };
      const scene = await createIsometricScene(app as never, fieldWithPlayer());

      expect(renderCalls.some(({ texture }) => texture.source === PLAYER.textureSource)).toBe(false);
      expect(ticker.listeners).toHaveLength(1);
      expect(scene.camera.state).toMatchObject({ x: 1.5, y: 1.5 });
      scene.destroy();
    });
  });

  describe("ambient light", () => {
    const sceneOf = async (world: World) => {
      const ticker = createTicker();
      const stageChildren: TintedContainer[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        renderer: createRenderer(),
        stage: { addChild: (child: TintedContainer) => stageChildren.push(child) },
      };
      const { destroy: destroyScene } = await createIsometricScene(app as never, world);
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
      vi.mocked(PixiAssets.load).mockImplementation((asset) => {
        const texture = { source: (asset as unknown as { src: string }).src };
        loadedTextures.set(texture.source, texture);
        return Promise.resolve(texture);
      });
    });

    const sceneOf = async (world: World) => {
      const ticker = createTicker();
      const renderer = createRenderer();
      const stageChildren: { children: View[] }[] = [];
      const app = {
        screen: { width: 1300, height: 1000 },
        ticker,
        renderer,
        stage: { addChild: (child: { children: View[] }) => stageChildren.push(child) },
      };
      const { destroy: destroyScene } = await createIsometricScene(app as never, world);
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
        (last, view, index) =>
          !view.groundShadow && !view.source.includes("statue") && isAt(view, entity.x, entity.y) ? index : last,
        -1,
      );
      const shadowIndex = children.findIndex(
        (view) =>
          view.groundShadow && view.texture?.frame.x === (entity.x - 0) * 16 && view.texture.frame.y === entity.y * 16,
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
      expect(frames).toEqual(
        expect.arrayContaining([
          { x: 0, y: 0, width: 16, height: 16 },
          { x: 16, y: 0, width: 16, height: 16 },
          { x: 0, y: 16, width: 16, height: 16 },
          { x: 16, y: 16, width: 16, height: 16 },
        ]),
      );
      const sourceOf = (fx: number, fy: number) =>
        shadows.find(({ texture }) => texture?.frame.x === fx && texture.frame.y === fy)?.texture?.source;
      expect(sourceOf(0, 0)).toBe(sourceOf(16, 0));
      expect(sourceOf(0, 0)).not.toBe(sourceOf(0, 16));
      destroyScene();
    });

    it("lays the shadow of a sand tile on its half-height top", async () => {
      const { children, destroyScene } = await sceneOf(
        worldFrom([
          { x: 0, y: 0, elevation: -1 },
          { x: 1, y: 0, elevation: 0 },
          { x: 2, y: 0, elevation: 0 },
          { x: 3, y: 0, elevation: 0 },
        ]),
      );
      const blockAt = (x: number) =>
        children.filter((view) => !view.groundShadow && view.x === x && view.source.includes("/")).at(-1);
      const shadowAt = (frameX: number) => groundShadows(children).find(({ texture }) => texture?.frame.x === frameX);

      expect(blockAt(1)?.source).toBe("/assets/sand/block.svg");
      // (2, 0) is half a tile higher on screen than (1, 0); the sand top is half a block lower still.
      expect((shadowAt(16)?.tileTop?.y ?? 0) - (shadowAt(32)?.tileTop?.y ?? 0)).toBeCloseTo(
        TILE_METRICS.tileHeight / 2 + TILE_METRICS.boxHeight / 2,
      );
      destroyScene();
    });

    type Layer = { children: unknown[]; visibleWrites: boolean[]; filters?: unknown[] };
    /** The fixed layer each map is drawn from, in the order of the render-to-texture calls. */
    const layerOf = (renderer: ReturnType<typeof createRenderer>, call: number) =>
      (renderer.render.mock.calls[call][0] as { container: Layer }).container;
    /** The containers of silhouettes: the only ones with filters. */
    const castersOf = () => containers.filter((container) => (container as Layer).filters !== undefined) as Layer[];

    it("draws every map when built: the level's occlusion, then the casters on it or higher", async () => {
      const world = at(defaultWorld(createTestEntities), 15);
      const { renderer, destroyScene } = await sceneOf(world);
      const levels = new Set(world.columns.map(({ elevation }) => elevation));
      const entity = world.entities[0];
      const projection = getShadowProjection(getSunState(world.clock.tick));
      const lowerLevels = [...levels].filter((level) => level <= entity.elevation);

      expect(renderer.render).toHaveBeenCalledTimes(levels.size);
      expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ clear: true, clearColor: [0, 0, 0, 0] }));
      // One silhouette set per map the entity reaches, each in that map's own fixed layer, and
      // one cast on other entities (none here: it is alone).
      expect(createSilhouettes).toHaveBeenCalledTimes(lowerLevels.length + 1);
      expect(createReceivedShadows).not.toHaveBeenCalled();
      expect(placeSilhouette).toHaveBeenCalledTimes(lowerLevels.length);
      lowerLevels.forEach((level) => {
        expect(placeSilhouette).toHaveBeenCalledWith(
          expect.anything(),
          getSilhouetteMatrix(
            projection as never,
            { x: entity.x, y: entity.y },
            entity.elevation - level,
            TILE_METRICS,
          ),
          { x: -0.5, y: -0.5 },
          16,
        );
      });
      const layers = renderer.render.mock.calls.map((_, call) => layerOf(renderer, call));
      expect(layers.every(({ children }) => children.length >= 1)).toBe(true);
      expect(layers.filter(({ children }) => children.length === 2)).toHaveLength(lowerLevels.length);
      destroyScene();
    });

    it("puts the level's ambient occlusion, computed once, at the bottom of each map", async () => {
      const world = at(
        worldFrom([
          { x: 0, y: 0, elevation: 1 },
          { x: 1, y: 0, elevation: 0 },
          { x: 0, y: 1, elevation: 0 },
          { x: 1, y: 1, elevation: 0 },
        ]),
        12,
      );
      const { renderer, ticker, destroyScene } = await sceneOf(world);
      type OcclusionSprite = {
        texture: { source: { options: { resource: Uint8ClampedArray; width: number; height: number } } };
        scale: { value: number };
      };
      const occlusionOf = (call: number) => layerOf(renderer, call).children[0] as OcclusionSprite;
      const darkened = (call: number) => occlusionOf(call).texture.source.options.resource.some((value) => value > 0);

      expect(renderer.render).toHaveBeenCalledTimes(2);
      const { options } = occlusionOf(0).texture.source;
      expect(options.width).toBe(2 * AO_PIXELS_PER_TILE);
      expect(options.height).toBe(2 * AO_PIXELS_PER_TILE);
      expect(occlusionOf(0).scale.value).toBe(16 / AO_PIXELS_PER_TILE);
      // The low ground at the foot of (0, 0) is darkened; the top of (0, 0) is not.
      expect([darkened(0), darkened(1)].sort()).toEqual([false, true]);

      world.clock.tick += 5 * SHADOW_REFRESH_TICKS;
      ticker.frame();
      // No casters: the occlusion never changes, so the maps are not redrawn by day.
      expect(renderer.render).toHaveBeenCalledTimes(2);
      destroyScene();
    });

    it("leaves no contact shadow around entities on flat ground", async () => {
      const world = at(
        worldFrom(
          [
            { x: 0, y: 0, elevation: 0 },
            { x: 1, y: 0, elevation: 0 },
          ],
          createTestEntities,
        ),
        0,
      );
      const { renderer, destroyScene } = await sceneOf(world);
      const resource = (
        layerOf(renderer, 0).children[0] as {
          texture: { source: { options: { resource: Uint8ClampedArray } } };
        }
      ).texture.source.options.resource;

      expect(world.entities.length).toBeGreaterThan(0);
      expect(resource.every((value) => value === 0)).toBe(true);
      destroyScene();
    });

    it("never hides or fades the ground views: the map decides what they show", async () => {
      const world = at(defaultWorld(createTestEntities), 9);
      const { children, ticker, destroyScene } = await sceneOf(world);

      for (let hour = 9; hour < 33; hour += 3) {
        world.clock.tick = Math.round((hour / 24) * TICKS_PER_DAY);
        ticker.frame();
      }
      expect(groundShadows(children).every(({ visible, alpha }) => visible === true && alpha === 1)).toBe(true);
      destroyScene();
    });

    it("applies the sun's opacity to each group of silhouettes with shared blur and alpha filters", async () => {
      const world = at(defaultWorld(createTestEntities), 9);
      const { destroyScene } = await sceneOf(world);
      const casters = castersOf();
      const alpha = getShadowProjection(getSunState(world.clock.tick))?.alpha;

      expect(casters.length).toBeGreaterThan(0);
      const [blur, opacity] = casters[0].filters as [{ options: unknown }, { alpha: number }];
      expect(blur.options).toEqual({ strength: 2, quality: 2 });
      expect(opacity.alpha).toBe(alpha);
      casters.forEach(({ filters }) => {
        expect(filters?.[0]).toBe(blur);
        expect(filters?.[1]).toBe(opacity);
      });
      destroyScene();
    });

    it("gives each group of silhouettes its map's rectangle as filter area, so Pixi never measures it", async () => {
      const { destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 9));
      const casters = castersOf() as (Layer & { filterArea?: unknown })[];

      expect(casters.length).toBeGreaterThan(0);
      const maps = vi
        .mocked(RenderTexture.create)
        .mock.results.map(({ value }) => value as { width: number; height: number });
      casters.forEach(({ filterArea }) => {
        expect(filterArea).toEqual({ x: 0, y: 0, width: maps[0].width, height: maps[0].height });
      });
      destroyScene();
    });

    it("draws the maps at night with the occlusion only, hiding the casters once", async () => {
      const world = at(defaultWorld(createTestEntities), 0);
      const { renderer, ticker, destroyScene } = await sceneOf(world);
      const levels = new Set(world.columns.map(({ elevation }) => elevation));
      const casters = castersOf();

      expect(renderer.render).toHaveBeenCalledTimes(levels.size);
      expect(placeSilhouette).not.toHaveBeenCalled();
      expect(casters.length).toBeGreaterThan(0);
      expect(casters.every(({ visibleWrites }) => visibleWrites.join() === "false")).toBe(true);

      world.clock.tick += 5 * SHADOW_REFRESH_TICKS;
      ticker.frame();
      expect(renderer.render).toHaveBeenCalledTimes(levels.size);
      expect(casters.every(({ visibleWrites }) => visibleWrites.length === 1)).toBe(true);
      destroyScene();
    });

    it("by day redraws one map per frame, once it is SHADOW_REFRESH_TICKS old", async () => {
      const world = at(defaultWorld(createTestEntities), 10);
      const { ticker, renderer, destroyScene } = await sceneOf(world);
      const draws = renderer.render.mock.calls.length;

      world.clock.tick += SHADOW_REFRESH_TICKS - 1;
      ticker.frame();
      expect(renderer.render).toHaveBeenCalledTimes(draws);

      world.clock.tick += 1;
      ticker.frame();
      expect(renderer.render).toHaveBeenCalledTimes(draws + 1);
      // The frame loop runs even when the clock stands still: the next stale map is drawn.
      ticker.frame();
      expect(renderer.render).toHaveBeenCalledTimes(draws + 2);
      destroyScene();
    });

    it("keeps every map moving when a refresh falls due on every frame", async () => {
      const world = at(defaultWorld(createTestEntities), 10);
      const { ticker, renderer, destroyScene } = await sceneOf(world);
      const built = renderer.render.mock.calls.length;
      const withCasters = new Set(
        renderer.render.mock.calls
          .map((_, call) => layerOf(renderer, call))
          .filter(({ children }) => children.length === 2),
      );

      for (let frame = 0; frame < 3 * withCasters.size; frame += 1) {
        world.clock.tick += SHADOW_REFRESH_TICKS * 3;
        ticker.frame();
      }
      const redrawn = renderer.render.mock.calls.slice(built).map((_, call) => layerOf(renderer, built + call));

      expect(redrawn).toHaveLength(3 * withCasters.size);
      expect(new Set(redrawn)).toEqual(withCasters);
      destroyScene();
    });

    it("redraws each map with the sun of the frame it is drawn in", async () => {
      const world = at(defaultWorld(createTestEntities), 10);
      const { ticker, renderer, destroyScene } = await sceneOf(world);
      const entity = world.entities[0];
      const lifts = [...new Set(world.columns.map(({ elevation }) => elevation))]
        .filter((level) => level <= entity.elevation)
        .map((level) => entity.elevation - level);
      vi.mocked(placeSilhouette).mockClear();
      renderer.render.mockClear();

      world.clock.tick += SHADOW_REFRESH_TICKS;
      ticker.frame();
      const projection = getShadowProjection(getSunState(world.clock.tick));
      const [silhouette, matrix] = vi.mocked(placeSilhouette).mock.calls[0];

      expect(renderer.render).toHaveBeenCalledTimes(1);
      expect(
        lifts.map((lift) => getSilhouetteMatrix(projection as never, silhouette.worldFoot, lift, TILE_METRICS)),
      ).toContainEqual(matrix);
      destroyScene();
    });

    it("draws every map again at sunrise, with the casters shown", async () => {
      const world = at(defaultWorld(createTestEntities), 5.9);
      const { ticker, renderer, destroyScene } = await sceneOf(world);
      const levels = new Set(world.columns.map(({ elevation }) => elevation));
      const casters = castersOf();
      expect(placeSilhouette).not.toHaveBeenCalled();

      world.clock.tick = Math.round((6.2 / 24) * TICKS_PER_DAY);
      ticker.frame();

      expect(renderer.render).toHaveBeenCalledTimes(2 * levels.size);
      expect(placeSilhouette).toHaveBeenCalled();
      expect(casters.every(({ visibleWrites }) => visibleWrites.join() === "false,true")).toBe(true);
      destroyScene();
    });

    describe("on other entities", () => {
      /** A row of columns, entities standing on `entityColumns` (one with its block raised). */
      const row = (entityColumns: number[], raised?: number) =>
        worldFrom(
          [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0, elevation: x === raised ? 2 : 1 })),
          (columns) =>
            entityColumns.map((x) => {
              const column = columns.find((box) => box.x === x) as Box;
              return new Entity(
                x,
                0,
                {
                  id: `tree-${x}`,
                  textureSource: "/assets/tree/block.svg",
                  height: 1,
                  spawnChance: 1,
                  surface: "grass",
                },
                column.elevation,
              );
            }),
        );
      type Received = ReturnType<typeof createReceivedShadows> & {
        casters: { visible: boolean };
        draw: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      const received = () => vi.mocked(createReceivedShadows).mock.results[0].value as Received;
      const receiversOf = () => vi.mocked(createReceivedShadows).mock.calls[0][0];

      it("lets each entity receive the silhouettes of the others whose shadow can reach it", async () => {
        const world = at(row([0, 1, 5]), 10);
        const { destroyScene } = await sceneOf(world);
        const footOf = (silhouette: { worldFoot: { x: number } }) => silhouette.worldFoot.x;

        expect(createReceivedShadows).toHaveBeenCalledTimes(1);
        // The two neighbours shade each other; the tree at x = 5 is beyond any shadow's reach.
        expect(
          receiversOf().map(({ own, casters }) => [footOf(own), casters.map(({ silhouette }) => footOf(silhouette))]),
        ).toEqual([
          [0, [1]],
          [1, [0]],
        ]);
        expect(receiversOf()[0].casters[0].lift).toBe(0);
        destroyScene();
      });

      it("gives each caster the blocks it stands above its receiver", async () => {
        const { destroyScene } = await sceneOf(at(row([0, 1], 1), 10));
        const lifts = receiversOf().map(({ casters }) => casters[0].lift);

        expect(lifts).toEqual([1, -1]);
        destroyScene();
      });

      it("draws a receiver's shadow right after its sprite, with the ground shadows' filters", async () => {
        const world = at(row([0, 1]), 10);
        const { children, destroyScene } = await sceneOf(world);
        type Child = View & { receivedShadowOf?: unknown };
        const shadowIndex = (children as Child[]).findIndex(({ receivedShadowOf }) => receivedShadowOf !== undefined);
        const shadow = children[shadowIndex] as Child;
        const [blur, opacity] = castersOf()[0].filters as unknown[];

        expect(children[shadowIndex - 1]).toBe(shadow.receivedShadowOf);
        expect(vi.mocked(createReceivedShadows).mock.calls[0][2]).toEqual([blur, opacity]);
        destroyScene();
      });

      it("lays the casters with the sun when built and on its turn by day", async () => {
        const world = at(row([0, 1]), 10);
        const { ticker, destroyScene } = await sceneOf(world);
        const { draw } = received();
        const sun = getShadowProjection(getSunState(world.clock.tick));
        const offsetOf = draw.mock.calls[0][0] as (...args: unknown[]) => unknown;

        expect(draw).toHaveBeenCalledTimes(1);
        expect(offsetOf({ x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toEqual(
          getCastShadowOffset(sun as never, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, TILE_METRICS),
        );

        // One target per frame, the stalest: within a few frames the atlas is drawn again.
        const levels = new Set(world.columns.map(({ elevation }) => elevation)).size;
        for (let frame = 0; frame <= levels; frame += 1) {
          world.clock.tick += SHADOW_REFRESH_TICKS;
          ticker.frame();
        }
        expect(draw.mock.calls.length).toBeGreaterThan(1);
        destroyScene();
      });

      it("draws the atlas empty at night, hiding its casters", async () => {
        const { destroyScene } = await sceneOf(at(row([0, 1]), 0));

        expect(received().draw).toHaveBeenCalledWith(null);
        expect(received().casters.visible).toBe(false);
        destroyScene();
      });

      it("destroys the received shadows with the scene", async () => {
        const { destroyScene } = await sceneOf(at(row([0, 1]), 10));

        destroyScene();
        expect(received().destroy).toHaveBeenCalled();
      });
    });

    it("destroys the shadow maps, their layers and the occlusion textures when the scene is destroyed", async () => {
      const { renderer, destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 12));
      const maps = vi
        .mocked(RenderTexture.create)
        .mock.results.map(({ value }) => value as { destroy: ReturnType<typeof vi.fn> });
      const layers = renderer.render.mock.calls.map(
        (_, call) => layerOf(renderer, call) as Layer & { destroy: ReturnType<typeof vi.fn> },
      );
      const occlusion = layers.map(
        ({ children }) => (children[0] as { texture: { destroy: ReturnType<typeof vi.fn> } }).texture,
      );

      destroyScene();

      maps.forEach((map) => expect(map.destroy).toHaveBeenCalledWith(true));
      layers.forEach((layer) => expect(layer.destroy).toHaveBeenCalledWith({ children: true }));
      occlusion.forEach((texture) => expect(texture.destroy).toHaveBeenCalledWith(true));
    });
  });
});
