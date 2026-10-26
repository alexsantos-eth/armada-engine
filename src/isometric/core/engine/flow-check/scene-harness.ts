/*
 * Test support for the scene and its modules: mocks of Pixi and of the render primitives that
 * record what a module draws, a fake app (ticker, renderer, stage) and small worlds. Each test
 * file mocks with it before importing the module under test:
 *
 *   vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
 *   vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
 *
 * Code that runs the shadows module also mocks its Pixi parts (`mockSilhouette()`,
 * `mockReceivedShadow()`).
 *
 * Never imported by engine code.
 */
import { vi } from "vitest";
import type * as ColorModule from "../render/color";
import { Entity } from "../entities";
import { chunksInRect } from "../grid";
import { createPlayer, createPlayerPart } from "../player";
import { DEFAULT_WORLD_SEED } from "../random";
import { type Box, createTerrainColumns, generateTerrainColumns } from "../terrain";
import { createClockPart } from "../time";
import { createFixedChunkSource, createWorld, type World, type WorldPartOf } from "../world";
import type { TerrainAppearance, TerrainPoint, WorldRect } from "../../types";
import type { SceneModule, SceneOptions } from "../scene";

/** Textures the mocked `Assets.load` returned, by source. */
export const loadedTextures = new Map<string, { source: string }>();

/** Every `createBlockViews()` call, in order. */
export const renderCalls: Array<{
  texture: { source: string };
  elevation: number;
  tint: number | undefined;
  height?: number;
  length?: number;
  splitAt?: number;
}> = [];

/** Every mocked Pixi `Container` created, in order. */
export const containers: unknown[] = [];

/** Clears what the mocks recorded. Call it in `beforeEach`, before `vi.clearAllMocks()`. */
export function resetHarness(): void {
  loadedTextures.clear();
  renderCalls.length = 0;
  containers.length = 0;
}

/** The default implementation of the mocked `Assets.load`. */
export const loadTexture = (asset: string | { src: string }) => {
  const source = typeof asset === "string" ? asset : asset.src;
  const texture = { source };
  loadedTextures.set(source, texture);
  return Promise.resolve(texture);
};

/** A mock of the parts of `pixi.js` the scene and its modules use. */
export function mockPixi() {
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

    addChild(...children: unknown[]): void {
      this.children.push(...children);
    }

    /** Like Pixi: a child already in the container is moved, the index counting without it. */
    addChildAt(child: unknown, index: number): void {
      const current = this.children.indexOf(child);
      if (current >= 0) this.children.splice(current, 1);
      this.children.splice(index, 0, child);
    }

    removeChild(child: unknown): void {
      const current = this.children.indexOf(child);
      if (current >= 0) this.children.splice(current, 1);
    }

    /** Like Pixi: returns the children it took out. */
    removeChildren(): unknown[] {
      return this.children.splice(0);
    }
  }

  return {
    Assets: { load: vi.fn(loadTexture), unload: vi.fn(() => Promise.resolve(undefined)) },
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
      public scale = {
        value: 1,
        set: vi.fn(function (this: { value: number }, value: number) {
          this.value = value;
        }),
      };
      public texture: unknown;
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
      public destroy = vi.fn();
      constructor({ alpha }: { alpha: number }) {
        this.alpha = alpha;
      }
    },
    BlurFilter: class {
      public options: unknown;
      public destroy = vi.fn();
      constructor(options: unknown) {
        this.options = options;
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
    UPDATE_PRIORITY: { HIGH: 50, NORMAL: 0, LOW: -50 },
  };
}

