import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM } from "../camera";
import type { SceneModule } from "../scene";
import type { Camera } from "../../types";
import { createSceneCamera } from "./camera";

/** Options of {@link createCameraView}. */
export type CameraViewOptions = {
  /**
   * Where the camera starts. By default on the scene's `focus` (the player) when a module
   * provides it, otherwise the centre of the world, at `CAMERA_START_ZOOM`.
   */
  readonly start?: Partial<Camera>;
};

/**
 * Scene module of the camera: it moves and scales the world container (`createSceneCamera()`)
 * inside the world's columns, culls it on demand (once all views are in, on every renderer
 * resize and when the camera moved past its cull margin) and glides it every frame after
 * whatever it follows. Provides the `camera` service; put it after the module that provides
 * `focus`.
 */
export function createCameraView(options: CameraViewOptions = {}): SceneModule {
  return {
    id: "camera",
    setup({ app, root, bounds, projection, services }) {
      const camera = createSceneCamera(
        root,
        app.renderer.screen,
        { minZoom: CAMERA_MIN_ZOOM, maxZoom: CAMERA_MAX_ZOOM, bounds },
        projection,
        options.start ?? services.get("focus")?.ground(),
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
