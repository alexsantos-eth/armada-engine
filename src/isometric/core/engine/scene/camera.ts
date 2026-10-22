import { type Container, Culler, type Rectangle } from "pixi.js";
import {
  createCamera,
  followCamera,
  getCameraTransform,
  getCullRect,
  needsCull,
  panCamera,
  zoomCameraAt,
} from "../camera";
import type { Camera, CameraLimits, GridPoint, IsoProjectionConfig, ScreenPoint } from "../../types";

/** The camera of a scene: moves its world container and culls it when what shows changes. */
export type SceneCamera = {
  /** What the camera looks at now. */
  readonly state: Camera;
  /** Moves the scene by `delta` screen pixels (a drag). Stops following until `follow()`. */
  pan(delta: ScreenPoint): void;
  /** Multiplies the zoom by `factor`, keeping the scene point under `anchor` (screen) in place. */
  zoomAt(factor: number, anchor: ScreenPoint): void;
  /** Applies the camera to a new viewport size (after a renderer resize) and culls again. */
  resize(): void;
  /**
   * Follows the ground point `target` (the player): from now on `update()` glides the camera
   * towards it, until the next `pan()`. Call it again whenever the target moves.
   */
  follow(target: GridPoint): void;
  /** Glides a following camera towards its target for a frame of `elapsedMs` real milliseconds. */
  update(elapsedMs: number): void;
};

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
    follow(point) {
      target = point;
    },
    update(elapsedMs) {
      if (target) moveTo(followCamera(camera, target, elapsedMs, limits));
    },
  };
}
