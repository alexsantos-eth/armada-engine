import { type Container, Culler, type Rectangle } from "pixi.js";
import {
  createCamera,
  followCamera,
  getCameraTransform,
  getCullRect,
  getVisibleChunks,
  needsCull,
  panCamera,
  zoomCameraAt,
} from "../camera";
import type { Camera, CameraLimits, ChunkCoord, GridPoint, IsoProjectionConfig, SceneCamera } from "../../types";

/**
 * Creates the camera of `world` (the scene's world container, a render group, so moving it is a
 * GPU uniform and its children are not touched), whose views were placed with `projection`. `screen` is the renderer's screen rectangle,
 * read on every change so a resize is picked up. Culls with `Culler.shared` against the screen
 * grown by a margin, and only again when the zoom changes or the scene moved past that margin.
 */
export function createSceneCamera(
  world: Container,
  screen: Rectangle,
  limits: CameraLimits,
  projection: IsoProjectionConfig,
  start?: Partial<Camera>,
): SceneCamera {
  let camera = createCamera(limits, start);
  let culledFor: Camera | undefined;
  let target: GridPoint | undefined;
  // The scene asks on every frame: computed again only when the camera or the screen changed.
  let seen: { camera: Camera; width: number; height: number; chunks: readonly ChunkCoord[] } | undefined;

  const apply = (force = false) => {
    const { x, y, scale } = getCameraTransform(camera, screen, projection);
    world.position.set(x, y);
    world.scale.set(scale);
    if (force || needsCull(culledFor, camera, screen, projection)) {
      Culler.shared.cull(world, getCullRect(screen), false);
      culledFor = camera;
    }
  };
  apply();

  const moveTo = (next: Camera) => {
    if (next.x === camera.x && next.y === camera.y && next.zoom === camera.zoom) return;
    camera = next;
    apply();
  };

  return {
    get state() {
      return camera;
    },
    pan(delta) {
      target = undefined;
      moveTo(panCamera(camera, delta, limits, projection));
    },
    zoomAt(factor, anchor) {
      moveTo(zoomCameraAt(camera, factor, anchor, screen, limits, projection));
    },
    resize() {
      apply(true);
    },
    visibleChunks() {
      const { width, height } = screen;
      if (seen?.camera !== camera || seen.width !== width || seen.height !== height) {
        seen = { camera, width, height, chunks: getVisibleChunks(camera, screen, projection) };
      }
      return seen.chunks;
    },
    follow(point) {
      target = point;
    },
    update(elapsedMs) {
      if (target) moveTo(followCamera(camera, target, elapsedMs, limits));
    },
  };
}