/** A mock of `../render`: block views that record their calls (each sprite 30 px above its box). */
export async function mockRender() {
  return {
    // Real color conversion: tests check the exact ambient tint.
    rgbToTint: (await vi.importActual<typeof ColorModule>("../render/color")).rgbToTint,
    createSvgColorVariant: vi.fn((source: string, replacements?: unknown, variation = 0) =>
      Promise.resolve(replacements ? `${source}#${variation}` : source),
    ),
    releaseSvgColorVariant: vi.fn(),
    createBlockViews: vi.fn(
      ({
        texture,
        box,
        tint,
        height,
        length,
        splitAt,
      }: {
        texture: { source: string };
        box: {
          box: { elevation: number };
          baseScreenY: number;
          screenX: number;
          screenY: number;
          x: number;
          y: number;
        };
        tint?: number;
        height?: number;
        length?: number;
        splitAt?: number;
      }) => {
        renderCalls.push({ texture, elevation: box.box.elevation, tint, height, length, splitAt });
        const position = {
          x: box.screenX,
          y: box.screenY - 30,
          set: vi.fn((x: number, y: number) => Object.assign(position, { x, y })),
        };
        return [
          {
            view: { cullable: false, source: texture.source, x: box.x, y: box.y, position, destroy: vi.fn() },
            depth: box.baseScreenY,
          },
        ];
      },
    ),
    getBlockDepth: vi.fn((box: { baseScreenY: number }) => box.baseScreenY),
    // A pool that keeps what it is given, to check what modules give back.
    createSpritePool: vi.fn(() => {
      const kept: unknown[] = [];
      return {
        kept,
        take: vi.fn(),
        give: vi.fn((views: readonly unknown[]) => kept.push(...views)),
        destroy: vi.fn(),
      };
    }),
    getSvgResolution: vi.fn((tileWidth: number, resolution = 1) => (tileWidth * resolution * 1.5) / 1024),
  };
}

/** A mock of `shadows/silhouette`: ground shadow views and one silhouette per entity, marked for tests. */
export function mockSilhouette() {
  return {
    SHADOW_MAP_PIXELS_PER_TILE: 16,
    SHADOW_BLUR: 2,
    createGroundShadowView: vi.fn(
      (
        texture: { source: unknown; frame: unknown },
        tileTop: { x: number; y: number },
        _metrics: unknown,
        depth: number,
      ) => ({
        view: {
          cullable: false,
          source: "ground-shadow",
          groundShadow: true,
          texture,
          tileTop,
          visible: true,
          alpha: 1,
          destroy: vi.fn(),
        },
        depth,
      }),
    ),
    createSilhouettes: vi.fn(
      (views: { view: unknown; depth: number }[], box: { x: number; y: number; box: { elevation: number } }) => [
        {
          texture: { silhouetteOf: box.box },
          sources: [views[0].view],
          body: { bodyOf: box.box },
          bodyDisplay: { left: 0, top: 0, width: 1, height: 1 },
          depth: views[0].depth,
          worldFoot: { x: box.x, y: box.y },
          screenFoot: { x: 0, y: 0 },
          display: { left: 0, top: 0, width: 1, height: 1 },
        },
      ],
    ),
    // The shared caster sprites: `container.shown` is how many the last draw showed.
    createCasterSprites: vi.fn((filters: unknown[]) => {
      const sprites: Array<{ casterSprite: true; texture: unknown }> = [];
      const container = { filters, filterArea: undefined as unknown, shown: 0, children: sprites, destroy: vi.fn() };
      return {
        container,
        sprite: vi.fn((index: number, texture: unknown) => {
          const sprite = (sprites[index] ??= { casterSprite: true, texture });
          sprite.texture = texture;
          return sprite;
        }),
        show: vi.fn((count: number) => {
          container.shown = count;
        }),
        destroy: vi.fn(),
      };
    }),
    placeSilhouette: vi.fn(),
  };
}

/** A mock of `shadows/received-shadow`: one view per receiver, right after its own sprite. */
export function mockReceivedShadow() {
  return {
    createReceivedShadowRig: vi.fn((renderer: unknown, filters: unknown[]) => ({
      renderer,
      filters,
      destroy: vi.fn(),
    })),
    createReceivedShadows: vi.fn((receivers: { own: { sources: readonly unknown[]; depth: number } }[]) => ({
      views: receivers.map(({ own }) => ({
        view: { cullable: false, source: "received-shadow", receivedShadowOf: own.sources[0], destroy: vi.fn() },
        depth: own.depth,
      })),
      atlas: {},
      draw: vi.fn(),
      follow: vi.fn(),
      destroy: vi.fn(),
    })),
  };
}

