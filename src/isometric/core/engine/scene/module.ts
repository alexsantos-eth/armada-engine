import type { Application, Container, Texture } from "pixi.js";
import type { Entity } from "../entities";
import type { ReadonlyCellMap } from "../grid";
import type { DepthView } from "../render";
import type { Box } from "../terrain";
import type { World, WorldChunk } from "../world";
import type {
  ChunkKey,
  GridPoint,
  IsoProjectionConfig,
  IsoScreenBox,
  SceneCamera,
  TerrainAppearance,
  TerrainMaterial,
  TileMetrics,
  WorldRect,
} from "../../types";

/**
 * Where a view goes among the views of the same depth (the same column and elevation): the
 * terrain block, then what lies on it, then what stands behind the centre of what stands on it,
 * then what stands on it, then what lies on that.
 */
export type SceneLayer = 0 | 1 | 2 | 3 | 4;

/** A world view with its draw depth and its {@link SceneLayer}. */
export type SceneView = DepthView & { readonly layer: SceneLayer };

/** The scene's camera as the scene uses it: a {@link SceneCamera} that can also cull a few views. */
export type SceneCameraService = SceneCamera & {
  /**
   * Culls only `views`, just added to the scene, against what the camera shows now: the rest is
   * as the last cull left it, and culling the whole scene again took ~20 ms with the zoom out.
   */
  cullViews(views: readonly SceneView[]): void;
};

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
  readonly camera: SceneCameraService;
  /**
   * The entities of every shown chunk with their views (`entity-view`), by chunk key, e.g. to cast
   * shadows from them. A chunk is in it from its `showChunk()` in `entity-view` until it is hidden.
   */
  readonly entityViews: ReadonlyMap<ChunkKey, readonly EntityView[]>;
  /** What the camera starts on (`player-view`). */
  readonly focus: SceneFocus;
  /** What moves and casts a shadow of its own, e.g. to lay it on the ground (`player-view`: the player). */
  readonly movingCasters: readonly SceneMovingCaster[];
  /** Textures that replace a terrain material's own, block by block (`surface-bands`: the animated water). */
  readonly terrainSurfaces: SceneTerrainSurfaces;
};

/** Something that moves through the scene and casts a shadow: its sprite and where its feet are. */
export type SceneMovingCaster = {
  /** Its sprite in the scene: its silhouette is what casts the shadow. */
  readonly view: Container;
  /** Applies terrain shadowing to the moving sprite, when it can receive it. */
  readonly receiveTerrainShadow?: (alpha: number) => void;
  /** Optional height-resolved shadow rows, bottom first, in final opacity. */
  readonly receiveTerrainShadowBands?: (alpha: ArrayLike<number>) => void;
  /**
   * Where its feet are as drawn this frame: `ground` in world columns with the top elevation of
   * the column it stands on, and `screen` that point in scene pixels.
   */
  foot(): {
    readonly ground: { readonly x: number; readonly y: number; readonly elevation: number };
    readonly screen: { readonly x: number; readonly y: number };
  };
};

