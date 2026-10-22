import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => ({ Culler: { shared: { cull: vi.fn() } } }));

import { Culler } from "pixi.js";
import type { CameraLimits } from "../../types";
import { CAMERA_FOLLOW_HALF_LIFE_MS, getCullRect } from "../camera";
import { createSceneCamera } from "./camera";

const limits: CameraLimits = {
  minZoom: 1,
  maxZoom: 4,
  bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
};
/** 40 × 20 px tiles; ground (0, 0) at scene (0, 0). */
const projection = { tileWidth: 40, tileHeight: 20, originX: 0, originY: 0 };

/** A world container that records its transform. */
const createWorld = () => {
  const world = {
    position: { x: 0, y: 0, set: vi.fn((x: number, y: number) => Object.assign(world.position, { x, y })) },
    scale: { x: 1, y: 1, set: vi.fn((value: number) => Object.assign(world.scale, { x: value, y: value })) },
  };
  return world;
};

describe("createSceneCamera", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = (start?: { x?: number; y?: number; zoom?: number }) => {
    const world = createWorld();
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

  it("pans without culling until the scene moved past the margin", () => {
    const { world, camera } = setup({ x: 0, y: 0, zoom: 1 });

    camera.pan({ x: 150, y: 0 });
    expect(world.position.x).toBeCloseTo(550);
    expect(world.position.y).toBeCloseTo(300);
    expect(Culler.shared.cull).toHaveBeenCalledTimes(1);

    // The margin is 200 screen pixels across: 250 in total is past it.
    camera.pan({ x: 100, y: 0 });
    expect(Culler.shared.cull).toHaveBeenCalledTimes(2);
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
});
