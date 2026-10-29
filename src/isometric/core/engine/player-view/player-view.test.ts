import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Assets, Container, type Sprite } from "pixi.js";
import { CAMERA_MAX_ZOOM, CAMERA_START_ZOOM, getGroundPointBelow } from "../camera";
import { createCameraView } from "../camera-view";
import { TILE_METRICS } from "../constants";
import { WorldParts } from "../parts";
import { createPlayer, PLAYER_FACINGS, PLAYER_PART, stepPlayer } from "../player";
import { DUST_MS } from "./feedback";
import { CLOCK_PART, createClockPart } from "../time";
import { projectGridPoint } from "../projection";
import { createBlockViews, getBlockDepth, getSvgResolution } from "../render";
import { SCENE_LAYER, type BuiltScene, type SceneModule } from "../scene";
import {
  loadTexture,
  mountScene,
  renderCalls,
  resetHarness,
  type TestView,
  worldFrom,
} from "../flow-check/scene-harness";
import { createTerrainView } from "../terrain-view";
import type { World } from "../world";
import type { SceneCamera } from "../../types";
import { createPlayerView, type PlayerViewOptions } from "./player-view";
import { getClimbPose, getIdlePose, getWalkPose, getWalkSheetCell } from "./walk";

const PLAYER = { textureSource: "/assets/player/block.svg", height: 1 } as const;
const SHEET = {
  source: "/assets/player/walk.svg",
  canvas: { width: 1024, height: 853 },
  cell: { x: 312, y: 186, width: 400, height: 462 },
  gap: 48,
  frames: 8,
  stride: 1.4,
  airPose: 3,
} as const;
const WALKER = { ...PLAYER, walk: SHEET };

/** The cell of the walk sheet a sprite shows, as the mocked `getSheetFrames()` cuts them. */
const cellOf = (view: TestView) => view.texture as unknown as { source: string; row: number; column: number };
const facing = (name: string) => PLAYER_FACINGS.indexOf(name as never);
const projection = {
  tileWidth: TILE_METRICS.tileWidth,
  tileHeight: TILE_METRICS.tileHeight,
  elevationStep: TILE_METRICS.boxHeight,
  originX: 0,
  originY: 0,
};

/** A flat 4 × 4 field at elevation 1 with the player standing on `at`. */
const fieldWithPlayer = (at = { x: 1, y: 1 }): World => {
  const points = Array.from({ length: 16 }, (_, index) => ({ x: index % 4, y: Math.floor(index / 4), elevation: 1 }));
  return standing(worldFrom(points), at);
};

/** `world` with its player standing on `at`. */
const standing = (world: World, at: { x: number; y: number }): World => {
  Object.assign(world.parts.get(PLAYER_PART), createPlayer(world, at));
  return world;
};

/** The terrain, the player and the camera, as the game draws them. */
const sceneOf = async (world: World, interpolation?: () => number, options?: PlayerViewOptions) => {
  const mounted = await mountScene(
    world,
    [createTerrainView(), createPlayerView(PLAYER, options), createCameraView()],
    { interpolation },
  );
  const view = mounted.root.children.find(({ source }) => source === PLAYER.textureSource) as TestView;
  return { ...mounted, view, camera: mounted.scene.services.camera as SceneCamera };
};

/** Where the sprite of a player at `at` is drawn: 30 px above its top (see the mock). */
const spriteAt = (at: { x: number; y: number; elevation: number }) => {
  const ground = projectGridPoint(at, projection);
  return { x: ground.x, y: ground.y - at.elevation * TILE_METRICS.boxHeight - 30 };
};

/** The player's sprite among the views of `root`: the one with a texture (the ground marker has none). */
const spriteOf = (root: { children: TestView[] }) =>
  root.children.find(({ texture }) => texture !== undefined) as TestView;

/** Terrain blocks in the world container, by column. */
const blocksOf = (children: TestView[], player: TestView) =>
  children.filter((child) => child.x !== undefined && child !== player);

/** Watches every insertion in a container: the scene moving a view in its draw order. */
const moves = () => vi.spyOn(Container.prototype as never, "addChildAt");

