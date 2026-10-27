import { getGroundPointBelow } from "../camera";
import { getPlayerColumn, getPlayerFacing, getPlayerRenderPosition, PLAYER_PART } from "../player";
import { projectBoxesToIsometric, projectGridPoint } from "../projection";
import { createBlockViews, getBlockDepth, getSheetFrames, showFrame } from "../render";
import { SCENE_LAYER, type BuiltScene, type SceneModule } from "../scene";
import type { PlayerAppearance, PlayerRenderPosition } from "../../types";
import { getWalkPose, getWalkSheetCell, getWalkSheetLayout, PLAYER_START_FACING } from "./walk";

/**
 * Blocks above the ground the player's feet must be to show the air pose: a short drop (onto sand)
 * keeps it walking.
 */
export const PLAYER_AIR_POSE_HEIGHT = 0.25;

/**
 * Scene module of the player: draws the world's player (`PLAYER_PART`) with `appearance` (game
 * content) as one sprite, at `appearance.scale` of its tile about its feet, never culled (the
 * camera keeps it on screen). Every frame it places the sprite between the player's last two
 * ticks (`frame.alpha`) and, when it moved, tells the `camera` (if any) to follow it. The sprite
 * moves in the draw order only when the player enters another column or elevation (`placeAt()`,
 * at the depth of that column's top) or crosses the middle of its column: behind it (further from
 * the camera, `x + y` above the column's) it goes on the column's top but before what stands
 * there (`move()` to `SCENE_LAYER.behindObject`), so it walks behind a tree's trunk; in front,
 * after it. Never with `zIndex`. On a column with a `topInset` (sand) it stands that much lower (the
 * player's `inset`, which the simulation keeps so it falls onto that top instead of dropping there).
 * While it jumps or falls (`height`), the sprite and the feet it gives the shadow rise that many
 * blocks; its place in the draw order stays with the ground below it. The camera looks at the top it
 * stands on, or at its feet while they are below where they left the ground: a jump does not bob the
 * camera, and a fall to a lower top is followed as it falls, not in one jolt when it lands.
 *
 * With a walk sheet (`appearance.walk`) the sprite shows one of its cells: turned to the facing
 * nearest the way the player walks (`getPlayerFacing()`; standing, the last one, at first
 * `PLAYER_START_FACING`), the standing pose on a frame it did not move and, while it moves, the walk
 * pose for how far it has gone since it set off (`getWalkPose()`), so its feet keep pace with the
 * ground; in the air (more than {@link PLAYER_AIR_POSE_HEIGHT} above the ground), the sheet's `airPose`. Every cell is the same window of its canvas,
 * so the sprite keeps its size and its feet;
 * its texture is written only when the cell changes. Without the sheet, or if it cannot be loaded,
 * the still `textureSource` is drawn.
 *
 * Its SVGs are rasterized at `appearance.scale` (`loadSvg()`'s `scale`), as small as it is drawn.
 *
 * Provides `focus` (the ground below the player), so the camera starts on it, and the player as
 * the one `movingCasters`, so `shadows` lays its shadow where its feet are drawn. When the world
 * has no player part or its SVG cannot be loaded, nothing is drawn or followed.
 */
