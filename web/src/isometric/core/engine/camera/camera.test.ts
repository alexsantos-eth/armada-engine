import { describe, expect, it } from "vitest";
import { projectGridPoint } from "../projection";
import type { Camera, CameraLimits } from "../../types";
import {
  CAMERA_FOLLOW_HALF_LIFE_MS,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  CAMERA_START_ZOOM,
  CHUNK_VIEW_MARGIN,
  clampCamera,
  createCamera,
  getCameraTransform,
  followCamera,
  getCullRect,
  getVisibleChunks,
  getGroundPointBelow,
  getPinchGesture,
  getWheelZoomFactor,
  needsCull,
  panCamera,
  screenToGround,
  zoomCameraAt,
} from "./camera";

/** 40 × 20 px tiles; ground (0, 0) at scene (0, 0). */
const projection = { tileWidth: 40, tileHeight: 20, originX: 0, originY: 0 };
const limits: CameraLimits = {
  minZoom: 1,
  maxZoom: 4,
  bounds: { minX: 0, minY: 0, maxX: 31, maxY: 31 },
};
const open: CameraLimits = { ...limits, bounds: { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 } };
const viewport = { width: 800, height: 600 };

/** Where a ground point is drawn on screen with `camera`. */
const onScreen = (camera: Camera, point: { x: number; y: number }) => {
  const { x, y, scale } = getCameraTransform(camera, viewport, projection);
  const scene = projectGridPoint(point, projection);
  return { x: x + scene.x * scale, y: y + scene.y * scale };
};

describe("camera defaults", () => {
  it("starts zoomed in, inside the zoom range", () => {
    expect(CAMERA_MIN_ZOOM).toBeLessThan(CAMERA_START_ZOOM);
    expect(CAMERA_START_ZOOM).toBeLessThanOrEqual(CAMERA_MAX_ZOOM);
  });
});

describe("createCamera", () => {
  it("looks at the centre of its bounds with the start zoom", () => {
    const game = { ...limits, maxZoom: CAMERA_MAX_ZOOM };
    expect(createCamera(game)).toEqual({ x: 15.5, y: 15.5, zoom: CAMERA_START_ZOOM });
  });

  it("accepts a start point and zoom, clamped to the limits", () => {
    expect(createCamera(limits, { x: 10, y: 5, zoom: 2 })).toEqual({ x: 10, y: 5, zoom: 2 });
    expect(createCamera(limits, { x: 500, y: -500, zoom: 10 })).toEqual({ x: 31, y: 0, zoom: 4 });
  });

  it.each([
    ["a zero minimum zoom", { ...limits, minZoom: 0 }],
    ["a minimum above the maximum", { ...limits, minZoom: 5 }],
    ["an infinite maximum", { ...limits, maxZoom: Infinity }],
    ["inverted x bounds", { ...limits, bounds: { ...limits.bounds, minX: 1, maxX: 0 } }],
    ["inverted y bounds", { ...limits, bounds: { ...limits.bounds, minY: 1, maxY: 0 } }],
    ["NaN bounds", { ...limits, bounds: { ...limits.bounds, minX: Number.NaN } }],
  ])("rejects limits with %s", (_name, invalid) => {
    expect(() => createCamera(invalid)).toThrow(RangeError);
  });
});

describe("clampCamera", () => {
  it("keeps the centre inside the ground bounds and the zoom inside its range", () => {
    expect(clampCamera({ x: -3, y: 40, zoom: 0.5 }, limits)).toEqual({ x: 0, y: 31, zoom: 1 });
    expect(clampCamera({ x: 3, y: 4, zoom: 2 }, limits)).toEqual({ x: 3, y: 4, zoom: 2 });
  });
});

describe("getCameraTransform", () => {
  it("puts the camera's ground point at the centre of the viewport, scaled by the zoom", () => {
    const camera: Camera = { x: 3, y: 1, zoom: 2 };
    // Ground (3, 1) is scene (40, −40).
    expect(getCameraTransform(camera, viewport, projection)).toEqual({ x: 320, y: 380, scale: 2 });
    expect(onScreen(camera, camera)).toEqual({ x: 400, y: 300 });
  });
});

describe("screenToGround", () => {
  it("finds the ground point drawn at a screen point", () => {
    const camera: Camera = { x: 10, y: 4, zoom: 2.5 };
    const ground = screenToGround(camera, viewport, { x: 123, y: 456 }, projection);
    const back = onScreen(camera, ground);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });
});

describe("panCamera", () => {
  it("moves the ground with the drag: what was under the pointer stays under it", () => {
    const camera: Camera = { x: 10, y: 10, zoom: 2 };
    const ground = screenToGround(camera, viewport, { x: 500, y: 200 }, projection);
    const panned = panCamera(camera, { x: 30, y: -15 }, open, projection);
    const moved = onScreen(panned, ground);
    expect(moved.x).toBeCloseTo(530);
    expect(moved.y).toBeCloseTo(185);
  });

  it("dragging right shows what is to the left (−x +y, west)", () => {
    const panned = panCamera({ x: 10, y: 10, zoom: 1 }, { x: 40, y: 0 }, open, projection);
    expect(panned).toEqual({ x: 9, y: 11, zoom: 1 });
  });

  it("stops at the bounds", () => {
    expect(panCamera({ x: 31, y: 0, zoom: 1 }, { x: -400, y: 0 }, limits, projection)).toEqual({
      x: 31,
      y: 0,
      zoom: 1,
    });
  });
});

