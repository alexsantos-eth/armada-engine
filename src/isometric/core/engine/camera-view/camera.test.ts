import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => ({ Culler: { shared: { cull: vi.fn() } } }));

import { Culler } from "pixi.js";
import type { CameraLimits } from "../../types";
import { CAMERA_FOLLOW_HALF_LIFE_MS, getCullRect, getVisibleChunks } from "../camera";
import { CAMERA_CULL_VIEWS_PER_FRAME, createSceneCamera } from "./camera";

const limits: CameraLimits = {
  minZoom: 1,
  maxZoom: 4,
  bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
};
/** 40 × 20 px tiles; ground (0, 0) at scene (0, 0). */
const projection = { tileWidth: 40, tileHeight: 20, originX: 0, originY: 0 };

/** A child of the world container (a band of the draw order) holding `views` views. */
const band = (views: number, destroyed = false) => ({ children: Array.from({ length: views }), destroyed });

/** A world container that records its transform, with `children` (bands). */
const createWorld = (children: ReturnType<typeof band>[] = []) => {
  const world = {
    children,
    position: { x: 0, y: 0, set: vi.fn((x: number, y: number) => Object.assign(world.position, { x, y })) },
    scale: { x: 1, y: 1, set: vi.fn((value: number) => Object.assign(world.scale, { x: value, y: value })) },
  };
  return world;
};

