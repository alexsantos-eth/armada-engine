import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM } from "../camera";
import type { SceneModule } from "../scene";
import type { Camera } from "../../types";
import { createSceneCamera } from "./camera";

/** Options of {@link createCameraView}. */
export type CameraViewOptions = {
  /**
   * Where the camera starts. By default on the scene's `focus` (the player) when a module
   * provides it, otherwise the world's centre (`world.centre`), at `CAMERA_START_ZOOM`.
   */
  readonly start?: Partial<Camera>;
  /**
   * Whether the camera culls the views out of the screen. Defaults to `true`; `false` draws every
   * view of the shown chunks, to measure what culling saves (`?cull=off`).
   */
  readonly cull?: boolean;
};

/**
 * Scene module of the camera: it moves and scales the world container (`createSceneCamera()`)
 * inside the world's bounds (`context.bounds`), says which chunks are in view (`visibleChunks()`), culls it on demand (once all views are in, on every renderer
 * resize and when the camera moved past its cull margin) and glides it every frame after
 * whatever it follows. Provides the `camera` service; put it after the module that provides
 * `focus`.
 */
export function createCameraView(options: CameraViewOptions = {}): SceneModule {
  return {
    id: "camera",
    setup({ app, world, root, bounds, projection, services }) {
      const camera = createSceneCamera(
        root,
        app.renderer.screen,
        { minZoom: CAMERA_MIN_ZOOM, maxZoom: CAMERA_MAX_ZOOM, bounds },
        projection,
        options.start ?? services.get("focus")?.ground() ?? world.centre,
        options.cull,
      );
      const onResize = () => camera.resize();
      app.renderer.on("resize", onResize);
      return {
        provides: { camera },
        // The views are in only now: cull them.
        start: () => camera.resize(),
        update: ({ elapsedMs }) => camera.update(elapsedMs),
        destroy: () => {
          app.renderer.off("resize", onResize);
        },
      };
    },
  };
}