describe("createPlayerView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
    vi.mocked(Assets.load).mockImplementation(loadTexture as never);
  });

  it("loads the player's SVG and draws it once, standing on its column and never culled", async () => {
    const { view, scene } = await sceneOf(fieldWithPlayer());

    expect(Assets.load).toHaveBeenCalledWith(expect.objectContaining({ src: PLAYER.textureSource }));
    expect(renderCalls.filter(({ texture }) => texture.source === PLAYER.textureSource)).toEqual([
      expect.objectContaining({ elevation: 1, height: 1 }),
    ]);
    expect(view.cullable).toBe(false);
    expect(view.position).toMatchObject(spriteAt({ x: 1, y: 1, elevation: 1 }));
    scene.destroy();
    expect(Assets.unload).toHaveBeenCalledWith(PLAYER.textureSource);
  });

  it("draws the sprite at its appearance's scale about its feet, still standing on its column", async () => {
    const world = fieldWithPlayer();
    const { root, scene } = await mountScene(world, [createPlayerView({ ...PLAYER, scale: 0.5 })]);
    const view = root.children.find(({ source }) => source === PLAYER.textureSource) as TestView & {
      scale: { x: number; y: number };
    };
    const ground = projectGridPoint({ x: 1, y: 1 }, projection);

    expect(view.scale).toMatchObject({ x: 0.5, y: 0.5 });
    // The mock draws the sprite 30 px above its feet: half of it at half the size.
    expect(view.position).toMatchObject({ x: ground.x, y: ground.y - TILE_METRICS.boxHeight - 15 });
    scene.destroy();
  });

  it("is one block tall when its appearance gives no height", async () => {
    const { scene } = await mountScene(fieldWithPlayer(), [createPlayerView({ textureSource: PLAYER.textureSource })]);

    expect(renderCalls).toEqual([expect.objectContaining({ height: 1 })]);
    scene.destroy();
  });

  it("starts the camera on the player, lifted by its elevation", async () => {
    const { camera, scene } = await sceneOf(fieldWithPlayer({ x: 2, y: 1 }));

    expect(camera.state).toEqual({ ...getGroundPointBelow({ x: 2, y: 1 }, 1, projection), zoom: CAMERA_START_ZOOM });
    scene.destroy();
  });

  it("puts the player in the draw order after the columns behind it and before the ones in front", async () => {
    const { root, view, scene } = await sceneOf(fieldWithPlayer());
    const index = root.children.indexOf(view);

    // Depth grows towards the camera: x + y ≥ 2 is behind or level with column (1, 1).
    blocksOf(root.children, view).forEach((block) => {
      expect(root.children.indexOf(block) < index).toBe((block.x ?? 0) + (block.y ?? 0) >= 2);
    });
    scene.destroy();
  });

  it("draws the player between its last two ticks and glides the camera after it", async () => {
    const world = fieldWithPlayer();
    const { ticker, view, camera, scene } = await sceneOf(world, () => 0.5);
    const addChildAt = moves();
    const before = camera.state;

    world.parts.get(PLAYER_PART).x = 0.6;
    ticker.frame(50);
    expect(view.position).toMatchObject(spriteAt({ x: 0.8, y: 1, elevation: 1 }));
    // Still on column (1, 1), in front of its middle: the draw order is kept.
    expect(addChildAt).not.toHaveBeenCalled();
    expect(camera.state.x).toBeLessThan(before.x);
    expect(camera.state.x).toBeGreaterThan(getGroundPointBelow({ x: 0.8, y: 1 }, 1, projection).x);

    for (let frame = 0; frame < 100; frame += 1) ticker.frame(50);
    expect(camera.state).toEqual({ ...getGroundPointBelow({ x: 0.8, y: 1 }, 1, projection), zoom: CAMERA_START_ZOOM });
    scene.destroy();
  });

  it("provides the player as what moves and casts a shadow, with its feet where they are drawn", async () => {
    const world = fieldWithPlayer();
    const { ticker, view, scene } = await sceneOf(world, () => 0.5);
    const [caster] = scene.services.movingCasters ?? [];

    expect(caster.view).toBe(view);
    world.parts.get(PLAYER_PART).x = 1.4;
    ticker.frame();
    const ground = projectGridPoint({ x: 1.2, y: 1 }, projection);
    expect(caster.foot()).toEqual({
      ground: { x: 1.2, y: 1, elevation: 1 },
      screen: { x: ground.x, y: ground.y - TILE_METRICS.boxHeight },
    });
    scene.destroy();
  });

  it("computes the player's depth again only when it enters another column", async () => {
    const world = fieldWithPlayer();
    const { ticker, scene } = await sceneOf(world, () => 0.5);
    const depth = vi.mocked(getBlockDepth);
    depth.mockClear();

    world.parts.get(PLAYER_PART).x = 1.4;
    ticker.frame();
    world.parts.get(PLAYER_PART).previous = { x: 1.4, y: 1, elevation: 1 };
    ticker.frame();
    expect(depth).not.toHaveBeenCalled();

    world.parts.get(PLAYER_PART).x = 2.2;
    ticker.frame();
    expect(depth).toHaveBeenCalledTimes(1);
    scene.destroy();
  });

  it("keeps the player's place in the draw order on another column at the same depth", async () => {
    const world = fieldWithPlayer();
    const { ticker, scene } = await sceneOf(world);
    const addChildAt = moves();

    // Column (2, 0): same x + y and elevation as (1, 1), so the same depth; in front of its middle.
    Object.assign(world.parts.get(PLAYER_PART), { x: 1.6, y: 0.2, previous: { x: 1.6, y: 0.2, elevation: 1 } });
    ticker.frame();
    expect(vi.mocked(getBlockDepth)).toHaveBeenCalled();
    expect(addChildAt).not.toHaveBeenCalled();
    scene.destroy();
  });

  it("goes behind what stands on its column past the column's middle, and in front of it before", async () => {
    const world = fieldWithPlayer();
    // The scene once built, as every module's `start()` gets it.
    let built: BuiltScene | undefined;
    const probe: SceneModule = { id: "probe", setup: () => ({ start: (scene) => (built = scene), destroy: () => {} }) };
    const { ticker, root, scene } = await mountScene(world, [createTerrainView(), probe, createPlayerView(PLAYER)]);
    const view = root.children.find(({ source }) => source === PLAYER.textureSource) as TestView;
    const placeAt = vi.spyOn(built as BuiltScene, "placeAt");
    const move = vi.spyOn(built as BuiltScene, "move");
    const walkTo = (x: number, y: number) => {
      Object.assign(world.parts.get(PLAYER_PART), { x, y, previous: { x, y, elevation: 1 } });
      ticker.frame();
    };
    const top = blocksOf(root.children, view).find((block) => block.x === 1 && block.y === 1) as TestView;

    walkTo(1.2, 1.1);
    expect(move).toHaveBeenCalledWith({ view, depth: expect.any(Number) as number, layer: SCENE_LAYER.behindObject });
    // Still drawn on its column's top.
    expect(root.children.indexOf(view)).toBeGreaterThan(root.children.indexOf(top));
    walkTo(1.3, 1.2);
    expect(move).toHaveBeenCalledTimes(1);
    expect(placeAt).not.toHaveBeenCalled();
    walkTo(0.8, 1);
    expect(placeAt).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledTimes(1);
    scene.destroy();
  });

  it("moves the player in the draw order only when it enters another column", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, view, scene } = await sceneOf(world);
    const addChildAt = moves();

    world.parts.get(PLAYER_PART).previous = { x: 1, y: 1, elevation: 1 };
    world.parts.get(PLAYER_PART).x = 1.8;
    ticker.frame();
    ticker.frame();
    expect(view.position).toMatchObject(spriteAt({ x: 1.8, y: 1, elevation: 1 }));
    expect(addChildAt).toHaveBeenCalledTimes(1);
    const index = root.children.indexOf(view);
    blocksOf(root.children, view).forEach((block) => {
      expect(root.children.indexOf(block) < index).toBe((block.x ?? 0) + (block.y ?? 0) >= 3);
    });
    scene.destroy();
  });

  it("stands the player on the half-height top of a sand column", async () => {
    const shore = worldFrom([
      { x: 0, y: 0, elevation: -1 },
      { x: 1, y: 0, elevation: 0 },
      { x: 2, y: 0, elevation: 0 },
      { x: 3, y: 0, elevation: 0 },
    ]);
    expect(shore.columnIndex.get(1, 0)?.type).toBe("sand");
    standing(shore, { x: 1, y: 0 });
    // The player system keeps the sunken top under it.
    stepPlayer(shore.parts.get(PLAYER_PART), shore, 1, (type) => (type === "sand" ? 0.5 : 0));
    const { view, scene } = await sceneOf(shore);

    const onGrass = spriteAt({ x: 1, y: 0, elevation: 0 });
    expect(view.position).toMatchObject({ x: onGrass.x, y: onGrass.y + TILE_METRICS.boxHeight / 2 });
    scene.destroy();
  });

  it("does not touch the sprite while the player stands still", async () => {
    const { ticker, view, scene } = await sceneOf(fieldWithPlayer());
    view.position.set.mockClear();

    ticker.frame();
    ticker.frame();
    expect(view.position.set).not.toHaveBeenCalled();
    scene.destroy();
  });

  it("draws a player off the terrain at its own elevation, behind everything", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, view, scene } = await sceneOf(world);

    Object.assign(world.parts.get(PLAYER_PART), { x: 9, y: 9, elevation: 2 });
    ticker.frame();
    expect(view.position).toMatchObject(spriteAt({ x: 9, y: 9, elevation: 2 }));
    expect(root.children[0]).toBe(view);
    scene.destroy();
  });

  it("walks without a camera to follow", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [createPlayerView(PLAYER)]);
    const [view] = root.children;

    world.parts.get(PLAYER_PART).x = 1.4;
    ticker.frame();
    expect(view.position).toMatchObject(spriteAt({ x: 1.4, y: 1, elevation: 1 }));
    scene.destroy();
  });

  it("draws its walk sheet's standing cell facing the camera, sized as the window of its canvas", async () => {
    const { root, scene } = await mountScene(fieldWithPlayer(), [createPlayerView(WALKER)]);
    const [view] = root.children;

    expect(Assets.load).toHaveBeenCalledWith(expect.objectContaining({ src: SHEET.source }));
    expect(Assets.load).not.toHaveBeenCalledWith(expect.objectContaining({ src: PLAYER.textureSource }));
    expect(renderCalls).toEqual([expect.objectContaining({ cell: getWalkSheetCell(SHEET), height: 1 })]);
    expect(cellOf(view)).toMatchObject({ source: SHEET.source, row: facing("south"), column: 0 });
    scene.destroy();
  });

  it("rasterizes its SVGs at its scale, as small as it is drawn", async () => {
    const { scene } = await mountScene(fieldWithPlayer(), [createPlayerView({ ...WALKER, scale: 0.5 })]);
    const full = getSvgResolution(TILE_METRICS.tileWidth * CAMERA_MAX_ZOOM, 1);

    expect(Assets.load).toHaveBeenCalledWith(
      expect.objectContaining({ src: SHEET.source, data: { resolution: full * 0.5, autoGenerateMipmaps: true } }),
    );
    scene.destroy();
  });

  it("rasterizes the still SVG at its scale when it has no walk sheet", async () => {
    const { scene } = await mountScene(fieldWithPlayer(), [createPlayerView({ ...PLAYER, scale: 0.25 })]);
    const full = getSvgResolution(TILE_METRICS.tileWidth * CAMERA_MAX_ZOOM, 1);

    expect(Assets.load).toHaveBeenCalledWith(
      expect.objectContaining({
        src: PLAYER.textureSource,
        data: { resolution: full * 0.25, autoGenerateMipmaps: true },
      }),
    );
    scene.destroy();
  });

  it("turns to where the player walks and steps through the poses by the distance it walked", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [createPlayerView(WALKER)]);
    const [view] = root.children;
    const player = world.parts.get(PLAYER_PART);
    const step = (x: number, y: number) => {
      Object.assign(player, { previous: { x: player.x, y: player.y, elevation: 1 }, x, y });
      ticker.frame();
    };

    // Up on screen: north.
    player.walk = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    player.motion = { type: "walking" };
    step(1.3, 1.3);
    const first = Math.hypot(0.3, 0.3);
    expect(cellOf(view)).toMatchObject({ row: facing("north"), column: getWalkPose(first, SHEET) });
    step(1.6, 1.6);
    expect(cellOf(view)).toMatchObject({ row: facing("north"), column: getWalkPose(2 * first, SHEET) });
    expect(getWalkPose(2 * first, SHEET)).not.toBe(getWalkPose(first, SHEET));

    // Right on screen: east, still walking.
    player.walk = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    player.motion = { type: "walking" };
    step(1.9, 1.3);
    expect(cellOf(view)).toMatchObject({ row: facing("east"), column: getWalkPose(3 * first, SHEET) });
    scene.destroy();
  });

  it("breathes standing still, from the standing pose, by time; walking and in the air it does not", async () => {
    const idle = { source: "/assets/player/idle.svg", frames: 4, period: 400 };
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [
      createPlayerView({ ...PLAYER, walk: { ...SHEET, idle } }),
    ]);
    const [view] = root.children;
    const player = world.parts.get(PLAYER_PART);

    ticker.frame(150);
    expect(cellOf(view)).toMatchObject({ source: idle.source, row: facing("south"), column: getIdlePose(150, idle) });
    ticker.frame(150);
    expect(cellOf(view)).toMatchObject({ source: idle.source, column: getIdlePose(300, idle) });

    // Walking: the walk sheet; stopping again starts a new breath.
    Object.assign(player, { previous: { x: 1, y: 1, elevation: 1 }, x: 1.3 });
    player.motion = { type: "walking" };
    ticker.frame(150);
    expect(cellOf(view)).toMatchObject({ source: SHEET.source });
    Object.assign(player, { previous: { x: 1.3, y: 1, elevation: 1 } });
    player.motion = { type: "idle" };
    ticker.frame(50);
    expect(cellOf(view)).toMatchObject({ source: idle.source, column: 0 });

    // In the air: the air pose.
    Object.assign(player, { height: 0.5 });
    player.motion = { type: "jumping" };
    ticker.frame(150);
    expect(cellOf(view)).toMatchObject({ source: SHEET.source, column: SHEET.airPose });
    scene.destroy();
  });

  it("climbs through the poses of its climb sheet, turned the way it climbs, and then walks on", async () => {
    const climbSheet = { source: "/assets/player/climb.svg", frames: 4 };
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [
      createPlayerView({ ...PLAYER, walk: { ...SHEET, climb: climbSheet } }),
    ]);
    const [view] = root.children;
    const player = world.parts.get(PLAYER_PART);
    const climb = { from: { x: 1, y: 1 }, to: { x: 1, y: 1.6 }, direction: { x: 0, y: 1 }, feet: 1, rise: 1 };

    // Its walk says otherwise: it faces the way it climbs.
    player.walk = { x: 1, y: 0 };
    player.climb = { ...climb, ticks: 4, tick: 2 };
    player.motion = { type: "climbing" };
    ticker.frame();
    expect(cellOf(view)).toMatchObject({
      source: climbSheet.source,
      row: facing("north-west"),
      column: getClimbPose(2 / 4, climbSheet),
    });

    player.climb = undefined;
    player.motion = { type: "walking" };
    ticker.frame();
    expect(cellOf(view)).toMatchObject({ row: facing("north-east") });
    expect(cellOf(view).source).not.toBe(climbSheet.source);
    scene.destroy();
  });

  it("climbs in its standing pose without a climb sheet, or when it cannot be loaded", async () => {
    const climbSheet = { source: "/assets/player/climb.svg", frames: 4 };
    vi.mocked(Assets.load).mockImplementation((asset) =>
      (asset as unknown as { src: string }).src === climbSheet.source
        ? Promise.resolve(undefined as never)
        : loadTexture(asset as never),
    );
    for (const walk of [SHEET, { ...SHEET, climb: climbSheet }]) {
      resetHarness();
      const world = fieldWithPlayer();
      const { ticker, root, scene } = await mountScene(world, [createPlayerView({ ...PLAYER, walk })]);
      const player = world.parts.get(PLAYER_PART);
      Object.assign(player, { previous: { x: 1, y: 1, elevation: 1 }, x: 1, y: 1.2, height: 0.5 });
      player.climb = {
        from: { x: 1, y: 1 },
        to: { x: 1, y: 1.6 },
        direction: { x: 0, y: 1 },
        feet: 1,
        rise: 1,
        ticks: 4,
        tick: 3,
      };
      player.motion = { type: "climbing" };
      ticker.frame();
      expect(cellOf(spriteOf(root))).toMatchObject({ source: SHEET.source, row: facing("north-west"), column: 0 });
      scene.destroy();
    }
  });

  it("follows the feet up with the camera while it climbs", async () => {
    const world = fieldWithPlayer();
    const { ticker, camera, scene } = await sceneOf(world);
    const player = world.parts.get(PLAYER_PART);
    const position = { x: 1, y: 1, elevation: 1, inset: 0, height: 0.6 };
    Object.assign(player, position, { previous: position });
    player.climb = {
      from: { x: 1, y: 1 },
      to: { x: 1, y: 1.6 },
      direction: { x: 0, y: 1 },
      feet: 1,
      rise: 1,
      ticks: 12,
      tick: 6,
    };
    player.motion = { type: "climbing" };
    for (let frame = 0; frame < 50; frame += 1) ticker.frame(50);

    expect(camera.state).toMatchObject(getGroundPointBelow({ x: 1, y: 1 }, 1.6, projection));
    scene.destroy();
  });

  it("stands still on the walk sheet when its idle sheet cannot be loaded", async () => {
    const idle = { source: "/assets/player/idle.svg", frames: 4, period: 400 };
    vi.mocked(Assets.load).mockImplementation((asset) =>
      (asset as unknown as { src: string }).src === idle.source
        ? Promise.resolve(undefined as never)
        : loadTexture(asset as never),
    );
    const { ticker, root, scene } = await mountScene(fieldWithPlayer(), [
      createPlayerView({ ...PLAYER, walk: { ...SHEET, idle } }),
    ]);

    ticker.frame(300);
    expect(cellOf(root.children[0])).toMatchObject({ source: SHEET.source, column: 0 });
    scene.destroy();
  });

  it("stands still facing the way it last walked, and sets off again from the first pose", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [createPlayerView(WALKER)]);
    const [view] = root.children;
    const player = world.parts.get(PLAYER_PART);

    player.walk = { x: -1, y: 0 };
    Object.assign(player, { previous: { x: 1, y: 1, elevation: 1 }, x: 0.4, y: 1 });
    player.motion = { type: "walking" };
    ticker.frame();
    expect(cellOf(view)).toMatchObject({ row: facing("south-west") });
    expect(cellOf(view).column).toBeGreaterThan(1);

    // Let go: the last tick did not move it.
    player.walk = { x: 0, y: 0 };
    player.motion = { type: "idle" };
    player.previous = { x: 0.4, y: 1, elevation: 1 };
    ticker.frame();
    expect(cellOf(view)).toMatchObject({ row: facing("south-west"), column: 0 });

    player.walk = { x: -1, y: 0 };
    Object.assign(player, { x: 0.35 });
    player.motion = { type: "walking" };
    ticker.frame();
    expect(cellOf(view)).toMatchObject({ row: facing("south-west"), column: 1 });
    scene.destroy();
  });

  it("lifts the sprite and the feet it casts its shadow from while it jumps, not the camera", async () => {
    const world = fieldWithPlayer();
    const { ticker, view, camera, scene } = await sceneOf(world);
    const [caster] = scene.services.movingCasters ?? [];
    const player = world.parts.get(PLAYER_PART);

    Object.assign(player, { height: 0.5, previous: { x: 1, y: 1, elevation: 1, height: 0.5 } });
    player.motion = { type: "jumping" };
    ticker.frame();

    const standing = spriteAt({ x: 1, y: 1, elevation: 1 });
    expect(view.position).toMatchObject({ x: standing.x, y: standing.y - 0.5 * TILE_METRICS.boxHeight });
    expect(caster.foot().ground).toEqual({ x: 1, y: 1, elevation: 1.5 });
    for (let frame = 0; frame < 50; frame += 1) ticker.frame(50);
    expect(camera.state).toMatchObject(getGroundPointBelow({ x: 1, y: 1 }, 1, projection));
    scene.destroy();
  });

  it("follows a fall with the camera as it falls, from where its feet left the ground", async () => {
    const world = fieldWithPlayer();
    const { ticker, camera, scene } = await sceneOf(world);
    const player = world.parts.get(PLAYER_PART);
    const settle = (at: { elevation: number; inset?: number; height: number }) => {
      const position = { x: 1, y: 1, inset: 0, ...at };
      Object.assign(player, position, { previous: position });
      for (let frame = 0; frame < 50; frame += 1) ticker.frame(50);
      return camera.state;
    };
    const lookingAt = (level: number) => getGroundPointBelow({ x: 1, y: 1 }, level, projection);

    // Walked off onto a column a block lower: its feet are still up there.
    expect(settle({ elevation: 0, height: 0.9 })).toMatchObject(lookingAt(0.9));
    expect(settle({ elevation: 0, height: 0.4 })).toMatchObject(lookingAt(0.4));
    // Never back up while in the air, and on the sunken top it lands on once it does.
    expect(settle({ elevation: 0, height: 0.6 })).toMatchObject(lookingAt(0.4));
    expect(settle({ elevation: 0, inset: 0.5, height: 0 })).toMatchObject(lookingAt(-0.5));
    scene.destroy();
  });

  it("shows the sheet's air pose whenever the motion state is airborne", async () => {
    const jumpAt = async (walk: typeof SHEET | Omit<typeof SHEET, "airPose">, height = 0.3) => {
      resetHarness();
      const world = fieldWithPlayer();
      const { ticker, root, scene } = await mountScene(world, [createPlayerView({ ...PLAYER, walk })]);
      Object.assign(world.parts.get(PLAYER_PART), { height });
      world.parts.get(PLAYER_PART).motion = { type: "jumping" };
      ticker.frame();
      const cell = cellOf(spriteOf(root));
      scene.destroy();
      return cell;
    };
    const { airPose: _, ...withoutAirPose } = SHEET;

    expect(await jumpAt(SHEET)).toMatchObject({ column: 3 });
    expect(await jumpAt(withoutAirPose)).toMatchObject({ column: 0 });
    expect(await jumpAt(SHEET, 0.25)).toMatchObject({ column: 3 });
  });

  it("draws its still SVG when the walk sheet cannot be used", async () => {
    vi.mocked(Assets.load).mockImplementation((asset) =>
      (asset as unknown as { src: string }).src === SHEET.source
        ? Promise.resolve(undefined as never)
        : loadTexture(asset as never),
    );
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [createPlayerView(WALKER)]);
    const [view] = root.children;

    expect(view.source).toBe(PLAYER.textureSource);
    expect(renderCalls).toEqual([expect.objectContaining({ cell: undefined })]);
    world.parts.get(PLAYER_PART).walk = { x: 1, y: 0 };
    world.parts.get(PLAYER_PART).x = 1.2;
    ticker.frame();
    expect(view.texture).toMatchObject({ source: PLAYER.textureSource });
    scene.destroy();
  });

  it("draws and provides nothing when its SVG cannot be used", async () => {
    vi.mocked(Assets.load).mockImplementation(() => Promise.resolve(undefined as never));
    const { root, scene } = await mountScene(fieldWithPlayer(), [createPlayerView(PLAYER)]);

    expect(root.children).toHaveLength(0);
    expect(scene.services.focus).toBeUndefined();
    scene.destroy();
  });

  it("draws, loads and provides nothing in a world without a player part", async () => {
    const field = fieldWithPlayer();
    const world: World = { ...field, parts: WorldParts.create([createClockPart(0)], field) };
    const { root, scene } = await mountScene(world, [createPlayerView(PLAYER)]);

    expect(Assets.load).not.toHaveBeenCalled();
    expect(root.children).toHaveLength(0);
    expect(scene.services.focus).toBeUndefined();
    scene.destroy();
  });
});