describe("zoomCameraAt", () => {
  it("keeps the ground point under the anchor fixed on screen", () => {
    const camera: Camera = { x: 10, y: 12, zoom: 2 };
    const anchor = { x: 700, y: 100 };
    const ground = screenToGround(camera, viewport, anchor, projection);
    const zoomed = zoomCameraAt(camera, 1.5, anchor, viewport, open, projection);

    expect(zoomed.zoom).toBe(3);
    const after = onScreen(zoomed, ground);
    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });

  it("zooming at the centre of the viewport keeps the camera centre", () => {
    expect(zoomCameraAt({ x: 5, y: 6, zoom: 2 }, 0.5, { x: 400, y: 300 }, viewport, limits, projection)).toEqual({
      x: 5,
      y: 6,
      zoom: 1,
    });
  });

  it("clamps the zoom to its range and the centre to the bounds", () => {
    // Zooming in towards the far left of the screen, from the west corner of the world.
    const zoomed = zoomCameraAt({ x: 0, y: 31, zoom: 1 }, 10, { x: 0, y: 300 }, viewport, limits, projection);
    expect(zoomed).toEqual({ x: 0, y: 31, zoom: 4 });
  });

  it("ignores factors that are not positive and finite", () => {
    const camera: Camera = { x: 1, y: 2, zoom: 2 };
    [0, -1, Number.NaN, Infinity].forEach((factor) => {
      expect(zoomCameraAt(camera, factor, { x: 0, y: 0 }, viewport, limits, projection)).toBe(camera);
    });
  });
});

