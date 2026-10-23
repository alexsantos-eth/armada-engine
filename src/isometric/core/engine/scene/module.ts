import type { Application, Container, Texture } from "pixi.js";
import type { Entity } from "../entities";
import type { ReadonlyCellMap } from "../grid";
import type { DepthView } from "../render";
import type { Box } from "../terrain";
import type { World } from "../world";
import type {
  GridPoint,
  IsoProjectionConfig,
  IsoScreenBox,
  SceneCamera,
  TerrainAppearance,
  TileMetrics,
  WorldRect,
} from "../../types";

/**
 * Where a view goes among the views of the same depth (the same column and elevation): the
 * terrain block, then what lies on it, then what stands on it, then what lies on that.
 */
export type SceneLayer = 0 | 1 | 2 | 3;

/** A world view with its draw depth and its {@link SceneLayer}. */
export type SceneView = DepthView & { readonly layer: SceneLayer };

/** An entity with the views `entity-view` drew for it. */
export type EntityView = {
  readonly entity: IsoScreenBox<Entity>;
  readonly views: readonly DepthView[];
};

/** What the camera starts on when nothing else says (the player). */
export type SceneFocus = {
  /** Ground point to look at. */
  ground(): GridPoint;
};

/**
 * What modules share with each other, by name. A module provides a service from `setup()`
 * (`provides`) and the modules after it read it from {@link SceneContext.services}: modules never
 * import each other.
 */
export type SceneServices = {
  /** The scene's camera (`camera-view`). */
  readonly camera: SceneCamera;
  /** Every entity with its views (`entity-view`), e.g. to cast shadows from them. */
  readonly entityViews: readonly EntityView[];
  /** What the camera starts on (`player-view`). */
  readonly focus: SceneFocus;
};

/** Name of a {@link SceneServices} entry. */
export type SceneServiceKey = keyof SceneServices;

/** The services provided so far. */
export type SceneServiceRegistry = {
  /** The service, or `undefined` when no module provides it: optional services degrade. */
  get<K extends SceneServiceKey>(key: K): SceneServices[K] | undefined;
};

/** SVG loading shared by the modules: same resolution for all, unloaded with the scene. */
export type SceneAssets = {
  /**
   * Loads an SVG rasterized at the size it is drawn at the largest zoom, with mipmaps. The
   * scene unloads it when destroyed. Resolves `undefined` when the asset cannot be used.
   */
  loadSvg(source: string): Promise<Texture | undefined>;
};

/** What every module receives: the world it draws and what the scene shares. */
export type SceneContext = {
  readonly app: Application;
  /** The world to draw. Only read: the scene never changes it. */
  readonly world: World;
  /** The world container (a render group): its children are the views, in draw order. */
  readonly root: Container;
  /** Ground `(0, 0)` at scene `(0, 0)`. */
  readonly projection: IsoProjectionConfig;
  readonly metrics: TileMetrics;
  /** Inclusive rectangle of the world's columns. */
  readonly bounds: WorldRect;
  /** The top block of each column (its elevation and, as `type`, its surface). */
  readonly columnAt: ReadonlyCellMap<Box>;
  /** How each terrain material is drawn (game content). */
  readonly terrain: TerrainAppearance;
  /** Blocks the top of column `(x, y)` sits below its cell (its material's `topInset`); `0` off the world. */
  readonly topInsetAt: (x: number, y: number) => number;
  readonly assets: SceneAssets;
  readonly services: SceneServiceRegistry;
};

/** One frame of the scene, after the simulation stepped. */
export type SceneFrame = {
  /** World tick now. */
  readonly tick: number;
  /** Real milliseconds since the last frame. */
  readonly elapsedMs: number;
  /** Fraction of the next tick already elapsed, to draw between ticks. */
  readonly alpha: number;
};

/** The scene once every view is in place. */
export type BuiltScene = {
  /**
   * Puts `view` in the draw order right after every view at `depth` or closer to the back (moved
   * if already there). For views that move between columns; never with `zIndex`.
   */
  placeAt(view: Container, depth: number): void;
};

/** What a module adds to the scene. Everything is optional but `destroy()`. */
export type SceneModulePart = {
  /** Views added once, in draw order, `cullable`, with every other module's. */
  readonly views?: readonly SceneView[];
  /** Services for the modules after it. */
  readonly provides?: Partial<SceneServices>;
  /** Called once every view is in the scene, in module order. */
  start?(scene: BuiltScene): void;
  /** Called every frame, in module order. */
  update?(frame: SceneFrame): void;
  /** Frees what the module created outside the world container (which the scene destroys). */
  destroy(): void;
};

/**
 * A part of the scene (terrain, entities, shadows, light, camera, player…), in its own engine
 * module. The scene sets them up in list order, so a module can read the services of the ones
 * before it; a module without a service it `requires` fails with a clear error, and one that
 * only reads optional services keeps working without them.
 */
export type SceneModule = {
  /** Unique name, for errors and `?modules=`. */
  readonly id: string;
  /** Services that must be provided by an earlier module. */
  readonly requires?: readonly SceneServiceKey[];
  setup(context: SceneContext): SceneModulePart | Promise<SceneModulePart>;
};