describe("terrain shadow receiver", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });
  it("receives uniform shadow opacity through the scalar compatibility callback", async () => {
    const { root, scene } = await mountScene(fieldWithPlayer(), [createPlayerView({ ...PLAYER, scale: 0 })]);
    const sprite = root.children[0] as unknown as Sprite;
    const overlay = sprite.children[0];
    const caster = scene.services.movingCasters![0];
    caster.receiveTerrainShadow!(0.3);
    expect(overlay.alpha).toBe(0.3);
    expect(overlay.visible).toBe(true);
    caster.receiveTerrainShadow!(0);
    expect(overlay.visible).toBe(false);
    scene.destroy();
  });
  it("receives actual shadow rows over its full height", async () => {
    const { root, scene } = await mountScene(fieldWithPlayer(), [createPlayerView(PLAYER)]);
    const sprite = root.children[0] as unknown as Sprite;
    const overlay = sprite.children[0];
    const caster = scene.services.movingCasters![0];
    caster.receiveTerrainShadowBands!(new Float32Array(16).fill(0.3));
    expect(overlay.visible).toBe(true);
    expect(overlay.alpha).toBe(1);
    expect(
      ((overlay.children[1] as Sprite).texture.source as unknown as { resource: Uint8ClampedArray }).resource[3],
    ).toBe(77);
    caster.receiveTerrainShadowBands!(new Float32Array(16));
    expect(overlay.visible).toBe(false);
    scene.destroy();
  });
  it("reuses the original pose texture for the masked shadow body", async () => {
    const shared = { source: PLAYER.textureSource, frame: { x: 0, y: 0, width: 16, height: 16 } };
    vi.mocked(Assets.load).mockResolvedValueOnce(shared);
    const first = await mountScene(fieldWithPlayer(), [createPlayerView(PLAYER)]);
    vi.mocked(Assets.load).mockResolvedValueOnce(shared);
    const second = await mountScene(fieldWithPlayer(), [createPlayerView(PLAYER)]);
    const bottom = (root: typeof first.root) =>
      ((root.children[0] as unknown as Sprite).children[0].children[0] as Sprite).texture;
    expect(bottom(first.root)).toBe(bottom(second.root));
    expect(bottom(first.root).frame).toBe(shared.frame);
    first.scene.destroy();
    second.scene.destroy();
  });
  it("degrades when a renderer provides no sprite", async () => {
    vi.mocked(createBlockViews).mockReturnValueOnce([{ view: new Container(), depth: 0 }]);
    const { scene } = await mountScene(fieldWithPlayer(), [createPlayerView(PLAYER)]);
    expect(scene.services.movingCasters).toBeUndefined();
    scene.destroy();
  });
});

