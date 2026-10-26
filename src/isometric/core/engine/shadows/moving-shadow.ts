import { type Filter, Rectangle, RenderTexture, type Renderer, Sprite, Texture } from "pixi.js";
import { getSilhouetteMatrix, SHADOW_REFRESH_TICKS } from "../lighting";
import { projectBoxesToIsometric } from "../projection";
import { getBlockDepth } from "../render";
import { type BuiltScene, SCENE_LAYER, type SceneMovingCaster, type SceneView } from "../scene";
import type { AffineTarget, IsoProjectionConfig, ShadowProjection, TileMetrics } from "../../types";
import {
  createCasterSprites,
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
   * the sun turned or `SHADOW_REFRESH_TICKS` went by, the map is drawn again with `light` (none at
   * night).
   */
  update(scene: BuiltScene, light: ShadowProjection | null, tick: number): void;
  /** Destroys its map and its caster sprites; the scene destroys its views. */
  destroy(): void;
};

/**
 * The shadow of `caster`, something that moves on every frame (#58): the chunks' shadow maps are
 * redrawn by turns, so it has its own small map instead, centred on the column the caster stands
 * on ({@link MOVING_SHADOW_RADIUS} columns around it), redrawn only when it moves (and as the sun
 * moves), and read by ground views of its own on the tops of those columns, right after the
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
  const casters = createCasterSprites(context.filters);
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
  let drawn: { x: number; y: number; elevation: number; tick: number; day: boolean; texture: unknown } | undefined;
  // By the texture the caster's sprite showed when it was made.
  const silhouettes = new Map<Texture, Silhouette>();
  // Written for each draw, read at once.
  const ground: AffineTarget = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };

  /** Moves the views onto the columns around `(x, y)`, showing those at `level`. */
  const follow = (scene: BuiltScene, x: number, y: number, level: number | undefined) => {
    centre = { x, y, level };
    views.forEach((slot, index) => {
      const column = {
        x: x - MOVING_SHADOW_RADIUS + (index % side),
        y: y - MOVING_SHADOW_RADIUS + Math.floor(index / side),
      };
      const shows = level !== undefined && elevationAt(column.x, column.y) === level;
      if (slot.view.visible !== shows) slot.view.visible = shows;
      if (level === undefined || !shows) return;
      const [top] = projectBoxesToIsometric([{ ...column, elevation: level, metadata: {} }], projection);
      const tileTop = { x: top.screenX, y: top.screenY + topInsetAt(column.x, column.y) * metrics.boxHeight };
      placeGroundShadowView(slot.view, tileTop, metrics, square);
      scene.move({ ...slot, depth: getBlockDepth(top, metrics) });
    });
  };

  return {
    views,
    update(scene, light, tick) {
      const foot = caster.foot();
      const x = Math.round(foot.ground.x);
      const y = Math.round(foot.ground.y);
      const level = elevationAt(x, y);
      const entered = centre?.x !== x || centre.y !== y || centre.level !== level;
      if (entered) follow(scene, x, y, level);

      const day = light !== null;
      const { view } = caster;
      const texture = view instanceof Sprite ? view.texture : undefined;
      const moved =
        drawn?.x !== foot.ground.x ||
        drawn.y !== foot.ground.y ||
        drawn.elevation !== foot.ground.elevation ||
        drawn.texture !== texture;
      if (!entered && !moved && drawn?.day === day && Math.abs(tick - drawn.tick) < SHADOW_REFRESH_TICKS) return;
      drawn = { ...foot.ground, tick, day, texture };

      if (light && level !== undefined && view instanceof Sprite) {
        // The caster's foot points may be written in place as it moves: the silhouette keeps where
        // they were when its sprite was measured.
        const silhouette =
          silhouettes.get(view.texture) ?? createMovingSilhouette(view, { ...foot.screen }, { ...foot.ground });
        silhouettes.set(view.texture, silhouette);
        const lift = foot.ground.elevation - level;
        getSilhouetteMatrix(light, foot.ground, lift, metrics, ground);
        const mapOrigin = { x: x - MOVING_SHADOW_RADIUS - 0.5, y: y - MOVING_SHADOW_RADIUS - 0.5 };
        placeSilhouette(casters.sprite(0, silhouette.texture), silhouette, ground, mapOrigin, pixelsPerTile);
        casters.show(1);
      } else casters.show(0);
      renderer.render({ container: casters.container, target: map, clear: true, clearColor: [0, 0, 0, 0] });
    },
    destroy: () => {
      casters.destroy();
      map.destroy(true);
    },
  };
}
