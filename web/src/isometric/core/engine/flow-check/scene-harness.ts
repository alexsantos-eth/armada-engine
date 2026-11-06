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
import { SHADOW_BLUR, SHADOW_MAP_PIXELS_PER_TILE } from "../lighting";
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
  cell?: unknown;
}> = [];

/** Every mocked Pixi `Container` created, in order. */
export const containers: unknown[] = [];

/** Clears what the mocks recorded. Call it in `beforeEach`, before `vi.clearAllMocks()`. */
export function resetHarness(): void {
  loadedTextures.clear();
  renderCalls.length = 0;
  containers.length = 0;
  sheetFrames.clear();
}

/** The default implementation of the mocked `Assets.load`. */
export const loadTexture = (asset: string | { src: string }) => {
  const source = typeof asset === "string" ? asset : asset.src;
  const texture = { source, frame: { x: 0, y: 0, width: 16, height: 16 } };
  loadedTextures.set(source, texture);
  return Promise.resolve(texture);
};

let makeSprite: (texture: unknown) => object;

/** A mock of the parts of `pixi.js` the scene and its modules use. */
export function mockPixi() {
  class Container {
    public sortableChildren = false;
    public children: unknown[] = [];
    public isRenderGroup: boolean;
    public tintWrites: number[] = [];
    public filters: unknown[] | undefined;
    public setMask = vi.fn();
    public filterArea: unknown;
    public visibleWrites: boolean[] = [];
    public eventMode = "passive";
    public position = { x: 0, y: 0, set: vi.fn((x: number, y: number) => Object.assign(this.position, { x, y })) };
    public skew = { x: 0, y: 0 };
    public scale = {
      x: 1,
      y: 1,
      value: 1,
      set: vi.fn((value: number, y: number = value) => Object.assign(this.scale, { x: value, y, value })),
    };
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

  class Sprite extends Container {
    public setSize = vi.fn();
    public setFromMatrix = vi.fn();
    public texture: unknown;
    public anchor = { x: 0, y: 0, set: vi.fn((x: number, y: number) => Object.assign(this.anchor, { x, y })) };
    public localTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    public updateLocalTransform = vi.fn();
    public width = 30;
    public height = 30;
    constructor(texture?: unknown) {
      super();
      this.texture = texture;
    }
  }
  makeSprite = (texture) => new Sprite(texture);

  class TilingSprite extends Sprite {
    public tilePosition = {
      x: 0,
      y: 0,
      set: vi.fn((x: number, y: number) => Object.assign(this.tilePosition, { x, y })),
    };
    public tileScale = { x: 1, y: 1, set: vi.fn((x: number, y: number) => Object.assign(this.tileScale, { x, y })) };
    public alpha = 1;
    constructor(options: { texture: unknown; width: number; height: number }) {
      super(options.texture);
      this.width = options.width;
      this.height = options.height;
    }
  }

  return {
    Assets: { load: vi.fn(loadTexture), unload: vi.fn(() => Promise.resolve(undefined)) },
    Container,
    Graphics: class extends Container {
      public alpha = 1;
      public cullable = true;
      public rect = vi.fn(() => this);
      public poly = vi.fn(() => this);
      public fill = vi.fn(() => this);
      /** The shared geometry it draws, when made from a `GraphicsContext`. */
      public context: unknown;

      constructor(context?: unknown) {
        super();
        this.context = context;
      }
    },
    GraphicsContext: class {
      public poly = vi.fn(() => this);
      public fill = vi.fn(() => this);
      public destroy = vi.fn();
    },
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
      public dynamic: boolean;
      public destroy = vi.fn();
      public updateUvs = vi.fn();
      constructor({ source, frame, dynamic = false }: { source: unknown; frame?: unknown; dynamic?: boolean }) {
        this.source = source;
        this.frame = frame;
        this.dynamic = dynamic;
      }
    },
    Sprite,
    TilingSprite,
    Matrix: class {
      public a: number;
      public b: number;
      public c: number;
      public d: number;
      public tx: number;
      public ty: number;
      constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.tx = tx;
        this.ty = ty;
      }
    },
    MeshSimple: class extends Container {
      public autoUpdate = true;
      public geometry: {
        uvs: Float32Array;
        positions: Float32Array;
        indices: Uint32Array;
        getBuffer: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      constructor(options: { uvs: Float32Array; vertices: Float32Array; indices: Uint32Array }) {
        super();
        this.geometry = {
          positions: options.vertices,
          indices: options.indices,
          uvs: options.uvs,
          getBuffer: vi.fn(() => ({ update: vi.fn() })),
          destroy: vi.fn(),
        };
      }
    },
    BufferImageSource: class {
      public options: { resource: Uint8ClampedArray; width: number; height: number };
      public resource: Uint8ClampedArray;
      public update = vi.fn();
      constructor(options: { resource: Uint8ClampedArray; width: number; height: number }) {
        this.options = options;
        this.resource = options.resource;
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
      create: vi.fn((options: { width: number; height: number; resolution?: number }) => ({
        ...options,
        source: { renderTarget: true, resolution: options.resolution ?? 1 },
        resize: vi.fn(function (
          this: { width: number; height: number; source: { resolution: number } },
          width: number,
          height: number,
          resolution: number,
        ) {
          this.width = width;
          this.height = height;
          this.source.resolution = resolution;
        }),
        destroy: vi.fn(),
      })),
    },
    UPDATE_PRIORITY: { HIGH: 50, NORMAL: 0, LOW: -50 },
  };
}

/** Cells the mocked `getSheetFrames()` cut, by sheet. */
const sheetFrames = new Map<unknown, Array<Array<{ source: string; row: number; column: number }>>>();

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
        cell,
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
        cell?: unknown;
      }) => {
        renderCalls.push({ texture, elevation: box.box.elevation, tint, height, length, splitAt, cell });
        const position = {
          x: box.screenX,
          y: box.screenY - 30,
          set: vi.fn((x: number, y: number) => Object.assign(position, { x, y })),
        };
        const scale: { x: number; y: number; set: (x: number, y?: number) => void } = {
          x: 1,
          y: 1,
          set: vi.fn((x: number, y: number = x) => {
            Object.assign(scale, { x, y });
          }),
        };
        return [
          {
            view: Object.assign(makeSprite(texture), {
              cullable: false,
              source: texture.source,
              texture,
              x: box.x,
              y: box.y,
              position,
              scale,
              destroy: vi.fn(),
            }),
            depth: box.baseScreenY,
          },
        ];
      },
    ),
    getBlockDepth: vi.fn((box: { baseScreenY: number }) => box.baseScreenY),
    // A sheet's cells as `{ source, row, column }`, made once per sheet like the real one.
    getSheetFrames: vi.fn((texture: { source: string }, layout: { columns: number; rows: number }) => {
      const cut =
        sheetFrames.get(texture) ??
        Array.from({ length: layout.rows }, (_, row) =>
          Array.from({ length: layout.columns }, (_, column) => ({
            source: texture.source,
            row,
            column,
            frame: { x: 0, y: 0, width: 16, height: 16 },
          })),
        );
      sheetFrames.set(texture, cut);
      return cut;
    }),
    showFrame: vi.fn((view: { texture?: unknown }, texture: unknown) => {
      view.texture = texture;
    }),
    // A pool that keeps what it is given, to check what modules give back.
    createSpritePool: vi.fn(() => {
      const kept: unknown[] = [];
      return {
        kept,
        take: vi.fn((texture: unknown) => makeSprite(texture)),
        give: vi.fn((views: readonly unknown[]) => kept.push(...views)),
        destroy: vi.fn(),
      };
    }),
    getSvgResolution: vi.fn(
      (tileWidth: number, resolution = 1, detail = 1.5) => (tileWidth * resolution * detail) / 1024,
    ),
    releaseSvgPixels: vi.fn(),
  };
}

