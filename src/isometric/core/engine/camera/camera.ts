import { projectGridPoint, unprojectScreenDelta } from "../projection";
import type {
  Camera,
  CameraLimits,
  CameraTransform,
  GridPoint,
  IsoProjectionConfig,
  PinchGesture,
  ScreenPoint,
  ScreenSize,
} from "../../types";

/** Zoom the camera starts at: close to the ground, at the centre of the world. */
export const CAMERA_START_ZOOM = 3;

/** Smallest zoom: the whole 32 × 32 world fits a window 1300 px wide. */
export const CAMERA_MIN_ZOOM = 1;

/**
 * Largest zoom. The scene rasterizes the SVGs for it (`getSvgResolution()`), so raising it
 * grows texture memory with its square.
 */
export const CAMERA_MAX_ZOOM = 4;

/**
 * How fast the camera catches up with what it follows (`followCamera()`): it covers half the
 * distance left every this many real milliseconds, whatever the frame rate.
 */
export const CAMERA_FOLLOW_HALF_LIFE_MS = 90;

/** Distance, in columns, under which a following camera snaps onto its target. */
const FOLLOW_SNAP_DISTANCE = 1e-3;

/** Zoom change per pixel of wheel delta: `100` (one notch) zooms by about 14 %. */
export const CAMERA_WHEEL_SENSITIVITY = 0.0015;

/**
 * Part of the viewport, on every side, that culling keeps alive around the screen. The scene
 * culls again only once the camera moved further than it, not on every frame of a pan.
 */
export const CAMERA_CULL_MARGIN = 0.25;

/** Pixels per wheel line and per wheel page, for wheels that report `deltaMode` 1 or 2. */
const WHEEL_PIXELS_PER_MODE = [1, 40, 800];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function assertLimits({ minZoom, maxZoom, bounds }: CameraLimits): void {
  const finite = [minZoom, maxZoom, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite);
  if (!finite || minZoom <= 0 || minZoom > maxZoom || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new RangeError("Camera limits need a positive zoom range and min ≤ max bounds, all finite");
  }
}

/** `camera` with its zoom inside the zoom range and its centre inside the bounds. */
export function clampCamera(camera: Camera, { minZoom, maxZoom, bounds }: CameraLimits): Camera {
  return {
    x: clamp(camera.x, bounds.minX, bounds.maxX),
    y: clamp(camera.y, bounds.minY, bounds.maxY),
    zoom: clamp(camera.zoom, minZoom, maxZoom),
  };
}

/**
 * Creates a camera inside `limits`: by default at the centre of the bounds with
 * {@link CAMERA_START_ZOOM}. Throws `RangeError` on invalid limits.
 */
export function createCamera(limits: CameraLimits, start: Partial<Camera> = {}): Camera {
  assertLimits(limits);
  const { bounds } = limits;
  return clampCamera(
    {
      x: start.x ?? (bounds.minX + bounds.maxX) / 2,
      y: start.y ?? (bounds.minY + bounds.maxY) / 2,
      zoom: start.zoom ?? CAMERA_START_ZOOM,
    },
    limits,
  );
}

/** Ground point `screen` pixels away from the centre of the view, at the camera's zoom. */
function offsetOnGround(camera: Camera, screen: ScreenPoint, projection: IsoProjectionConfig): GridPoint {
  const delta = unprojectScreenDelta({ x: screen.x / camera.zoom, y: screen.y / camera.zoom }, projection);
  return { x: camera.x + delta.x, y: camera.y + delta.y };
}

/**
 * Moves the scene by `delta` screen pixels (a drag): the ground under the pointer follows it, so
 * the camera centre goes the other way.
 */
export function panCamera(
  camera: Camera,
  delta: ScreenPoint,
  limits: CameraLimits,
  projection: IsoProjectionConfig,
): Camera {
  const centre = offsetOnGround(camera, { x: -delta.x, y: -delta.y }, projection);
  return clampCamera({ ...centre, zoom: camera.zoom }, limits);
}

/** Ground point (elevation `0`) shown at the screen point `point`. */
export function screenToGround(
  camera: Camera,
  viewport: ScreenSize,
  point: ScreenPoint,
  projection: IsoProjectionConfig,
): GridPoint {
  return offsetOnGround(camera, { x: point.x - viewport.width / 2, y: point.y - viewport.height / 2 }, projection);
}

/**
 * Multiplies the zoom by `factor`, keeping the ground point under the screen point `anchor`
 * (the cursor) where it is. Factors that are not positive and finite leave the camera as is.
 */
export function zoomCameraAt(
  camera: Camera,
  factor: number,
  anchor: ScreenPoint,
  viewport: ScreenSize,
  limits: CameraLimits,
  projection: IsoProjectionConfig,
): Camera {
  if (!(factor > 0) || !Number.isFinite(factor)) return camera;
  const focus = screenToGround(camera, viewport, anchor, projection);
  const zoom = clamp(camera.zoom * factor, limits.minZoom, limits.maxZoom);
  const fromCentre = { x: viewport.width / 2 - anchor.x, y: viewport.height / 2 - anchor.y };
  const centre = offsetOnGround({ ...focus, zoom }, fromCentre, projection);
  return clampCamera({ ...centre, zoom }, limits);
}

