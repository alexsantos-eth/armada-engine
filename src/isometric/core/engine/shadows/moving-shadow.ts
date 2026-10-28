import {
  BufferImageSource,
  Container,
  type Filter,
  Rectangle,
  RenderTexture,
  type Renderer,
  Sprite,
  Texture,
} from "pixi.js";
import { getSilhouetteMatrix, getTerrainFaces } from "../lighting";
import { DEFAULT_MIN_ELEVATION } from "../terrain";
import { createTerrainFaceShadows, type TerrainFaceShadows } from "./terrain-faces";
import { projectBoxesToIsometric } from "../projection";
import { getBlockDepth } from "../render";
import { type BuiltScene, SCENE_LAYER, type SceneMovingCaster, type SceneView } from "../scene";
import type { AffineTarget, IsoProjectionConfig, ShadowProjection, TileMetrics } from "../../types";
import {
  createCasterSprites,
  cropSilhouetteAbove,
  createGroundShadowView,
  createMovingSilhouette,
  placeGroundShadowView,
  placeSilhouette,
  SHADOW_MAP_PIXELS_PER_TILE,
  type Silhouette,
} from "./silhouette";

/**
 * Columns a moving caster's own shadow map reaches on every side of the column it stands on: the
 * shadow of the player (about half a block tall) reaches some three columns with the sun as low
 * as shadows get (`MAX_SHADOW_STRETCH`), plus its blur.
 */
export const MOVING_SHADOW_RADIUS = 4;

/**
 * Texels per tile of a moving caster's shadow map: twice the chunks' maps' ({@link
 * SHADOW_MAP_PIXELS_PER_TILE}), so the shared blur spreads half as far. The player is a fraction of
 * a tile wide, and blurred as much as a tree its shadow was a faint smudge.
 */
export const MOVING_SHADOW_PIXELS_PER_TILE = 2 * SHADOW_MAP_PIXELS_PER_TILE;

/** What a moving shadow needs from its scene module. */
export type MovingShadowContext = {
  readonly renderer: Renderer;
  /** The shadow filters (blur, then the sun's opacity), shared with the module's other draws. */
  readonly filters: readonly Filter[];
  /** Top elevation of each loaded column, or `undefined` when it is not loaded. */
  readonly elevationAt: (x: number, y: number) => number | undefined;
  /** Blocks a column's top is lower than its elevation (a sand top), as the scene's `topInsetAt()`. */
  readonly topInsetAt: (x: number, y: number) => number;
  readonly projection: IsoProjectionConfig;
  readonly metrics: TileMetrics;
  /** Presentation intensity, separate from the alpha baked into its dynamic map. */
  readonly strength?: () => number;
};

/** The shadow of one moving caster (the player), drawn into a small map of its own. */
export type MovingShadow = {
  /**
   * One ground view per column of its map, on the `ground` layer: add them to the scene once. Each
   * follows the caster from column to column.
   */
  readonly views: readonly SceneView[];
  /**
   * Follows the caster for this frame, after it moved: when it enters another column, its views
   * move to the columns around it, showing only on those at the level it stands on; when it moved,
   * its pose or projection changed, the map is drawn again with `light` (none at
   * night).
   */
  update(scene: BuiltScene, light: ShadowProjection | null): void;
  /** Destroys its map and its caster sprites; the scene destroys its views. */
  destroy(): void;
};

/**
 * The shadow of `caster`, something that moves on every frame (#58): the chunks' shadow maps are
 * baked once, so it has its own small map instead, centred on the column the caster stands
 * on ({@link MOVING_SHADOW_RADIUS} columns around it), redrawn only when it moves (or changes pose/projection), and read by ground views of its own on the tops of those columns, right after the
 * chunk's ones and under what stands on them. Its silhouette is made once per texture its sprite
 * shows (a walk sheet's cells), the first time it is drawn with it: its sprite keeps its size, so
 * only where its foot goes changes; showing another texture draws the map again, even standing.
 *
 * Its shadow falls on the ground the caster stands on: the columns at another level show none of
 * it, it falls on no entity, and where it crosses an entity's shadow both darken the ground.
 */