type TickerListener = (ticker: { elapsedMS: number }) => void;

/** Minimal Pixi ticker: records listeners so a test can run a frame by hand. */
export const createTicker = () => {
  const listeners: { fn: TickerListener; priority: number }[] = [];
  return {
    listeners,
    add: vi.fn((fn: TickerListener, _context?: unknown, priority?: number) => {
      listeners.push({ fn, priority: priority ?? 0 });
    }),
    remove: vi.fn((fn: TickerListener) => {
      const index = listeners.findIndex((listener) => listener.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    }),
    frame: (elapsedMS = 16) => listeners.forEach(({ fn }) => fn({ elapsedMS })),
  };
};

/**
 * Runs frames until `check` passes (at most `limit`), letting what each frame started settle in
 * between: after the scene starts, a chunk is drawn over several frames, a module per frame.
 */
export async function frameUntil(ticker: { frame: () => void }, check: () => void, limit = 20): Promise<void> {
  for (let frame = 0; frame < limit; frame += 1) {
    try {
      check();
      return;
    } catch {
      // Not yet: run another frame.
    }
    ticker.frame();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  check();
}

/**
 * A render to texture as the mocked renderer saw it: its target, and a shallow copy of each child
 * of the container drawn, as it was then (modules draw many textures with the same sprites).
 */
export type RenderedDraw = {
  readonly container: unknown;
  readonly target: unknown;
  readonly clear: boolean;
  readonly children: ReadonlyArray<Record<string, unknown>>;
};

/** Minimal Pixi renderer: render-to-texture calls (also kept as `drawn`) and resize listeners. */
export const createRenderer = (resolution = 1) => {
  const listeners = new Map<string, Set<() => void>>();
  const drawn: RenderedDraw[] = [];
  return {
    resolution,
    screen: { x: 0, y: 0, width: 1300, height: 1000 },
    drawn,
    render: vi.fn((options: { container: { children?: unknown[] }; target: unknown; clear?: boolean }) => {
      const children = (options.container.children ?? []).map((child) => ({ ...(child as object) }));
      drawn.push({ container: options.container, target: options.target, clear: options.clear ?? true, children });
    }),
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

/** The world container as the mocked Pixi builds it. */
export type TestRoot = {
  isRenderGroup: boolean;
  eventMode: string;
  sortableChildren: boolean;
  /** The views in the order they are drawn, across the scene's depth bands. */
  children: TestView[];
  /** The depth bands: the world container's own children. */
  bands: Array<{ children: TestView[] }>;
  tint: number;
  tintWrites: number[];
  position: { x: number; y: number };
  scale: { x: number; y: number };
  destroy: ReturnType<typeof vi.fn>;
};

/** A view as the mocks build it. */
export type TestView = {
  source: string;
  cullable: boolean;
  destroy: ReturnType<typeof vi.fn>;
  x?: number;
  y?: number;
  position: { x: number; y: number; set: ReturnType<typeof vi.fn> };
  groundShadow?: boolean;
  receivedShadowOf?: unknown;
  tileTop?: { x: number; y: number };
  texture?: { source: unknown; frame: { x: number; y: number; width: number; height: number } };
  visible?: boolean;
  alpha?: number;
};

/** Terrain appearance for tests: the game's, without depending on its content. */
export const TEST_TERRAIN: TerrainAppearance = {
  grass: { textureSource: "/assets/grass/block.svg", tint: { kind: "height", topTint: 0xe8ffb0, step: 0.05 } },
  ground: { textureSource: "/assets/ground/block.svg", tint: { kind: "height", topTint: 0xe8ffb0, step: 0.05 } },
  water: { textureSource: "/assets/water/block.svg", tint: { kind: "depth", step: 0.15 } },
  sand: {
    textureSource: "/assets/sand/block.svg",
    tint: { kind: "height", topTint: 0xffffff, step: 0.05 },
    topInset: 0.5,
  },
};

/**
 * Renders `world` with `modules` through the real scene, on a fake app. Returns the app's parts,
 * the world container and the scene.
 */
export async function mountScene(
  world: World,
  modules: readonly SceneModule[],
  options: Partial<SceneOptions> & { readonly resolution?: number } = {},
) {
  const { createScene } = await import("../scene");
  const ticker = createTicker();
  const renderer = createRenderer(options.resolution);
  const stage: TestRoot[] = [];
  const app = {
    screen: renderer.screen,
    ticker,
    renderer,
    stage: { addChild: (child: TestRoot) => stage.push(child) },
  };
  const scene = await createScene(app as never, world, modules, { terrain: TEST_TERRAIN, ...options });
  return { app, ticker, renderer, root: drawnRoot(stage[0]), scene };
}

/**
 * `root` with `children` listing its views in draw order (the views of its depth bands, band by
 * band) and `bands` its own children.
 */
function drawnRoot(root: TestRoot): TestRoot {
  const bands = (root as unknown as { children: Array<{ children: TestView[] }> }).children;
  return new Proxy(root, {
    get: (target, key, receiver) => {
      if (key === "children") return bands.flatMap(({ children }) => children);
      if (key === "bands") return bands;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

/** Builds entities on the columns of a world. */
export type EntityFactory = (columns: readonly Box[]) => Entity[];

/** The parts the game registers: the clock (at the world start tick) and the player. */
export const testParts = (): WorldPartOf[] => [createClockPart(), createPlayerPart()];

/** Every column of a world's loaded chunks, chunk by chunk. */
export const columnsOf = (world: World): Box[] => [...world.chunks.values()].flatMap(({ columns }) => columns);

/** Every entity of a world's loaded chunks, chunk by chunk. */
export const entitiesOf = (world: World): Entity[] => [...world.chunks.values()].flatMap(({ entities }) => entities);

/** A world of fixed `columns` and the entities `createEntities` puts on them, every chunk loaded. */
function fixedWorld(
  columns: readonly Box[],
  createEntities: EntityFactory,
  parts: readonly WorldPartOf[],
  seed: number,
): World {
  const xs = columns.map(({ x }) => x);
  const ys = columns.map(({ y }) => y);
  const bounds: WorldRect = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
  const world = createWorld({
    seed,
    bounds,
    source: createFixedChunkSource(columns, createEntities(columns)),
    parts,
  });
  chunksInRect(bounds).forEach((coord) => world.chunks.load(coord));
  return world;
}

/**
 * The generated default terrain of one chunk (32 × 32 columns, no configured entities) with test
 * entities on top, and the game's parts (`testParts()`) created on that ground.
 */
export const defaultWorld = (createEntities: EntityFactory = () => []): World => {
  const area = { minX: 0, minY: 0, maxX: 31, maxY: 31 };
  const columns = generateTerrainColumns(area, { seed: DEFAULT_WORLD_SEED, clip: area });
  return fixedWorld(columns, createEntities, testParts(), DEFAULT_WORLD_SEED);
};

/** A world built from explicit terrain points, for precise material checks. */
export const worldFrom = (points: TerrainPoint[], createEntities: EntityFactory = () => []): World => {
  // The clock at tick 0 and the player on column (0, 0), wherever it would spawn.
  const player: WorldPartOf = { ...createPlayerPart(), create: (ground) => createPlayer(ground, { x: 0, y: 0 }) };
  return fixedWorld(createTerrainColumns(points), createEntities, [createClockPart(0), player], 0);
};

/** One two-tile statue on the first column. */
export const createTestEntities: EntityFactory = (boxes) =>
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

/** Two houses of different types, each with colour variants. */
export const createColorizedEntities: EntityFactory = (boxes) =>
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
          colorReplacements: { "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] },
        },
        box.elevation,
      ),
  );
