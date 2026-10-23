import { type Application, Assets, Container, type Texture, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import { CAMERA_MAX_ZOOM } from "../camera";
import { BOX_HEIGHT, TILE_HEIGHT, TILE_METRICS, TILE_WIDTH } from "../constants";
import { CellMap } from "../grid";
import { addInDepthOrder, getSvgResolution } from "../render";
import type { World } from "../world";
import type { TerrainAppearance } from "../../types";
import type {
  BuiltScene,
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

/** Options of {@link createScene}. */
export type SceneOptions = {
  /** How each terrain material is drawn (game content, e.g. `TERRAIN_APPEARANCE`). */
  readonly terrain: TerrainAppearance;
  /**
   * Fraction of the next simulation tick already elapsed (`getInterpolationAlpha()`), read every
   * frame and passed to the modules as `frame.alpha`. Defaults to `1`.
   */
  readonly interpolation?: () => number;
};

/** A rendered world: the services its modules provide, and the cleanup that destroys it. */
export type Scene = {
  /** Services the modules provided (e.g. `camera`), for the app to bind controls to. */
  readonly services: Partial<SceneServices>;
  /** Destroys the scene: stops its frames, destroys its modules in reverse order and unloads its assets. */
  readonly destroy: () => void;
};

/**
 * Renders `world` into `app` with `modules`: the scene draws nothing itself. It sets the modules
 * up in list order (each one may read the services of those before it), adds all their views to
 * one world container in draw order, starts them and runs their `update()` every frame.
 *
 * The world container is a render group (its tint and its transform are applied on the GPU) and
 * takes no pointer events. Views are added once, sorted by depth and then by layer
 * (`SCENE_LAYER`), never with `zIndex` or `sortableChildren`, and every one is `cullable`:
 * culling is the camera's, on demand.
 *
 * Frames come from one `app.ticker` listener at `UPDATE_PRIORITY.NORMAL`: after the simulation
 * (`HIGH`), before the Application renders (`LOW`).
 *
 * @throws When two modules share an id (before anything is created); when a module `requires` a
 * service no earlier module provides, provides one an earlier module already provides, or its
 * setup fails (the modules already set up are destroyed first).
 */
export async function createScene(
  app: Application,
  world: World,
  modules: readonly SceneModule[],
  options: SceneOptions,
): Promise<Scene> {
  const twin = modules.find(({ id }, index) => modules.findIndex((other) => other.id === id) !== index);
  if (twin) throw new Error(`Scene module id "${twin.id}" is used twice`);

  const root = new Container({ isRenderGroup: true });
  root.eventMode = "none";
  app.stage.addChild(root);

  const loaded = new Set<string>();
  const resolution = getSvgResolution(TILE_WIDTH * CAMERA_MAX_ZOOM, app.renderer.resolution);
  const services: Partial<SceneServices> = {};
  const providers = new Map<SceneServiceKey, string>();
  const columnAt = CellMap.from(world.columns, (column) => column);
  const xs = world.columns.map(({ x }) => x);
  const ys = world.columns.map(({ y }) => y);
  const context: SceneContext = {
    app,
    world,
    root,
    projection: { tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT, elevationStep: BOX_HEIGHT, originX: 0, originY: 0 },
    metrics: TILE_METRICS,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
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
  const unload = () => loaded.forEach((source) => void Assets.unload(source));
  const teardown = () => {
    [...parts].reverse().forEach((part) => part.destroy());
    root.destroy({ children: true });
    unload();
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
  } catch (error) {
    teardown();
    throw error;
  }

  const ordered = sortViews(parts.flatMap(({ views = [] }) => views));
  ordered.forEach(({ view }) => {
    view.cullable = true;
  });
  addInDepthOrder(root, ordered);

  const depths = ordered.map(({ depth }) => depth);
  const built: BuiltScene = {
    placeAt: (view: Container, depth: number) => root.addChildAt(view, indexAfter(depths, depth)),
  };
  parts.forEach((part) => part.start?.(built));

  const onFrame = (ticker: Ticker) => {
    const frame: SceneFrame = {
      tick: world.clock.tick,
      elapsedMs: ticker.elapsedMS,
      alpha: options.interpolation?.() ?? 1,
    };
    parts.forEach((part) => part.update?.(frame));
  };
  app.ticker.add(onFrame, undefined, UPDATE_PRIORITY.NORMAL);

  return {
    services,
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
