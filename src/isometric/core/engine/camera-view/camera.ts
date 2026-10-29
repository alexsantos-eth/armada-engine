import { type Container, Culler, type Rectangle } from "pixi.js";
import {
  CAMERA_CULL_MARGIN,
  createCamera,
  followCamera,
  getCameraTransform,
  getCullRect,
  getVisibleChunks,
  needsCull,
  panCamera,
  zoomCameraAt,
} from "../camera";
import type { SceneCameraService } from "../scene";
import type { Camera, CameraLimits, ChunkCoord, GridPoint, IsoProjectionConfig } from "../../types";

/**
 * Views culled per frame when the camera moved past half its cull margin: culling the whole scene
 * in one frame took 23–35 ms with the zoom out (~35 000 views, #44). A move culls the scene again a
 * slice of its children per frame, against where the camera is in each frame, from half the
 * margin on, so the other half covers the frames the slices take. A zoom change or a resize still
 * culls everything at once, since what the screen shows changes at once.
 */
export const CAMERA_CULL_VIEWS_PER_FRAME = 4_000;

/** The children of the world container (the draw order's bands) still to cull after a move. */
type PendingCull = { readonly children: readonly Container[]; next: number };

/**
 * Creates the camera of `world` (the scene's world container, a render group, so moving it is a
 * GPU uniform and its children are not touched), whose views were placed with `projection`. `screen` is the renderer's screen rectangle,
 * read on every change so a resize is picked up. Culls with `Culler.shared` against the screen
 * grown by a margin, and only again when the zoom changes (at once) or the scene moved past half
 * that margin (over frames, {@link CAMERA_CULL_VIEWS_PER_FRAME}); with `cull` `false` it never
 * culls, and every view is drawn (to measure what culling saves).
 */
export function createSceneCamera(
  world: Container,
  screen: Rectangle,
  limits: CameraLimits,
  projection: IsoProjectionConfig,
  start?: Partial<Camera>,
  cull = true,
): SceneCameraService {
  let camera = createCamera(limits, start);
  let culledFor: Camera | undefined;
  let pending: PendingCull | undefined;
  let target: GridPoint | undefined;
  // The scene asks on every frame: computed again only when the camera or the screen changed.
  let seen: { camera: Camera; width: number; height: number; chunks: readonly ChunkCoord[] } | undefined;

  /** Culls the next children of `world` after a move (`pending`), about a frame's worth of views. */
  const cullSlice = (work: PendingCull) => {
    const rect = getCullRect(screen);
    let views = 0;
    while (work.next < work.children.length && views < CAMERA_CULL_VIEWS_PER_FRAME) {
      const child = work.children[work.next];
      work.next += 1;
      // A band emptied since the move is gone; one made since was culled with its views.
      if (child.destroyed) continue;
      Culler.shared.cull(child, rect, false);
      views += Math.max(child.children.length, 1);
    }
    if (work.next === work.children.length) pending = undefined;
  };

  const apply = (force = false) => {
    const { x, y, scale } = getCameraTransform(camera, screen, projection);
    world.position.set(x, y);
    world.scale.set(scale);
    if (!cull) return;
    if (force || culledFor?.zoom !== camera.zoom) {
      Culler.shared.cull(world, getCullRect(screen), false);
      culledFor = camera;
      pending = undefined;
    } else if (needsCull(culledFor, camera, screen, projection, CAMERA_CULL_MARGIN / 2)) {
      culledFor = camera;
      pending = { children: [...world.children], next: 0 };
      cullSlice(pending);
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
    cullViews(views, margin) {
      if (!cull) return;
      const rect = getCullRect(screen, margin);
      views.forEach(({ view }) => Culler.shared.cull(view, rect, false));
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
      // The slice of a move culled in this frame stays; the next one goes now.
      const culling = pending;
      if (target) moveTo(followCamera(camera, target, elapsedMs, limits));
      if (culling && culling === pending) cullSlice(culling);
    },
  };
}