describe("createSceneCamera", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = (start?: { x?: number; y?: number; zoom?: number }, children: ReturnType<typeof band>[] = []) => {
    const world = createWorld(children);
    const screen = { x: 0, y: 0, width: 800, height: 600 };
    const camera = createSceneCamera(world as never, screen as never, limits, projection, start);
    return { world, screen, camera };
  };

  it("applies the start camera and culls once against the screen grown by the margin", () => {
    const { world, camera } = setup({ x: 3, y: 1, zoom: 2 });

    // Ground (3, 1) is scene (40, −40).
    expect(camera.state).toEqual({ x: 3, y: 1, zoom: 2 });
    expect(world.position).toMatchObject({ x: 320, y: 380 });
    expect(world.scale).toMatchObject({ x: 2, y: 2 });
    expect(Culler.shared.cull).toHaveBeenCalledTimes(1);
    expect(Culler.shared.cull).toHaveBeenCalledWith(world, getCullRect({ width: 800, height: 600 }), false);
  });

  it("never culls when culling is off, so every view is drawn", () => {
    const world = createWorld();
    const screen = { x: 0, y: 0, width: 800, height: 600 };
    const camera = createSceneCamera(world as never, screen as never, limits, projection, undefined, false);

    camera.pan({ x: 500, y: 0 });
    camera.resize();
    camera.cullViews([{ view: {} as never, depth: 0, layer: 0 }]);
    expect(Culler.shared.cull).not.toHaveBeenCalled();
  });

  it("culls only the views it is given, against the screen it culls the scene with", () => {
    const { camera, screen } = setup();
    vi.mocked(Culler.shared.cull).mockClear();
    const first = { name: "first" };
    const second = { name: "second" };
    screen.width = 1000;

    camera.cullViews([
      { view: first as never, depth: 0, layer: 0 },
      { view: second as never, depth: 1, layer: 2 },
    ]);
    expect(vi.mocked(Culler.shared.cull).mock.calls).toEqual([
      [first, getCullRect({ width: 1000, height: 600 }), false],
      [second, getCullRect({ width: 1000, height: 600 }), false],
    ]);
  });

  it("accepts a tighter margin for receivers recomputed every frame", () => {
    const { camera, screen } = setup();
    const view = {} as never;
    camera.cullViews([{ view, depth: 0, layer: 0 }], 0.03);
    expect(Culler.shared.cull).toHaveBeenLastCalledWith(view, getCullRect(screen, 0.03), false);
  });

  it("pans without culling until the scene moved past half the margin", () => {
    const { world, camera } = setup({ x: 0, y: 0, zoom: 1 }, [band(1)]);

    camera.pan({ x: 90, y: 0 });
    expect(world.position.x).toBeCloseTo(490);
    expect(world.position.y).toBeCloseTo(300);
    expect(Culler.shared.cull).toHaveBeenCalledTimes(1);

    // The margin is 200 screen pixels across: 110 in total is past its half.
    camera.pan({ x: 20, y: 0 });
    expect(Culler.shared.cull).toHaveBeenCalledTimes(2);
  });

  it("after a move culls the scene's children a frame's worth of views at a time, where it looks then", () => {
    const children = [band(CAMERA_CULL_VIEWS_PER_FRAME - 1), band(2), band(0), band(5)];
    const { world, screen, camera } = setup({ x: 0, y: 0, zoom: 1 }, children);
    vi.mocked(Culler.shared.cull).mockClear();

    camera.pan({ x: 110, y: 0 });
    // The first frame: children until a frame's worth of views, the one that passes it included.
    expect(vi.mocked(Culler.shared.cull).mock.calls).toEqual([
      [children[0], getCullRect(screen), false],
      [children[1], getCullRect(screen), false],
    ]);
    expect(world.position.set).toHaveBeenCalled();

    screen.width = 1000;
    camera.update(16);
    // The rest on the next frame, against the screen then; a childless child counts as one view.
    expect(vi.mocked(Culler.shared.cull).mock.calls.slice(2)).toEqual([
      [children[2], getCullRect({ width: 1000, height: 600 }), false],
      [children[3], getCullRect({ width: 1000, height: 600 }), false],
    ]);
    camera.update(16);
    expect(Culler.shared.cull).toHaveBeenCalledTimes(4);
  });

  it("skips the children taken out since the move", () => {
    const children = [band(CAMERA_CULL_VIEWS_PER_FRAME), band(3), band(4)];
    const { camera } = setup({ x: 0, y: 0, zoom: 1 }, children);
    vi.mocked(Culler.shared.cull).mockClear();

    camera.pan({ x: 110, y: 0 });
    children[1].destroyed = true;
    camera.update(16);
    expect(vi.mocked(Culler.shared.cull).mock.calls.map(([child]) => child)).toEqual([children[0], children[2]]);
  });

  it("starts over on another move, and culls everything at once on a zoom change", () => {
    const children = [band(CAMERA_CULL_VIEWS_PER_FRAME), band(1)];
    const { world, camera } = setup({ x: 0, y: 0, zoom: 1 }, children);
    vi.mocked(Culler.shared.cull).mockClear();

    camera.pan({ x: 110, y: 0 });
    camera.pan({ x: 110, y: 0 });
    expect(vi.mocked(Culler.shared.cull).mock.calls.map(([child]) => child)).toEqual([children[0], children[0]]);

    camera.zoomAt(2, { x: 400, y: 300 });
    expect(Culler.shared.cull).toHaveBeenLastCalledWith(world, expect.anything(), false);
    camera.update(16);
    expect(Culler.shared.cull).toHaveBeenCalledTimes(3);
  });

  it("culls the rest of a move after the glide of the frame, unless the glide moved past half the margin again", () => {
    const children = [band(CAMERA_CULL_VIEWS_PER_FRAME), band(1)];
    const { camera } = setup({ x: 0, y: 0, zoom: 1 }, children);
    vi.mocked(Culler.shared.cull).mockClear();

    camera.pan({ x: 110, y: 0 });
    camera.follow({ x: 0.1, y: 0 });
    camera.update(16);
    expect(vi.mocked(Culler.shared.cull).mock.calls.map(([child]) => child)).toEqual([children[0], children[1]]);

    // A glide far enough starts the culling over instead.
    camera.pan({ x: -110, y: 0 });
    camera.follow({ x: 40, y: 0 });
    vi.mocked(Culler.shared.cull).mockClear();
    camera.update(1000);
    expect(vi.mocked(Culler.shared.cull).mock.calls.map(([child]) => child)).toEqual([children[0]]);
  });

  it("does nothing when a pan is stopped by the bounds", () => {
    const { world, camera } = setup({ x: 100, y: -100, zoom: 1 });
    world.position.set.mockClear();

    // At the east corner: dragging left shows the east (+x −y), past both bounds.
    camera.pan({ x: -40, y: 0 });
    expect(world.position.set).not.toHaveBeenCalled();
    expect(camera.state).toEqual({ x: 100, y: -100, zoom: 1 });
  });

  it("culls again on every zoom change, and ignores zooms that change nothing", () => {
    const { world, camera } = setup({ zoom: 2 });

    camera.zoomAt(1.5, { x: 400, y: 300 });
    expect(camera.state.zoom).toBe(3);
    expect(world.scale.x).toBe(3);
    expect(Culler.shared.cull).toHaveBeenCalledTimes(2);

    camera.zoomAt(0, { x: 400, y: 300 });
    camera.zoomAt(1, { x: 400, y: 300 });
    expect(Culler.shared.cull).toHaveBeenCalledTimes(2);
  });

  it("re-centres and culls on resize, reading the screen it was given", () => {
    const { world, screen, camera } = setup({ x: 0, y: 0, zoom: 1 });

    screen.width = 1000;
    camera.resize();
    expect(world.position).toMatchObject({ x: 500, y: 300 });
    expect(Culler.shared.cull).toHaveBeenCalledTimes(2);
    expect(Culler.shared.cull).toHaveBeenLastCalledWith(world, getCullRect({ width: 1000, height: 600 }), false);
  });

  it("glides towards the point it follows, frame by frame, without moving when there is none", () => {
    const { world, camera } = setup({ x: 0, y: 0, zoom: 1 });
    world.position.set.mockClear();

    camera.update(16);
    expect(world.position.set).not.toHaveBeenCalled();

    camera.follow({ x: 10, y: 4 });
    camera.update(CAMERA_FOLLOW_HALF_LIFE_MS);
    expect(camera.state.x).toBeCloseTo(5);
    expect(camera.state.y).toBeCloseTo(2);
    for (let frame = 0; frame < 60; frame += 1) camera.update(50);
    expect(camera.state).toEqual({ x: 10, y: 4, zoom: 1 });

    world.position.set.mockClear();
    camera.update(16);
    expect(world.position.set).not.toHaveBeenCalled();
  });

  it("stops following when dragged, until told to follow again", () => {
    const { camera } = setup({ x: 0, y: 0, zoom: 1 });

    camera.follow({ x: 10, y: 4 });
    camera.pan({ x: 40, y: 0 });
    const dragged = camera.state;
    camera.update(1000);
    expect(camera.state).toEqual(dragged);

    camera.follow({ x: 10, y: 4 });
    camera.update(1000);
    expect(camera.state.x).toBeGreaterThan(dragged.x);
  });

  it("says which chunks are in view where it looks now", () => {
    const { screen, camera } = setup({ x: 40, y: 8, zoom: 2 });

    expect(camera.visibleChunks()).toEqual(getVisibleChunks(camera.state, screen, projection));
    expect(camera.visibleChunks()[0]).toEqual({ cx: 1, cy: 0 });
  });

  it("works the chunks in view out again only when the camera or the screen changed", () => {
    const { screen, camera } = setup({ x: 40, y: 8, zoom: 2 });
    const first = camera.visibleChunks();

    expect(camera.visibleChunks()).toBe(first);
    screen.width = 1600;
    const wider = camera.visibleChunks();
    expect(wider).not.toBe(first);
    expect(wider.length).toBeGreaterThan(first.length);
    screen.height = 900;
    expect(camera.visibleChunks()).not.toBe(wider);
    const tall = camera.visibleChunks();
    camera.pan({ x: 200, y: 0 });
    expect(camera.visibleChunks()).not.toBe(tall);
  });
});
