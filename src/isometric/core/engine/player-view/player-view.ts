import { getGroundPointBelow } from "../camera";
import { getPlayerColumn, getPlayerRenderPosition, PLAYER_PART } from "../player";
import { projectBoxesToIsometric, projectGridPoint } from "../projection";
import { createBlockViews, getBlockDepth } from "../render";
import type { BuiltScene, SceneModule } from "../scene";
import type { PlayerAppearance, PlayerPosition } from "../../types";

/**
 * Scene module of the player: draws the world's player (`PLAYER_PART`) with `appearance` (game
 * content) as one sprite, at `appearance.scale` of its tile about its feet, never culled (the
 * camera keeps it on screen). Every frame it places the sprite between the player's last two
 * ticks (`frame.alpha`) and, when it moved, tells the `camera` (if any) to follow it. The sprite
 * moves in the draw order only when the player enters another column or elevation (`placeAt()`,
 * at the depth of that column's top); never with `zIndex`. On a column with a `topInset` (sand)
 * it stands that much lower.
 *
 * Provides `focus` (the ground below the player), so the camera starts on it, and the player as
 * the one `movingCasters`, so `shadows` lays its shadow where its feet are drawn. When the world
 * has no player part or its SVG cannot be loaded, nothing is drawn or followed.
 */
export function createPlayerView(appearance: PlayerAppearance): SceneModule {
  return {
    id: "player",
    async setup({ world, projection, metrics, columnAt, topInsetAt, assets, services }) {
      const player = world.parts.find(PLAYER_PART);
      const texture = player && (await assets.loadSvg(appearance.textureSource));
      if (!player || !texture) return { destroy: () => {} };

      const ground = (at: PlayerPosition) => getGroundPointBelow(at, at.elevation, projection);
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
      });
      view.cullable = false;
      // Scaled about the feet, which stand on the column's top (`projected.screenY`).
      const scale = appearance.scale ?? 1;
      view.scale.set(view.scale.x * scale, view.scale.y * scale);
      const offset = { x: view.position.x - projected.screenX, y: (view.position.y - projected.screenY) * scale };

      let drawnAt = getPlayerRenderPosition(player, 1);
      // Where its feet are on screen: written by `place()`, read by whoever casts its shadow.
      const drawnFoot = { x: 0, y: 0 };
      let drawnDepth: number | undefined;
      let depthFor: { x: number; y: number; elevation: number } | undefined;
      // Set by `start()`, before the first `place()`.
      let scene!: BuiltScene;
      const place = (at: PlayerPosition) => {
        const column = getPlayerColumn(at);
        const screen = projectGridPoint(at, projection);
        drawnFoot.x = screen.x;
        drawnFoot.y = screen.y - (at.elevation - topInsetAt(column.x, column.y)) * metrics.boxHeight;
        view.position.set(drawnFoot.x + offset.x, drawnFoot.y + offset.y);
        // In the draw order by the column it stands on, at that column's top: computed, and the
        // view moved, only when that column changes, not on every frame of the walk.
        const elevation = columnAt.get(column.x, column.y)?.elevation ?? player.elevation;
        if (depthFor?.x !== column.x || depthFor.y !== column.y || depthFor.elevation !== elevation) {
          depthFor = { ...column, elevation };
          const [top] = projectBoxesToIsometric([{ ...depthFor, metadata: {} }], projection);
          const depth = getBlockDepth(top, metrics);
          if (depth !== drawnDepth) {
            scene.placeAt(view, depth);
            drawnDepth = depth;
          }
        }
        drawnAt = at;
      };

      return {
        provides: {
          focus: { ground: () => ground(player) },
          movingCasters: [{ view, foot: () => ({ ground: drawnAt, screen: drawnFoot }) }],
        },
        start: (built) => {
          scene = built;
          place(drawnAt);
          services.get("camera")?.follow(ground(player));
        },
        update: ({ alpha }) => {
          const at = getPlayerRenderPosition(player, alpha);
          if (at.x === drawnAt.x && at.y === drawnAt.y && at.elevation === drawnAt.elevation) return;
          place(at);
          services.get("camera")?.follow(ground(at));
        },
        destroy: () => {},
      };
    },
  };
}