it("clips a two-dimensional shadow mask to the current player pose and uploads only changed coverage", async () => {
  resetHarness();
  vi.clearAllMocks();
  const { root, scene } = await mountScene(fieldWithPlayer(), [createPlayerView(PLAYER)]);
  const view = root.children[0] as unknown as Sprite;
  const overlay = view.children[0];
  const body = overlay.children[0] as Sprite;
  const mask = overlay.children[1] as Sprite;
  const source = mask.texture.source as unknown as { resource: Uint8ClampedArray; update: ReturnType<typeof vi.fn> };
  const grid = new Float32Array(128);
  grid[0] = 0.8;
  grid[127] = 0.2;
  const receive = scene.services.movingCasters![0].receiveShadowGrid!;
  receive(grid);
  expect(body.texture).toBe(view.texture);
  expect(body.setMask).toHaveBeenCalledWith({ mask, channel: "alpha" });
  expect(source.resource[15 * 8 * 4 + 3]).toBe(204);
  expect(source.resource[7 * 4 + 3]).toBe(51);
  expect(source.update).toHaveBeenCalledTimes(1);
  receive(grid);
  expect(source.update).toHaveBeenCalledTimes(1);
  receive([]);
  expect(overlay.visible).toBe(false);
  scene.destroy();
  expect(body.mask).toBeNull();
  expect(mask.texture.destroy).toHaveBeenCalledWith(true);
});

