import { type Application, Assets, Container, type Texture, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { CAMERA_MAX_ZOOM } from "../camera";
import { BOX_HEIGHT, TILE_HEIGHT, TILE_METRICS, TILE_WIDTH } from "../constants";
import { CHUNK_SIZE, chunkKey, MAX_GRID_COORD } from "../grid";
import { addInDepthOrder, getSvgResolution } from "../render";
import { CLOCK_PART } from "../time";
import type { World, WorldChunk } from "../world";
import type { ChunkCoord, ChunkKey, TerrainAppearance, WorldRect } from "../../types";
import type {
  BuiltScene,
  SceneChunkPart,
  SceneContext,
  SceneFrame,
  SceneModule,
  SceneModulePart,
  SceneServiceKey,
  SceneServices,
  SceneView,
} from "./module";

/** The {@link SceneLayer}s, by what they hold. */
export const SCENE_LAYER = {
  /** Terrain blocks. */
  terrain: 0,
  /** What lies on a terrain top: its shadows. */
  ground: 1,
  /** What stands on the terrain: entities. */
  object: 2,
  /** What lies on what stands: the shadows entities receive. */
  onObject: 3,
} as const;

/**
 * Chunks the scene starts showing per frame once it is built, so walking or panning into new
 * ground never builds several chunks in one frame. The first chunks are all shown before the
 * scene starts.
 */
export const CHUNKS_SHOWN_PER_FRAME = 1;

/**
 * Where the camera of an unbounded world may go: all of the grid but a margin of chunks at its far
 * edges, so the chunks loaded around the camera always have keys.
 */
export const UNBOUNDED_CAMERA_BOUNDS: WorldRect = {
  minX: -(MAX_GRID_COORD - 4 * CHUNK_SIZE),
  minY: -(MAX_GRID_COORD - 4 * CHUNK_SIZE),
  maxX: MAX_GRID_COORD - 4 * CHUNK_SIZE,
  maxY: MAX_GRID_COORD - 4 * CHUNK_SIZE,
};

/** Options of {@link createScene}. */
export type SceneOptions = {
  /** How each terrain material is drawn (game content, e.g. `TERRAIN_APPEARANCE`). */
  readonly terrain: TerrainAppearance;
  /**
   * Fraction of the next simulation tick already elapsed (`getInterpolationAlpha()`), read every
   * frame and passed to the modules as `frame.alpha`. Defaults to `1`.
   */
  readonly interpolation?: () => number;
  /**
   * Called when the scene is built and on every frame, before it shows or hides chunks, with the
   * chunks the camera sees (nearest first): the app loads them, and what else the game needs,
   * into the world (`world.chunks.stream()`). The scene itself never loads chunks: without it, it
   * shows the chunks the world has loaded.
   */
  readonly stream?: (visible: readonly ChunkCoord[]) => void;
};

/** A rendered world: the services its modules provide, and the cleanup that destroys it. */
export type Scene = {
  /** Services the modules provided (e.g. `camera`), for the app to bind controls to. */
  readonly services: Partial<SceneServices>;
  /** Keys of the chunks shown now. */
  readonly shownChunks: () => ChunkKey[];
  /** Destroys the scene: stops its frames, destroys its modules in reverse order and unloads its assets. */
  readonly destroy: () => void;
};

/** A chunk the scene shows: what each module drew for it. */
type ShownChunk = {
  readonly chunk: WorldChunk;
  readonly parts: readonly SceneChunkPart[];
  readonly views: readonly SceneView[];
};

/**
 * Renders `world` into `app` with `modules`: the scene draws nothing itself. It sets the modules
 * up in list order (each one may read the services of those before it), then shows the world
 * chunk by chunk: every chunk the camera sees (`camera.visibleChunks()`, or every loaded chunk
 * without a camera) once the world has loaded it and its neighbours (`world.chunks.isReady()`).
 * Each module draws its part of a chunk (`showChunk()`), and the chunk's views come and go
 * together. The chunks in view when the scene is built are all shown before the modules start;
 * after that, {@link CHUNKS_SHOWN_PER_FRAME} per frame, nearest first, and a chunk is hidden once
 * it is neither in view nor next to a chunk in view, or its ground is no longer loaded.
 *
 * The world container is a render group (its tint and its transform are applied on the GPU) and
 * takes no pointer events. Views are kept sorted by depth and then by layer (`SCENE_LAYER`), never
 * with `zIndex` or `sortableChildren`, and every one is `cullable`: culling is the camera's, on
 * demand, and runs again whenever a chunk is shown.
 *
 * Frames come from one `app.ticker` listener at `UPDATE_PRIORITY.NORMAL`: after the simulation
 * (`HIGH`), before the Application renders (`LOW`). Each frame streams and shows chunks first,
 * then runs the modules' `update()`.
 *
 * Frames carry the tick of the world's clock (`CLOCK_PART`), so the world needs one.
 *
 * @throws When two modules share an id, or the world has no clock part (before anything is
 * created); when a module `requires` a service no earlier module provides, provides one an
 * earlier module already provides, or its setup fails (the modules already set up are destroyed
 * first).
 */
export async function createScene(
  app: Application,
  world: World,
  modules: readonly SceneModule[],
  options: SceneOptions,
): Promise<Scene> {
  const twin = modules.find(({ id }, index) => modules.findIndex((other) => other.id === id) !== index);
  if (twin) throw new Error(`Scene module id "${twin.id}" is used twice`);
  const clock = world.parts.get(CLOCK_PART);

  const root = new Container({ isRenderGroup: true });
  root.eventMode = "none";
  app.stage.addChild(root);

  const loaded = new Set<string>();
  const resolution = getSvgResolution(TILE_WIDTH * CAMERA_MAX_ZOOM, app.renderer.resolution);
  const services: Partial<SceneServices> = {};
  const providers = new Map<SceneServiceKey, string>();
  const columnAt = world.columnIndex;
  const context: SceneContext = {
    app,
    world,
    root,
    projection: { tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT, elevationStep: BOX_HEIGHT, originX: 0, originY: 0 },
    metrics: TILE_METRICS,
    bounds: world.bounds ?? UNBOUNDED_CAMERA_BOUNDS,
    columnAt,
    terrain: options.terrain,
    topInsetAt: (x, y) => {
      const column = columnAt.get(x, y);
      return column === undefined ? 0 : (options.terrain[column.type].topInset ?? 0);
    },
    assets: {
      // Mipmaps keep the edges smooth when the camera zooms out and the texture is drawn smaller.
      loadSvg: (src) => {
        loaded.add(src);
        return Assets.load<Texture>({ src, data: { resolution, autoGenerateMipmaps: true } });
      },
    },
    services: { get: (key) => services[key] },
  };

  const parts: SceneModulePart[] = [];
  const shown = new Map<ChunkKey, ShownChunk>();
  let destroyed = false;
  const hideChunk = (entry: ShownChunk) => {
    shown.delete(entry.chunk.key);
    [...entry.parts].reverse().forEach((part) => part.destroy?.());
    built.remove(entry.views);
  };
  const unload = () => loaded.forEach((source) => void Assets.unload(source));
  const teardown = () => {
    destroyed = true;
    [...shown.values()].reverse().forEach(hideChunk);
    [...parts].reverse().forEach((part) => part.destroy());
    root.destroy({ children: true });
    unload();
  };

  // The views in `root`, in the order of its children.
  let order: SceneView[] = [];
  const takeOut = (view: SceneView["view"]) => {
    const index = order.findIndex((entry) => entry.view === view);
    if (index >= 0) order.splice(index, 1);
  };
  const built: BuiltScene = {
    placeAt: (view, depth) => {
      takeOut(view);
      const index = indexAfter(
        order.map((entry) => entry.depth),
        depth,
      );
      order.splice(index, 0, { view, depth, layer: SCENE_LAYER.object });
      root.addChildAt(view, index);
    },
    add: (views) => {
      if (views.length === 0) return;
      views.forEach(({ view }) => {
        view.cullable = true;
      });
      order = sortViews([...order, ...views]);
      // Re-added in one pass: cheaper than inserting thousands of views one by one.
      root.removeChildren();
      addInDepthOrder(root, order);
    },
    remove: (views) => {
      if (views.length === 0) return;
      const gone = new Set(views.map(({ view }) => view));
      order = order.filter(({ view }) => !gone.has(view));
      views.forEach(({ view }) => {
        root.removeChild(view);
        view.destroy();
      });
    },
  };

  /** What the module parts draw for `chunk`, in module order; `undefined` once the scene is gone. */
  const drawChunk = async (chunk: WorldChunk): Promise<ShownChunk | undefined> => {
    const chunkParts: SceneChunkPart[] = [];
    for (const part of parts) {
      const drawn = await part.showChunk?.(chunk);
      if (drawn) chunkParts.push(drawn);
    }
    const entry: ShownChunk = { chunk, parts: chunkParts, views: chunkParts.flatMap(({ views = [] }) => views) };
    if (!destroyed) return entry;
    [...chunkParts].reverse().forEach((part) => part.destroy?.());
    entry.views.forEach(({ view }) => view.destroy());
    return undefined;
  };

  /** Chunks to show: in view (nearest first) and ready. */
  const wanted = () => {
    const visible = services.camera?.visibleChunks() ?? [...world.chunks.values()].map(({ coord }) => coord);
    options.stream?.(visible);
    return { visible, ready: visible.filter((coord) => world.chunks.isReady(coord)) };
  };

  try {
    for (const module of modules) {
      const missing = module.requires?.find((key) => services[key] === undefined);
      if (missing !== undefined) {
        throw new Error(`Scene module "${module.id}" requires the "${missing}" service`);
      }
      const part = await module.setup(context);
      parts.push(part);
      // A service has one owner: two modules providing it would silently replace each other.
      const provided = Object.keys(part.provides ?? {}) as SceneServiceKey[];
      const taken = provided.find((key) => providers.has(key));
      if (taken !== undefined) {
        throw new Error(
          `Scene module "${module.id}" provides the "${taken}" service, already provided by "${providers.get(taken)}"`,
        );
      }
      provided.forEach((key) => providers.set(key, module.id));
      Object.assign(services, part.provides);
    }

    const first: SceneView[] = parts.flatMap(({ views = [] }) => views);
    for (const coord of wanted().ready) {
      const entry = (await drawChunk(world.chunks.get(coord) as WorldChunk)) as ShownChunk;
      shown.set(entry.chunk.key, entry);
      first.push(...entry.views);
    }
    first.forEach(({ view }) => {
      view.cullable = true;
    });
    order = sortViews(first);
    addInDepthOrder(root, order);
  } catch (error) {
    teardown();
    throw error;
  }

  parts.forEach((part) => part.start?.(built));

  // One chunk is drawn at a time, over as many frames as its modules need.
  let drawing: ChunkKey | undefined;
  const syncChunks = () => {
    const { visible, ready } = wanted();
    const inView = new Set(visible.map(({ cx, cy }) => chunkKey(cx, cy)));
    const nearView = ({ cx, cy }: ChunkCoord) =>
      [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => inView.has(chunkKey(cx + dx, cy + dy))));
    [...shown.values()]
      .filter(({ chunk }) => !world.chunks.isReady(chunk.coord) || !nearView(chunk.coord))
      .forEach(hideChunk);

    if (drawing !== undefined) return;
    ready
      .filter(({ cx, cy }) => !shown.has(chunkKey(cx, cy)))
      .slice(0, CHUNKS_SHOWN_PER_FRAME)
      .forEach((coord) => {
        const chunk = world.chunks.get(coord) as WorldChunk;
        drawing = chunk.key;
        void drawChunk(chunk).then((entry) => {
          drawing = undefined;
          if (!entry) return;
          shown.set(chunk.key, entry);
          built.add(entry.views);
          services.camera?.resize();
        });
      });
  };

  const onFrame = (ticker: Ticker) => {
    syncChunks();
    const frame: SceneFrame = {
      tick: clock.tick,
      elapsedMs: ticker.elapsedMS,
      alpha: options.interpolation?.() ?? 1,
    };
    parts.forEach((part) => part.update?.(frame));
  };
  app.ticker.add(onFrame, undefined, UPDATE_PRIORITY.NORMAL);

  return {
    services,
    shownChunks: () => [...shown.keys()],
    destroy: () => {
      app.ticker.remove(onFrame, undefined);
      teardown();
    },
  };
}

/** `views` by depth, then layer; views of the same depth and layer keep their order. */
export function sortViews(views: readonly SceneView[]): SceneView[] {
  return [...views].sort((a, b) => a.depth - b.depth || a.layer - b.layer);
}

/** Index of the first of the ascending `depths` past `depth`. */
export function indexAfter(depths: readonly number[], depth: number): number {
  let low = 0;
  let high = depths.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (depths[middle] <= depth) low = middle + 1;
    else high = middle;
  }
  return low;
}
