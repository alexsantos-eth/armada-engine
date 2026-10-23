import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../scene/testing/harness")).mockPixi());
vi.mock("../render", async () => (await import("../scene/testing/harness")).mockRender());

import { Culler } from "pixi.js";
import { CAMERA_START_ZOOM, getCullRect } from "../camera";
import { TILE_METRICS } from "../constants";
import type { SceneModule } from "../scene";
import { defaultWorld, mountScene, resetHarness, worldFrom } from "../scene/testing/harness";
import type { SceneCamera } from "../../types";
import { createCameraView } from "./camera-view";

const cameraOf = (scene: { services: { camera?: SceneCamera } }) => scene.services.camera as SceneCamera;

describe("createCameraView", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("puts the camera's ground point at the screen centre, ground (0, 0) at scene (0, 0)", async () => {
    const { root, scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 0 }]), [
      createCameraView({ start: { x: 0, y: 0, zoom: 2 } }),
    ]);

    expect(cameraOf(scene).state).toEqual({ x: 0, y: 0, zoom: 2 });
    expect(root.position).toMatchObject({ x: 650, y: 500 });
    expect(root.scale).toMatchObject({ x: 2, y: 2 });
    scene.destroy();
  });

  it("starts zoomed in at the centre of the world without a focus", async () => {
    const world = defaultWorld();
    const { root, scene } = await mountScene(world, [createCameraView()]);
    const centre = (world.width - 1) / 2;

    expect(cameraOf(scene).state).toEqual({ x: centre, y: centre, zoom: CAMERA_START_ZOOM });
    // Ground (c, c) is drawn c · tileHeight above scene (0, 0).
    expect(root.position.x).toBeCloseTo(650);
    expect(root.position.y).toBeCloseTo(500 + centre * TILE_METRICS.tileHeight * CAMERA_START_ZOOM);
    scene.destroy();
  });

  it("starts on the scene's focus when a module before it provides one", async () => {
    const focus: SceneModule = {
      id: "focus",
      setup: () => ({ provides: { focus: { ground: () => ({ x: 4, y: 2 }) } }, destroy: () => {} }),
    };
    const { scene } = await mountScene(defaultWorld(), [focus, createCameraView()]);

    expect(cameraOf(scene).state).toEqual({ x: 4, y: 2, zoom: CAMERA_START_ZOOM });
    scene.destroy();
  });

  it("keeps the camera inside the world's columns", async () => {
    const world = defaultWorld();
    const { scene } = await mountScene(world, [createCameraView({ start: { x: 1e6, y: -5 } })]);

    expect(cameraOf(scene).state).toMatchObject({ x: world.width - 1, y: 0, zoom: CAMERA_START_ZOOM });
    scene.destroy();
  });

  it("moves the world container when the camera pans or zooms", async () => {
    const { root, scene } = await mountScene(defaultWorld(), [createCameraView()]);
    const { x, y } = root.position;

    cameraOf(scene).pan({ x: 30, y: -15 });
    expect(root.position.x).toBeCloseTo(x + 30);
    expect(root.position.y).toBeCloseTo(y - 15);
    cameraOf(scene).zoomAt(0.5, { x: 650, y: 500 });
    expect(root.scale).toMatchObject({ x: CAMERA_START_ZOOM / 2 });
    scene.destroy();
  });

  it("culls once the views are in and on every renderer resize, never per frame", async () => {
    const { renderer, ticker, root, scene } = await mountScene(defaultWorld(), [createCameraView()]);
    const cullRect = getCullRect({ width: 1300, height: 1000 });
    const built = vi.mocked(Culler.shared.cull).mock.calls.length;

    expect(Culler.shared.cull).toHaveBeenLastCalledWith(root, cullRect, false);
    ticker.frame();
    ticker.frame();
    expect(Culler.shared.cull).toHaveBeenCalledTimes(built);

    const { x } = root.position;
    renderer.screen.width = 800;
    renderer.emit("resize");
    expect(Culler.shared.cull).toHaveBeenCalledTimes(built + 1);
    expect(root.position.x).toBeCloseTo(x - 250);

    scene.destroy();
    expect(renderer.off).toHaveBeenCalledWith("resize", renderer.on.mock.calls[0][1]);
    renderer.emit("resize");
    expect(Culler.shared.cull).toHaveBeenCalledTimes(built + 1);
  });

  it("glides after what it follows on every frame", async () => {
    const { ticker, scene } = await mountScene(defaultWorld(), [createCameraView({ start: { x: 2, y: 2 } })]);

    cameraOf(scene).follow({ x: 10, y: 2 });
    ticker.frame(50);
    expect(cameraOf(scene).state.x).toBeGreaterThan(2);
    expect(cameraOf(scene).state.x).toBeLessThan(10);
    scene.destroy();
  });
});
