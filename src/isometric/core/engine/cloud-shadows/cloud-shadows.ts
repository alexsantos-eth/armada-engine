import { TilingSprite } from "pixi.js";
import type { SceneModule } from "../scene";

/** A slow drift in scene pixels per real second; independent of simulation speed. */
export const CLOUD_SHADOW_SPEED = { x: 7, y: 3 } as const;
/** Pattern size relative to the world's camera scale. */
export const CLOUD_SHADOW_SCALE = 0.5;
export const CLOUD_SHADOW_ALPHA = 0.6;
export const CLOUD_SHADOW_SOURCE = "/assets/cloud-shadow.svg";

/**
 * One GPU-tiled, translucent mask above the world. Its offset follows the camera transform,
 * so the shadows stay fixed on the ground while panning and drift slowly with real time.
 * No tile, entity, or chunk is visited on a frame.
 */
export function createCloudShadows(): SceneModule {
  return {
    id: "cloud-shadows",
    async setup({ app, root, assets }) {
      const texture = await assets.loadSvg(CLOUD_SHADOW_SOURCE);
      if (!texture) return { destroy: () => {} };

      const screen = app.renderer.screen;
      const overlay = new TilingSprite({ texture, width: screen.width, height: screen.height });
      overlay.alpha = CLOUD_SHADOW_ALPHA;
      overlay.eventMode = "none";
      app.stage.addChild(overlay);

      let driftX = 0;
      let driftY = 0;
      const align = () => {
        const zoom = root.scale.x;
        overlay.tileScale.set(zoom * CLOUD_SHADOW_SCALE, zoom * CLOUD_SHADOW_SCALE);
        overlay.tilePosition.set(root.position.x - driftX * zoom, root.position.y - driftY * zoom);
      };
      const resize = () => {
        overlay.width = screen.width;
        overlay.height = screen.height;
      };
      app.renderer.on("resize", resize);

      return {
        start: align,
        update: ({ elapsedMs }) => {
          driftX += (elapsedMs * CLOUD_SHADOW_SPEED.x) / 1000;
          driftY += (elapsedMs * CLOUD_SHADOW_SPEED.y) / 1000;
          align();
        },
        destroy: () => {
          app.renderer.off("resize", resize);
          app.stage.removeChild(overlay);
          overlay.destroy();
        },
      };
    },
  };
}