export function createPlayerView(appearance: PlayerAppearance): SceneModule {
  return {
    id: "player",
    async setup({ world, projection, metrics, columnAt, assets, services }) {
      const player = world.parts.find(PLAYER_PART);
      const sheet = appearance.walk;
      const scale = appearance.scale ?? 1;
      // Rasterized as small as it is drawn: the walk sheet at full size is tens of MB of texture.
      const sheetTexture = player && sheet && (await assets.loadSvg(sheet.source, { scale }));
      // The sheet and its cells by facing, then pose (column `0` standing), shared.
      const walk =
        sheet && sheetTexture ? { sheet, frames: getSheetFrames(sheetTexture, getWalkSheetLayout(sheet)) } : undefined;
      let facing = PLAYER_START_FACING;
      const texture =
        walk?.frames[facing][0] ?? (player && (await assets.loadSvg(appearance.textureSource, { scale })));
      if (!player || !texture) return { destroy: () => {} };

      // Blocks above elevation `0` the camera looks at: the top the player stands on or, while its
      // feet are below where they left the ground, its feet.
      let level = player.elevation - player.inset;
      const ground = (at: PlayerRenderPosition) => {
        const top = at.elevation - at.inset;
        level = at.height > 0 ? Math.min(level, top + at.height) : top;
        return getGroundPointBelow(at, level, projection);
      };
      const [projected] = projectBoxesToIsometric(
        [{ ...getPlayerColumn(player), elevation: player.elevation, metadata: {} }],
        projection,
      );
      const [{ view }] = createBlockViews({
        texture,
        box: projected,
        metrics,
        height: appearance.height ?? 1,
        surfaceAligned: true,
        cell: walk && getWalkSheetCell(walk.sheet),
      });
      view.cullable = false;
      // Scaled about the feet, which stand on the column's top (`projected.screenY`).
      view.scale.set(view.scale.x * scale, view.scale.y * scale);
      const offset = { x: view.position.x - projected.screenX, y: (view.position.y - projected.screenY) * scale };

      let drawnAt = getPlayerRenderPosition(player, 1);
      // Columns walked since the player last stood still, for its walk pose.
      let walked = 0;
      /** Turns the sprite and picks its pose for a frame that draws it at `at`, after `drawnAt`. */
      const animate = (at: PlayerRenderPosition) => {
        if (!walk) return;
        facing = getPlayerFacing(player.walk) ?? facing;
        const walking = at.x !== drawnAt.x || at.y !== drawnAt.y;
        walked = walking ? walked + Math.hypot(at.x - drawnAt.x, at.y - drawnAt.y) : 0;
        const pose =
          at.height > PLAYER_AIR_POSE_HEIGHT
            ? (walk.sheet.airPose ?? 0)
            : walking
              ? getWalkPose(walked, walk.sheet)
              : 0;
        showFrame(view, walk.frames[facing][pose]);
      };
      // Where its feet are on screen: written by `place()`, read by whoever casts its shadow.
      const drawnFoot = { x: 0, y: 0 };
      // Where its feet are in the world for its shadow: lifted by a jump's height, as if it stood higher.
      let castFrom = { x: drawnAt.x, y: drawnAt.y, elevation: drawnAt.elevation };
      let drawnDepth: number | undefined;
      let drawnBehind: boolean | undefined;
      let depthFor: { x: number; y: number; elevation: number } | undefined;
      let depth = 0;
      // Set by `start()`, before the first `place()`.
      let scene!: BuiltScene;
      const place = (at: PlayerRenderPosition) => {
        const column = getPlayerColumn(at);
        const screen = projectGridPoint(at, projection);
        drawnFoot.x = screen.x;
        const lifted = at.elevation + at.height;
        drawnFoot.y = screen.y - (lifted - at.inset) * metrics.boxHeight;
        castFrom = { x: at.x, y: at.y, elevation: lifted };
        view.position.set(drawnFoot.x + offset.x, drawnFoot.y + offset.y);
        // In the draw order by the column it stands on, at that column's top: computed, and the
        // view moved, only when that column or the side of its middle changes, not on every frame.
        const elevation = columnAt.get(column.x, column.y)?.elevation ?? player.elevation;
        if (depthFor?.x !== column.x || depthFor.y !== column.y || depthFor.elevation !== elevation) {
          depthFor = { ...column, elevation };
          const [top] = projectBoxesToIsometric([{ ...depthFor, metadata: {} }], projection);
          depth = getBlockDepth(top, metrics);
        }
        const behind = at.x + at.y > column.x + column.y;
        if (depth !== drawnDepth || behind !== drawnBehind) {
          if (behind) scene.move({ view, depth, layer: SCENE_LAYER.behindObject });
          else scene.placeAt(view, depth);
          drawnDepth = depth;
          drawnBehind = behind;
        }
        drawnAt = at;
      };

      return {
        provides: {
          focus: { ground: () => getGroundPointBelow(player, level, projection) },
          movingCasters: [{ view, foot: () => ({ ground: castFrom, screen: drawnFoot }) }],
        },
        start: (built) => {
          scene = built;
          place(drawnAt);
          services.get("camera")?.follow(ground(drawnAt));
        },
        update: ({ alpha }) => {
          const at = getPlayerRenderPosition(player, alpha);
          const moved =
            at.x !== drawnAt.x ||
            at.y !== drawnAt.y ||
            at.elevation !== drawnAt.elevation ||
            at.inset !== drawnAt.inset ||
            at.height !== drawnAt.height;
          animate(at);
          if (!moved) return;
          place(at);
          services.get("camera")?.follow(ground(at));
        },
        destroy: () => {},
      };
    },
  };
}