export function createMovingShadow(caster: SceneMovingCaster, context: MovingShadowContext): MovingShadow {
  const { renderer, elevationAt, topInsetAt, projection, metrics } = context;
  const pixelsPerTile = MOVING_SHADOW_PIXELS_PER_TILE;
  const side = 2 * MOVING_SHADOW_RADIUS + 1;
  const map = RenderTexture.create({ width: side * pixelsPerTile, height: side * pixelsPerTile });
  const scratch = RenderTexture.create({ width: side * pixelsPerTile, height: side * pixelsPerTile });
  const eraser = new Sprite();
  eraser.blendMode = "erase";
  eraser.scale.set(pixelsPerTile);
  const levelRoot = new Container();
  const copy = new Sprite(scratch);

  const casters = createCasterSprites(context.filters);
  levelRoot.addChild(casters.container, eraser);
  casters.container.filterArea = new Rectangle(0, 0, side * pixelsPerTile, side * pixelsPerTile);

  // Every slot shows a square of the map of the same size.
  const square = { width: pixelsPerTile, height: pixelsPerTile };
  // Slot `i + j × side` shows square `(i, j)` of the map, on column `(centre.x − R + i, centre.y − R + j)`.
  const views: SceneView[] = [];
  for (let j = 0; j < side; j += 1) {
    for (let i = 0; i < side; i += 1) {
      const frame = new Texture({
        source: map.source,
        frame: new Rectangle(i * pixelsPerTile, j * pixelsPerTile, pixelsPerTile, pixelsPerTile),
      });
      const view = createGroundShadowView(frame, { x: 0, y: 0 }, metrics, 0);
      view.view.visible = false;
      views.push({ ...view, layer: SCENE_LAYER.ground });
    }
  }

  let centre: { x: number; y: number; level: number | undefined } | undefined;
  let drawn:
    | {
        x: number;
        y: number;
        elevation: number;
        texture: unknown;
        light: ShadowProjection | null;
      }
    | undefined;
  // By the texture the caster's sprite showed when it was made.
  const silhouettes = new Map<Texture, Silhouette>();
  // Written for each draw, read at once.
  const ground: AffineTarget = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };

  let levels: { level: number; mask: Texture; ground: boolean }[] = [];
  let faces: TerrainFaceShadows | undefined;
  let lastStrength: number | undefined;
  const releaseFaces = (scene: BuiltScene) => {
    if (!faces) return;
    scene.remove(faces.views);
    faces.destroy(false);
    faces = undefined;
  };
  let built: BuiltScene | undefined;
  /** Moves the views onto the columns around `(x, y)`, showing those at `level`. */
  const follow = (scene: BuiltScene, x: number, y: number, level: number | undefined) => {
    centre = { x, y, level };
    built = scene;
    releaseFaces(scene);
    levels.forEach(({ mask }) => mask.destroy(true));
    const columns: { x: number; y: number; elevation: number }[] = [];
    const area = {
      minX: x - MOVING_SHADOW_RADIUS,
      minY: y - MOVING_SHADOW_RADIUS,
      maxX: x + MOVING_SHADOW_RADIUS,
      maxY: y + MOVING_SHADOW_RADIUS,
    };
    const topAt = (x: number, y: number) => {
      const height = elevationAt(x, y);
      return height === undefined ? undefined : height - topInsetAt(x, y);
    };
    views.forEach((slot, index) => {
      const column = {
        x: x - MOVING_SHADOW_RADIUS + (index % side),
        y: y - MOVING_SHADOW_RADIUS + Math.floor(index / side),
      };
      const ownLevel = elevationAt(column.x, column.y);
      const shows = ownLevel !== undefined;
      if (slot.view.visible !== shows) slot.view.visible = shows;
      if (ownLevel === undefined) return;
      columns.push({ ...column, elevation: ownLevel - topInsetAt(column.x, column.y) });
      const [top] = projectBoxesToIsometric([{ ...column, elevation: ownLevel, metadata: {} }], projection);
      const tileTop = { x: top.screenX, y: top.screenY + topInsetAt(column.x, column.y) * metrics.boxHeight };
      placeGroundShadowView(slot.view, tileTop, metrics, square);
      scene.move({ ...slot, depth: getBlockDepth(top, metrics) });
    });
    faces = createTerrainFaceShadows(getTerrainFaces(columns, topAt, DEFAULT_MIN_ELEVATION), {
      renderer,
      scratch,
      filters: [],
      area,
      projection,
      metrics,
    });
    scene.add(faces.views);
    const groundLevels = new Set(columns.map(({ elevation }) => elevation));
    levels = [...new Set([...groundLevels, ...faces.levels])].map((level) => {
      const pixels = new Uint8ClampedArray(side * side * 4);
      for (let j = 0; j < side; j += 1)
        for (let i = 0; i < side; i += 1) {
          if (topAt(area.minX + i, area.minY + j) !== level) pixels[(j * side + i) * 4 + 3] = 255;
        }
      return {
        level,
        ground: groundLevels.has(level),
        mask: new Texture({
          source: new BufferImageSource({ resource: pixels, width: side, height: side, scaleMode: "nearest" }),
        }),
      };
    });
    lastStrength = undefined;
  };

  return {
    views,
    update(scene, light) {
      const foot = caster.foot();
      const x = Math.round(foot.ground.x);
      const y = Math.round(foot.ground.y);
      const level = elevationAt(x, y);
      const entered = centre?.x !== x || centre.y !== y || centre.level !== level;
      if (entered) follow(scene, x, y, level);
      const strength = context.strength?.() ?? 1;
      if (lastStrength !== strength) {
        faces?.views.forEach(({ view }) => {
          view.alpha = strength;
        });
        lastStrength = strength;
      }

      const { view } = caster;
      const texture = view instanceof Sprite ? view.texture : undefined;
      const moved =
        drawn?.x !== foot.ground.x ||
        drawn.y !== foot.ground.y ||
        drawn.elevation !== foot.ground.elevation ||
        drawn.texture !== texture;
      if (!entered && !moved && drawn?.light === light) return;
      drawn = { ...foot.ground, texture, light: light };

      faces?.clear();
      let first = true;
      if (light && level !== undefined && view instanceof Sprite) {
        const shape =
          silhouettes.get(view.texture) ?? createMovingSilhouette(view, { ...foot.screen }, { ...foot.ground });
        silhouettes.set(view.texture, shape);
        const origin = { x: x - MOVING_SHADOW_RADIUS - 0.5, y: y - MOVING_SHADOW_RADIUS - 0.5 };
        for (const plane of levels) {
          const lift = foot.ground.elevation - plane.level;
          const silhouette = cropSilhouetteAbove(shape, -lift * metrics.boxHeight);
          if (silhouette) {
            getSilhouetteMatrix(light, foot.ground, lift, metrics, ground);
            placeSilhouette(casters.sprite(0, silhouette.texture), silhouette, ground, origin, pixelsPerTile);
          }
          casters.show(silhouette ? 1 : 0);
          renderer.render({ container: casters.container, target: scratch, clear: true, clearColor: [0, 0, 0, 0] });
          faces?.draw(plane.level, light);
          if (!plane.ground) continue;
          eraser.texture = plane.mask;
          renderer.render({ container: levelRoot, target: scratch, clear: true, clearColor: [0, 0, 0, 0] });
          renderer.render({ container: copy, target: map, clear: first, clearColor: [0, 0, 0, 0] });
          first = false;
        }
      }
      if (first) {
        casters.show(0);
        renderer.render({ container: casters.container, target: map, clear: true, clearColor: [0, 0, 0, 0] });
      }
    },
    destroy: () => {
      if (built) releaseFaces(built);
      levels.forEach(({ mask }) => mask.destroy(true));
      casters.destroy();
      levelRoot.destroy();
      copy.destroy({ texture: false });
      scratch.destroy(true);
      map.destroy(true);
    },
  };
}