/** Textures for terrain blocks, provided by a module that draws them (e.g. animated). */
export type SceneTerrainSurfaces = {
  /**
   * The texture of the block of `material` at column `(x, y)` and `elevation`, or `undefined` to
   * draw it with its material's own texture.
   */
  textureAt(material: TerrainMaterial, x: number, y: number, elevation: number): Texture | undefined;
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
   * Loads an SVG rasterized at the size it is drawn at the largest zoom, with mipmaps, always
   * with Pixi's SVG parser (so a `blob:` URL from `createSvgColorVariant()` loads too). The
   * scene unloads it when destroyed. Resolves `undefined` when the asset cannot be used.
   *
   * `options.scale` is the largest size it is drawn at relative to its tile (the player's `0.6`):
   * below `1` it is rasterized at that much less resolution, so a sprite drawn smaller does not
   * hold texels it never shows; above `1` it changes nothing. Pixi caches a texture by `source`,
   * so a source is always loaded with the same scale.
   */
  loadSvg(source: string, options?: { readonly scale?: number }): Promise<Texture | undefined>;
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
  /**
   * Inclusive rectangle of columns the camera centre stays in: the world's bounds, or, for an
   * unbounded world, all of the grid but a margin of chunks at its far edges.
   */
  readonly bounds: WorldRect;
  /**
   * The top block of each loaded column (its elevation and, as `type`, its surface): live, it
   * follows the chunks the world loads (`world.columnIndex`).
   */
  readonly columnAt: ReadonlyCellMap<Box>;
  /** How each terrain material is drawn (game content). */
  readonly terrain: TerrainAppearance;
  /** Blocks the top of column `(x, y)` sits below its cell (its material's `topInset`); `0` off the world. */
  readonly topInsetAt: (x: number, y: number) => number;
  readonly assets: SceneAssets;
  readonly services: SceneServiceRegistry;
  /**
   * Runs `step` and returns what it returns; in a profiled scene (`?perf`) it also records the
   * milliseconds it took under `label` (`<module id>:<what>`, e.g. `shadows:maps`), so the parts
   * of a module's `update()` show apart.
   */
  readonly profile: <T>(label: string, step: () => T) => T;
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

/** The scene once its first views are in place: changing its views in the draw order. */
export type BuiltScene = {
  /**
   * Puts `view` in the draw order right after every view at `depth` or closer to the back (moved
   * if already there). For views that move between columns; never with `zIndex`.
   */
  placeAt(view: Container, depth: number): void;
  /**
   * Puts `view` in the draw order at another depth or layer, after the views of the same depth and
   * layer, as `add()` would (moved if already there): for a view on the ground that moves from
   * column to column (a moving shadow), drawn on its column's top and under what stands on it.
   */
  move(view: SceneView): void;
  /** Adds `views` in the draw order (by depth, then layer), `cullable`, as a chunk's views are. */
  add(views: readonly SceneView[]): void;
  /** Takes `views` out of the scene and destroys them (not their textures). */
  remove(views: readonly SceneView[]): void;
};

/** What a module draws for one chunk while it is shown. */
export type SceneChunkPart = {
  /** Views of the chunk, added with every other module's for it and removed when it is hidden. */
  readonly views?: readonly SceneView[];
  /**
   * The module takes its views back when the chunk is hidden, to use them again (a `SpritePool`):
   * the scene takes them out of the world container and leaves them to `destroy()`. Otherwise the
   * scene destroys them.
   */
  readonly keepsViews?: boolean;
  /**
   * Frees what the module made for the chunk, once its views are out of the world container: with
   * `keepsViews`, its views too (kept or destroyed); otherwise the scene already destroyed them.
   */
  destroy?(): void;
};

/** What a module adds to the scene. Everything is optional but `destroy()`. */
export type SceneModulePart = {
  /**
   * Views of the whole scene, not of a chunk, added once in draw order, `cullable`, with every
   * other module's and those of the first chunks.
   */
  readonly views?: readonly SceneView[];
  /** Services for the modules after it. */
  readonly provides?: Partial<SceneServices>;
  /** Called once every view is in the scene, in module order. */
  start?(scene: BuiltScene): void;
  /**
   * Draws one chunk of the world when the scene shows it (it came into view with its neighbours
   * loaded), in module order: a module may read what the modules before it made for the same
   * chunk. Called before `start()` for the first chunks.
   */
  showChunk?(chunk: WorldChunk): SceneChunkPart | Promise<SceneChunkPart>;
  /** Called every frame, in module order. */
  update?(frame: SceneFrame): void;
  /** Frees what the module created outside the world container (which the scene destroys). */
  destroy(): void;
};

/**
 * A part of the scene (terrain, entities, shadows, light, camera, player…), in its own engine
 * module. What belongs to the world's chunks is drawn chunk by chunk (`showChunk()`). The scene sets them up in list order, so a module can read the services of the ones
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
