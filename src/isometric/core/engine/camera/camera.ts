import { chunkRect, chunksInRect } from "../grid";
import { projectGridPoint, unprojectScreenDelta } from "../projection";
import type {
  Camera,
  ChunkCoord,
  CameraLimits,
  CameraTransform,
  GridPoint,
  IsoProjectionConfig,
  PinchGesture,
  ScreenPoint,
  ScreenSize,
} from "../../types";

/** Zoom the camera starts at: close to the ground, at the centre of the world. */
export const CAMERA_START_ZOOM = 8;

/** Smallest zoom: a whole chunk (32 × 32 columns) fits a window 1300 px wide. */
export const CAMERA_MIN_ZOOM = 1;

/**
 * Largest zoom. The scene rasterizes the SVGs for it (`getSvgResolution()`), so raising it
 * grows texture memory with its square.
 */
export const CAMERA_MAX_ZOOM = 8;

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

/**
 * Blocks above the ground a chunk's content may reach on screen when looking for the chunks in
 * view: the highest terrain (4) and the tallest entities on it (6).
 */
export const CHUNK_VIEW_RISE = 10;

/** Blocks below the ground a chunk's content may reach on screen: the deepest water (−3) and the block under it. */
export const CHUNK_VIEW_DROP = 4;

/**
 * Part of the viewport, on every side, around the screen in which a chunk counts as in view: it is
 * shown a little before it scrolls in.
 */
export const CHUNK_VIEW_MARGIN = 0.1;

/**
 * Chunks with something on screen for `camera` in `viewport`, the screen grown by `margin` on
 * every side: each chunk's ground, raised {@link CHUNK_VIEW_RISE} blocks and
 * lowered {@link CHUNK_VIEW_DROP}, must overlap it on screen. Nearest the centre of the view
 * first (ties by `cy`, then `cx`), so what loads first is what the player looks at.
 */
export function getVisibleChunks(
  camera: Camera,
  viewport: ScreenSize,
  projection: IsoProjectionConfig,
  margin: number = CHUNK_VIEW_MARGIN,
): ChunkCoord[] {
  const step = projection.elevationStep ?? projection.tileHeight / 2;
  const cull = getCullRect(viewport, margin);
  const corners = [
    { x: cull.x, y: cull.y },
    { x: cull.x + cull.width, y: cull.y },
    { x: cull.x, y: cull.y + cull.height },
    { x: cull.x + cull.width, y: cull.y + cull.height },
  ].map((corner) => screenToGround(camera, viewport, corner, projection));
  // Ground under the screen, grown by how far raised and lowered content shifts along x and y.
  const shift = (Math.max(CHUNK_VIEW_RISE, CHUNK_VIEW_DROP) * step) / projection.tileHeight + 1;
  const candidates = chunksInRect({
    minX: Math.floor(Math.min(...corners.map(({ x }) => x)) - shift),
    minY: Math.floor(Math.min(...corners.map(({ y }) => y)) - shift),
    maxX: Math.ceil(Math.max(...corners.map(({ x }) => x)) + shift),
    maxY: Math.ceil(Math.max(...corners.map(({ y }) => y)) + shift),
  });

  const transform = getCameraTransform(camera, viewport, projection);
  const toScreen = (point: GridPoint) => {
    const scene = projectGridPoint(point, projection);
    return { x: scene.x * transform.scale + transform.x, y: scene.y * transform.scale + transform.y };
  };
  const seen = (coord: ChunkCoord) => {
    const { minX, minY, maxX, maxY } = chunkRect(coord);
    const ground = [
      { x: minX - 0.5, y: minY - 0.5 },
      { x: maxX + 0.5, y: minY - 0.5 },
      { x: minX - 0.5, y: maxY + 0.5 },
      { x: maxX + 0.5, y: maxY + 0.5 },
    ].map(toScreen);
    const left = Math.min(...ground.map(({ x }) => x));
    const right = Math.max(...ground.map(({ x }) => x));
    const top = Math.min(...ground.map(({ y }) => y)) - CHUNK_VIEW_RISE * step * camera.zoom;
    const bottom = Math.max(...ground.map(({ y }) => y)) + CHUNK_VIEW_DROP * step * camera.zoom;
    return left < cull.x + cull.width && right > cull.x && top < cull.y + cull.height && bottom > cull.y;
  };

  const middle = (coord: ChunkCoord) => {
    const { minX, minY, maxX, maxY } = chunkRect(coord);
    return ((minX + maxX) / 2 - camera.x) ** 2 + ((minY + maxY) / 2 - camera.y) ** 2;
  };
  return candidates.filter(seen).sort((a, b) => middle(a) - middle(b) || a.cy - b.cy || a.cx - b.cx);
}