/** A mock of `shadows/silhouette`: ground shadow views and one silhouette per entity, marked for tests. */
export function mockSilhouette() {
  return {
    SHADOW_MAP_PIXELS_PER_TILE,
    SHADOW_BLUR,
    cropSilhouetteAbove: vi.fn((shape: { display: { height: number } }, below: number) =>
      below <= 0
        ? shape
        : shape.display.height > below
          ? { ...shape, display: { ...shape.display, height: shape.display.height - below } }
          : undefined,
    ),
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
          body: (views[0].view as { texture: unknown }).texture,
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
      const container = {
        filters,
        filterArea: undefined as unknown,
        shown: 0,
        children: sprites,
        destroy: vi.fn(),
        addChild: vi.fn(),
      };
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
    // Records where a ground shadow view was laid, as `createGroundShadowView()` does.
    placeGroundShadowView: vi.fn((view: { tileTop?: unknown }, tileTop: { x: number; y: number }) => {
      view.tileTop = tileTop;
    }),
    createMovingSilhouette: vi.fn(
      (sprite: unknown, screenFoot: { x: number; y: number }, worldFoot: { x: number; y: number }) => ({
        texture: { movingSilhouetteOf: sprite },
        sources: [sprite],
        body: { bodyOf: sprite },
        bodyDisplay: { left: 0, top: 0, width: 1, height: 1 },
        depth: 0,
        worldFoot,
        screenFoot,
        display: { left: 0, top: 0, width: 1, height: 1 },
      }),
    ),
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
      atlas: {
        width: 1,
        height: 1,
        source: { resolution: 1 },
        resize: vi.fn(function (
          this: { source: { resolution: number } },
          _width: number,
          _height: number,
          resolution: number,
        ) {
          this.source.resolution = resolution;
        }),
      },
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
    extract: { pixels: vi.fn(() => ({ pixels: new Uint8ClampedArray(64 * 64 * 4).fill(255) })) },
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
  culled?: boolean;
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
  path: { textureSource: "/assets/path/block.svg", tint: { kind: "height", topTint: 0xe8ffb0, step: 0.05 } },
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
    stage: {
      addChild: (child: TestRoot) => stage.push(child),
      removeChild: (child: TestRoot) => stage.splice(stage.indexOf(child), 1),
    },
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

/** Wall atlas mock for shadow orchestration tests; its projection and lifecycle have their own tests. */
export function mockTerrainFaces() {
  return {
    createTerrainFaceShadows: vi.fn(() => ({
      views: [],
      levels: [],
      clear: vi.fn(),
      begin: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
      draw: vi.fn(),
      destroy: vi.fn(),
    })),
  };
}