describe("createPlayerView feedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
    vi.mocked(Assets.load).mockImplementation(loadTexture as never);
  });

  type Shape = TestView & {
    poly?: ReturnType<typeof vi.fn>;
    scale: { x: number; y: number };
    tint: number;
  };
  const dustOf = (root: { children: TestView[] }) =>
    (root.children as Shape[]).filter(({ poly }) => poly?.mock.calls.length);
  const JUMP = { source: "/assets/player/jump.svg", poses: { takeoff: 0, rise: 1, apex: 2, fall: 3, landing: 4 } };

  it("shows the jump sheet's pose for each part of a jump, and the air pose without it", async () => {
    const poseOf = async (walk: typeof SHEET & { jump?: typeof JUMP }, failing?: string) => {
      resetHarness();
      vi.mocked(Assets.load).mockImplementation((asset) =>
        (asset as unknown as { src: string }).src === failing
          ? Promise.resolve(undefined as never)
          : loadTexture(asset as never),
      );
      const world = fieldWithPlayer();
      const { ticker, root, scene } = await mountScene(world, [createPlayerView({ ...PLAYER, walk })]);
      const player = world.parts.get(PLAYER_PART);
      const cells: Array<{ source: string; column: number }> = [];
      const show = (state: Partial<typeof player>) => {
        Object.assign(player, state);
        ticker.frame();
        cells.push(cellOf(spriteOf(root)));
      };
      Object.assign(player.feedback, { leap: true, airTicks: 1 });
      show({ height: 0.3, verticalSpeed: 0.3, motion: { type: "jumping" } });
      Object.assign(player.feedback, { airTicks: 5 });
      show({ height: 0.6, verticalSpeed: 0.2 });
      show({ height: 0.8, verticalSpeed: 0 });
      show({ height: 0.5, verticalSpeed: -0.3, motion: { type: "falling" } });
      Object.assign(player.feedback, { leap: false, airTicks: 0, landingTicks: 2 });
      show({ height: 0, verticalSpeed: undefined, motion: { type: "idle" } });
      Object.assign(player.feedback, { landingTicks: 0 });
      show({});
      scene.destroy();
      return cells.map(({ source, column }) => `${source.split("/").pop()}:${column}`);
    };

    expect(await poseOf({ ...SHEET, jump: JUMP })).toEqual([
      "jump.svg:0",
      "jump.svg:1",
      "jump.svg:2",
      "jump.svg:3",
      "jump.svg:4",
      "walk.svg:0",
    ]);
    expect(await poseOf({ ...SHEET, jump: JUMP }, JUMP.source)).toEqual([
      "walk.svg:3",
      "walk.svg:3",
      "walk.svg:3",
      "walk.svg:3",
      "walk.svg:0",
      "walk.svg:0",
    ]);
  });

  it("raises dust and stretches as it takes off, and squashes as it lands hard, about its feet", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, view, scene } = await sceneOf(world);
    const player = world.parts.get(PLAYER_PART);
    const shape = view as Shape;
    const feet = { ...view.position };

    player.feedback.jumps += 1;
    ticker.frame(16);
    const [takeoff] = dustOf(root);
    expect(takeoff.visible).toBe(true);
    expect(takeoff.cullable).toBe(false);
    expect(shape.scale.y).toBeGreaterThan(shape.scale.x);
    for (let ms = 0; ms < DUST_MS; ms += 50) ticker.frame(50);
    expect(takeoff.visible).toBe(false);
    expect(shape.scale).toMatchObject({ x: 1, y: 1 });
    expect(view.position).toMatchObject(feet);

    Object.assign(player.feedback, { landings: 1, impact: 0.3 });
    ticker.frame(16);
    expect(dustOf(root)).toHaveLength(2);
    expect(shape.scale.y).toBeLessThan(1);
    // Squashed about its feet: the sprite comes down with it.
    expect(view.position.y).toBeGreaterThan(feet.y);
    for (let ms = 0; ms < DUST_MS; ms += 50) ticker.frame(50);

    // A soft landing, a step down onto sand, raises none; a take-off raises the same puff again.
    Object.assign(player.feedback, { landings: 2, impact: 0.05 });
    ticker.frame(16);
    expect(dustOf(root).filter(({ visible }) => visible)).toHaveLength(0);
    player.feedback.jumps += 1;
    ticker.frame(16);
    expect(dustOf(root)).toHaveLength(2);
    expect(takeoff.visible).toBe(true);
    scene.destroy();
  });

  it("raises the dust of a double jump where its feet are, in the air", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await sceneOf(world);
    const player = world.parts.get(PLAYER_PART);
    player.feedback.jumps += 1;
    ticker.frame(16);
    const [puff] = dustOf(root);
    const ground = puff.position.y;
    for (let ms = 0; ms < DUST_MS; ms += 50) ticker.frame(50);

    const position = { x: 1, y: 1, elevation: 1, inset: 0, height: 0.75 };
    Object.assign(player, position, { previous: position, verticalSpeed: 0.2 });
    player.feedback.jumps += 1;
    ticker.frame(16);
    expect(puff.visible).toBe(true);
    expect(puff.position.y).toBeCloseTo(ground - 0.75 * TILE_METRICS.boxHeight);
    scene.destroy();
  });

  it("kicks up a small puff of dust every few columns it runs, and none walking or with its effects off", async () => {
    const puffs = async (speed: number, options?: PlayerViewOptions) => {
      resetHarness();
      const world = fieldWithPlayer();
      const { ticker, root, scene } = await sceneOf(world, undefined, options);
      const player = world.parts.get(PLAYER_PART);
      ticker.frame(16);
      for (let tick = 1; tick <= 6; tick += 1) {
        const previous = { x: 0.5 + speed * (tick - 1), y: 1, elevation: 1, inset: 0, height: 0 };
        Object.assign(player, { x: previous.x + speed, previous, velocity: { x: speed, y: 0 } });
        ticker.frame(50);
      }
      const raised = dustOf(root);
      scene.destroy();
      return raised;
    };

    const running = await puffs(0.25);
    expect(running).toHaveLength(2);
    expect(running[0].poly).toHaveBeenCalledTimes(4 * 3);
    expect(await puffs(0.15)).toHaveLength(0);
    expect(await puffs(0.25, { effects: false })).toHaveLength(0);
  });

  it("raises no dust and keeps its shape with its effects off", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, view, scene } = await sceneOf(world, undefined, { effects: false });
    const player = world.parts.get(PLAYER_PART);
    Object.assign(player.feedback, { jumps: 1, landings: 1, impact: 0.5 });
    ticker.frame(16);
    expect(dustOf(root)).toHaveLength(0);
    expect((view as Shape).scale).toMatchObject({ x: 1, y: 1 });
    scene.destroy();
  });

  it("keeps its colour, shape and place at a rejected press", async () => {
    const world = fieldWithPlayer();
    const { ticker, view, scene } = await sceneOf(world);
    const still = { ...view.position };
    ticker.frame(16);
    world.parts.get(PLAYER_PART).feedback.rejections += 1;
    ticker.frame(16);
    expect(view as Shape).toMatchObject({ tint: 0xffffff, scale: { x: 1, y: 1 } });
    expect(view.position).toMatchObject(still);
    scene.destroy();
  });
});