describe("getWheelZoomFactor", () => {
  it("zooms in when the wheel goes up and out when it goes down, symmetrically", () => {
    expect(getWheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(getWheelZoomFactor(100)).toBeLessThan(1);
    expect(getWheelZoomFactor(100) * getWheelZoomFactor(-100)).toBeCloseTo(1);
    expect(getWheelZoomFactor(0)).toBe(1);
  });

  it("converts line and page deltas to pixels", () => {
    expect(getWheelZoomFactor(3, 1)).toBeCloseTo(getWheelZoomFactor(120));
    expect(getWheelZoomFactor(1, 2)).toBeCloseTo(getWheelZoomFactor(800));
    expect(getWheelZoomFactor(100, 7)).toBe(getWheelZoomFactor(100));
  });

  it("ignores invalid deltas", () => {
    expect(getWheelZoomFactor(Number.NaN)).toBe(1);
    expect(getWheelZoomFactor(Infinity)).toBe(1);
  });
});

describe("getGroundPointBelow", () => {
  it("finds the ground point drawn where a raised point is", () => {
    const raised = { ...projection, elevationStep: 13 };
    const ground = getGroundPointBelow({ x: 4, y: 2 }, 3, raised);
    const top = projectGridPoint({ x: 4, y: 2 }, raised);
    const below = projectGridPoint(ground, raised);
    expect(below.x).toBeCloseTo(top.x);
    expect(below.y).toBeCloseTo(top.y - 3 * 13);
  });

  it("defaults the elevation step to half a tile and keeps points on the ground", () => {
    expect(getGroundPointBelow({ x: 1, y: 2 }, 2, projection)).toEqual({ x: 2, y: 3 });
    expect(getGroundPointBelow({ x: 1, y: 2 }, 0, projection)).toEqual({ x: 1, y: 2 });
  });
});

describe("followCamera", () => {
  const camera: Camera = { x: 0, y: 0, zoom: 2 };

  it("covers half the distance every half-life, whatever the frame rate", () => {
    const half = followCamera(camera, { x: 8, y: -4 }, 100, open, 100);
    expect(half).toEqual({ x: 4, y: -2, zoom: 2 });

    let stepped = camera;
    for (let frame = 0; frame < 10; frame += 1) stepped = followCamera(stepped, { x: 8, y: -4 }, 10, open, 100);
    expect(stepped.x).toBeCloseTo(4);
    expect(stepped.y).toBeCloseTo(-2);
  });

  it("uses the default half-life and snaps on once close enough", () => {
    const near = followCamera(camera, { x: 0.001, y: 0 }, CAMERA_FOLLOW_HALF_LIFE_MS, open);
    expect(near).toEqual({ x: 0.001, y: 0, zoom: 2 });
    const far = followCamera(camera, { x: 1, y: 0 }, CAMERA_FOLLOW_HALF_LIFE_MS, open);
    expect(far.x).toBeCloseTo(0.5);
  });

  it("stays inside the bounds and ignores invalid frame times", () => {
    expect(followCamera(camera, { x: -50, y: 0 }, 10_000, limits)).toEqual({ x: 0, y: 0, zoom: 2 });
    [0, -5, Number.NaN, Infinity].forEach((elapsedMs) => {
      expect(followCamera(camera, { x: 5, y: 5 }, elapsedMs, open)).toBe(camera);
    });
  });
});

describe("getCullRect and needsCull", () => {
  it("culls against the viewport grown by the margin on every side", () => {
    expect(getCullRect(viewport, 0.25)).toEqual({ x: -200, y: -150, width: 1200, height: 900 });
    expect(getCullRect(viewport)).toEqual({ x: -80, y: -60, width: 960, height: 720 });
  });

  it("culls again when nothing was culled yet or the zoom changed", () => {
    expect(needsCull(undefined, { x: 0, y: 0, zoom: 1 }, viewport, projection)).toBe(true);
    expect(needsCull({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0, zoom: 1.1 }, viewport, projection)).toBe(true);
  });

  it("culls again only once the scene moved further than the margin on screen", () => {
    const culled: Camera = { x: 0, y: 0, zoom: 2 };
    // The margin is 200 × 150 screen pixels. One column along +x −y is 40 px across at zoom 2.
    expect(needsCull(culled, { x: 2.5, y: -2.5, zoom: 2 }, viewport, projection, 0.25)).toBe(false);
    expect(needsCull(culled, { x: 2.6, y: -2.6, zoom: 2 }, viewport, projection, 0.25)).toBe(true);
    // Along +x +y, one column is 20 px up at zoom 2: 150 px is 7.5 columns.
    expect(needsCull(culled, { x: 3.75, y: 3.75, zoom: 2 }, viewport, projection, 0.25)).toBe(false);
    expect(needsCull(culled, { x: 3.8, y: 3.8, zoom: 2 }, viewport, projection, 0.25)).toBe(true);
  });
});

describe("getPinchGesture", () => {
  it("zooms by how much the fingers spread, at their new midpoint", () => {
    const gesture = getPinchGesture(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 75, y: 100 },
        { x: 225, y: 100 },
      ],
    );

    expect(gesture).toEqual({ pan: { x: 0, y: 0 }, factor: 1.5, anchor: { x: 150, y: 100 } });
  });

  it("pans by the move of the midpoint", () => {
    const gesture = getPinchGesture(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      [
        { x: 30, y: 10 },
        { x: 30, y: 60 },
      ],
    );

    expect(gesture.pan).toEqual({ x: 30, y: -15 });
    expect(gesture.factor).toBe(0.5);
    expect(gesture.anchor).toEqual({ x: 30, y: 35 });
  });

  it("does not zoom when the fingers started or ended on the same point", () => {
    const same = { x: 50, y: 50 };
    expect(getPinchGesture([same, same], [same, { x: 80, y: 90 }]).factor).toBe(1);
    expect(getPinchGesture([same, { x: 80, y: 90 }], [same, same]).factor).toBe(1);
  });

  it("a pinch applied with panCamera and zoomCameraAt keeps the ground under the fingers", () => {
    const from = [
      { x: 300, y: 250 },
      { x: 420, y: 330 },
    ] as const;
    const to = [
      { x: 280, y: 260 },
      { x: 470, y: 360 },
    ] as const;
    const start: Camera = { x: 10, y: 12, zoom: 2 };

    const { pan, factor, anchor } = getPinchGesture(from, to);
    const panned = panCamera(start, pan, open, projection);
    const next = zoomCameraAt(panned, factor, anchor, viewport, open, projection);

    const midpoint = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
    const groundUnderMidpoint = screenToGround(start, viewport, midpoint, projection);
    const after = screenToGround(next, viewport, anchor, projection);
    expect(after.x).toBeCloseTo(groundUnderMidpoint.x);
    expect(after.y).toBeCloseTo(groundUnderMidpoint.y);
    expect(next.zoom).toBeCloseTo(2 * factor);
  });
});

describe("getVisibleChunks", () => {
  it("is the chunks whose ground or raised content reaches the screen, nearest the camera first", () => {
    expect(CHUNK_VIEW_MARGIN).toBeGreaterThan(0);
    expect(getVisibleChunks({ x: 15.5, y: 15.5, zoom: 4 }, viewport, projection)).toEqual([{ cx: 0, cy: 0 }]);
    // On a chunk corner, the four chunks that meet there.
    expect(getVisibleChunks({ x: 31.5, y: 31.5, zoom: 4 }, viewport, projection, 0)).toEqual([
      { cx: 0, cy: 0 },
      { cx: 1, cy: 0 },
      { cx: 0, cy: 1 },
      { cx: 1, cy: 1 },
    ]);
  });

  it("sees more chunks zoomed out, but not those past the screen's left and right edges", () => {
    expect(getVisibleChunks({ x: 15.5, y: 15.5, zoom: 1 }, viewport, projection)).toEqual([
      { cx: 0, cy: 0 },
      { cx: 0, cy: -1 },
      { cx: -1, cy: 0 },
      { cx: 1, cy: 0 },
      { cx: 0, cy: 1 },
      { cx: -1, cy: -1 },
      { cx: 1, cy: 1 },
    ]);
  });
});
