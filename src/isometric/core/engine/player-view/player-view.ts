import { getGroundPointBelow } from "../camera";
import { getPlayerColumn, getPlayerRenderPosition } from "../player";
import { projectBoxesToIsometric, projectGridPoint } from "../projection";
import { createBlockViews, getBlockDepth } from "../render";
import type { BuiltScene, SceneModule } from "../scene";
import type { PlayerAppearance, PlayerPosition } from "../../types";

/**
 * Scene module of the player: draws `world.player` with `appearance` (game content) as one
 * sprite, never culled (the camera keeps it on screen). Every frame it places the sprite between
 * the player's last two ticks (`frame.alpha`) and, when it moved, tells the `camera` (if any) to
 * follow it. The sprite moves in the draw order only when the player enters another column or
 * elevation (`placeAt()`, at the depth of that column's top); never with `zIndex`. On a column
 * with a `topInset` (sand) it stands that much lower.
 *
 * Provides `focus` (the ground below the player), so the camera starts on it. When its SVG
 * cannot be loaded, nothing is drawn or followed. The player casts no shadow yet.
 */
export function createPlayerView(appearance: PlayerAppearance): SceneModule {
  return {
    id: "player",
    async setup({ world, projection, metrics, columnAt, topInsetAt, assets, services }) {
      const texture = await assets.loadSvg(appearance.textureSource);
      if (!texture) return { destroy: () => {} };

      const ground = (at: PlayerPosition) => getGroundPointBelow(at, at.elevation, projection);
      const [projected] = projectBoxesToIsometric(
        [{ ...getPlayerColumn(world.player), elevation: world.player.elevation, metadata: {} }],
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
      const offset = { x: view.position.x - projected.screenX, y: view.position.y - projected.screenY };

      let drawnAt = getPlayerRenderPosition(world.player, 1);
      let drawnDepth: number | undefined;
      let depthFor: { x: number; y: number; elevation: number } | undefined;
      // Set by `start()`, before the first `place()`.
      let scene!: BuiltScene;
      const place = (at: PlayerPosition) => {
        const column = getPlayerColumn(at);
        const screen = projectGridPoint(at, projection);
        view.position.set(
          screen.x + offset.x,
          screen.y - (at.elevation - topInsetAt(column.x, column.y)) * metrics.boxHeight + offset.y,
        );
        // In the draw order by the column it stands on, at that column's top: computed, and the
        // view moved, only when that column changes, not on every frame of the walk.
        const elevation = columnAt.get(column.x, column.y)?.elevation ?? world.player.elevation;
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
        provides: { focus: { ground: () => ground(world.player) } },
        start: (built) => {
          scene = built;
          place(drawnAt);
          services.get("camera")?.follow(ground(world.player));
        },
        update: ({ alpha }) => {
          const at = getPlayerRenderPosition(world.player, alpha);
          if (at.x === drawnAt.x && at.y === drawnAt.y && at.elevation === drawnAt.elevation) return;
          place(at);
          services.get("camera")?.follow(ground(at));
        },
        destroy: () => {},
      };
    },
  };
}