describe("createPlayerView body motion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
    vi.mocked(Assets.load).mockImplementation(loadTexture as never);
  });

  type Body = TestView & { skew: { x: number }; scale: { x: number; y: number } };
  /** A ground velocity of `speed` columns per tick straight to the right of the screen. */
  const right = (speed: number) => ({ x: speed / Math.SQRT2, y: -speed / Math.SQRT2 });
  /** Where the sprite's feet are: its origin back down its (scaled, skewed) height. */
  const feetOf = (view: Body, height: number) => ({
    x: view.position.x + Math.sin(view.skew.x) * height * view.scale.y,
    y: view.position.y + Math.cos(view.skew.x) * height * view.scale.y,
  });

  it("leans into a run and back against the stop, then stands upright, about its feet", async () => {
    const world = fieldWithPlayer();
    const { ticker, view, scene } = await sceneOf(world);
    const body = view as Body;
    const player = world.parts.get(PLAYER_PART);
    const clock = world.parts.get(CLOCK_PART);
    const feet = feetOf(body, 30);
    const upright = { ...body.position };
    ticker.frame(16);
    expect(body.skew.x).toBe(0);

    // Sets off to the right of the screen, speeding up for a few ticks, in place (only the lean).
    const leans: number[] = [];
    for (let tick = 1; tick <= 6; tick += 1) {
      clock.tick += 1;
      player.velocity = right(Math.min(0.25, 0.05 * tick));
      ticker.frame(50);
      leans.push(-body.skew.x);
    }
    expect(leans[0]).toBeGreaterThan(0);
    expect(Math.max(...leans)).toBeLessThan(0.17);
    // The head leans right; the feet stay where they stand.
    expect(feetOf(body, 30).x).toBeCloseTo(feet.x);
    expect(feetOf(body, 30).y).toBeCloseTo(feet.y);

    // Stops at once: it swings back past upright before it settles.
    clock.tick += 1;
    player.velocity = { x: 0, y: 0 };
    let least = Infinity;
    for (let frame = 0; frame < 20; frame += 1) {
      // A tick every three frames: the stop's deceleration lasts its tick.
      if (frame % 3 === 2) clock.tick += 1;
      ticker.frame(16);
      least = Math.min(least, -body.skew.x);
    }
    expect(least).toBeLessThan(0);
    for (let frame = 0; frame < 40; frame += 1) ticker.frame(100);
    expect(Math.abs(body.skew.x)).toBe(0);
    expect(body.position).toMatchObject(upright);
    scene.destroy();
  });

  it("does not lean or reshape with its effects off", async () => {
    const world = fieldWithPlayer();
    const { ticker, view, scene } = await sceneOf(world, undefined, { effects: false });
    world.parts.get(CLOCK_PART).tick += 1;
    world.parts.get(PLAYER_PART).velocity = right(0.25);
    ticker.frame(50);
    expect((view as Body).skew.x).toBe(0);
    expect((view as Body).scale).toMatchObject({ x: 1, y: 1 });
    scene.destroy();
  });

  it("bobs with its footfalls walking, stretches in the air and while it climbs", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [createPlayerView(WALKER)]);
    const body = spriteOf(root) as Body;
    const player = world.parts.get(PLAYER_PART);

    // Walking toward the camera's right: a quarter of a step in, the body is taller and thinner.
    const step = SHEET.stride / 8;
    Object.assign(player, { motion: { type: "walking" }, velocity: { x: 0.15, y: 0 } });
    Object.assign(player, { previous: { ...player.previous, x: 1 }, x: 1 + step });
    ticker.frame(16);
    expect(body.scale.y).toBeGreaterThan(1);
    expect(body.scale.x).toBeLessThan(1);

    // Rising fast in the air: stretched; at the apex, back to its own shape.
    const still = { x: 1 + step, y: 1, elevation: 1, inset: 0, height: 0.4 };
    Object.assign(player, still, {
      previous: still,
      velocity: { x: 0, y: 0 },
      motion: { type: "jumping" },
      verticalSpeed: 0.3,
    });
    ticker.frame(16);
    expect(body.scale.y).toBeGreaterThan(1);
    player.verticalSpeed = 0;
    ticker.frame(16);
    expect(body.scale.y).toBeCloseTo(1);

    // Halfway through a climb: stretched as it pulls itself up, and upright.
    Object.assign(player, {
      motion: { type: "climbing" },
      verticalSpeed: undefined,
      height: 0,
      previous: { ...still, height: 0 },
      climb: {
        from: { x: 1, y: 1 },
        to: { x: 2, y: 1 },
        direction: { x: 1, y: 0 },
        feet: 1,
        rise: 1,
        ticks: 12,
        tick: 6,
      },
    });
    ticker.frame(16);
    expect(body.scale.y).toBeGreaterThan(1);
    scene.destroy();
  });
});