/**
 * Position and scale of the world container (projected with `projection`) so the camera's
 * ground point sits at the centre of the viewport.
 */
export function getCameraTransform(
  camera: Camera,
  viewport: ScreenSize,
  projection: IsoProjectionConfig,
): CameraTransform {
  const centre = projectGridPoint(camera, projection);
  return {
    x: viewport.width / 2 - centre.x * camera.zoom,
    y: viewport.height / 2 - centre.y * camera.zoom,
    scale: camera.zoom,
  };
}

/**
 * Zoom factor for a wheel event's `deltaY` (in `deltaMode` units: `0` pixels, `1` lines,
 * `2` pages): up (negative) zooms in. Invalid deltas give `1`.
 */
export function getWheelZoomFactor(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY)) return 1;
  const pixels = deltaY * (WHEEL_PIXELS_PER_MODE[deltaMode] ?? 1);
  return Math.exp(-pixels * CAMERA_WHEEL_SENSITIVITY);
}

/**
 * What two fingers did between two frames, from their screen points `from` to `to` (same
 * order): the midpoint's move, to pass to `panCamera()`, and the spread ratio with the new
 * midpoint, to pass to `zoomCameraAt()` after it. Together they keep the ground under the
 * fingers' midpoint under it. Fingers that started or ended on the same point do not zoom.
 */
export function getPinchGesture(
  from: readonly [ScreenPoint, ScreenPoint],
  to: readonly [ScreenPoint, ScreenPoint],
): PinchGesture {
  const midpoint = ([a, b]: readonly [ScreenPoint, ScreenPoint]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const spread = ([a, b]: readonly [ScreenPoint, ScreenPoint]) => Math.hypot(b.x - a.x, b.y - a.y);
  const before = midpoint(from);
  const anchor = midpoint(to);
  const fromSpread = spread(from);
  const toSpread = spread(to);
  return {
    pan: { x: anchor.x - before.x, y: anchor.y - before.y },
    factor: fromSpread > 0 && toSpread > 0 ? toSpread / fromSpread : 1,
    anchor,
  };
}

/**
 * Ground point (elevation `0`) drawn at the same screen point as `point` raised `elevation`
 * blocks: what the camera must look at to centre something standing on a high column.
 */
export function getGroundPointBelow(point: GridPoint, elevation: number, projection: IsoProjectionConfig): GridPoint {
  const lift = (elevation * (projection.elevationStep ?? projection.tileHeight / 2)) / projection.tileHeight;
  return { x: point.x + lift, y: point.y + lift };
}

/**
 * Moves the camera centre towards the ground point `target` for a frame of `elapsedMs`
 * real milliseconds, easing out: it covers half the distance left every `halfLifeMs`, so the
 * motion is the same at any frame rate, and snaps on once closer than a thousandth of a column.
 * The zoom does not change. Invalid frame times leave the camera as is.
 */
export function followCamera(
  camera: Camera,
  target: GridPoint,
  elapsedMs: number,
  limits: CameraLimits,
  halfLifeMs: number = CAMERA_FOLLOW_HALF_LIFE_MS,
): Camera {
  if (!(elapsedMs > 0) || !Number.isFinite(elapsedMs)) return camera;
  const t = 1 - 2 ** (-elapsedMs / halfLifeMs);
  const close = Math.hypot(target.x - camera.x, target.y - camera.y) * (1 - t) < FOLLOW_SNAP_DISTANCE;
  const centre = close ? target : { x: camera.x + (target.x - camera.x) * t, y: camera.y + (target.y - camera.y) * t };
  return clampCamera({ ...centre, zoom: camera.zoom }, limits);
}

/** Screen rectangle to cull against: the viewport grown by `margin` of its size on every side. */
export function getCullRect(viewport: ScreenSize, margin: number = CAMERA_CULL_MARGIN) {
  const marginX = viewport.width * margin;
  const marginY = viewport.height * margin;
  return { x: -marginX, y: -marginY, width: viewport.width + 2 * marginX, height: viewport.height + 2 * marginY };
}

/**
 * Whether the scene must be culled again for `camera`, given the camera it was last culled for:
 * always on a zoom change, and once the scene moved on screen further than the margin.
 */
export function needsCull(
  culledFor: Camera | undefined,
  camera: Camera,
  viewport: ScreenSize,
  projection: IsoProjectionConfig,
  margin: number = CAMERA_CULL_MARGIN,
): boolean {
  if (!culledFor || culledFor.zoom !== camera.zoom) return true;
  const from = projectGridPoint(culledFor, projection);
  const to = projectGridPoint(camera, projection);
  return (
    Math.abs(to.x - from.x) * camera.zoom > viewport.width * margin ||
    Math.abs(to.y - from.y) * camera.zoom > viewport.height * margin
  );
}
