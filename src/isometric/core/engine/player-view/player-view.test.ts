import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Assets, Container } from "pixi.js";
import { CAMERA_START_ZOOM, getGroundPointBelow } from "../camera";
import { createCameraView } from "../camera-view";
import { TILE_METRICS } from "../constants";
import { WorldParts } from "../parts";
import { createPlayer, PLAYER_FACINGS, PLAYER_PART } from "../player";
import { createClockPart } from "../time";
import { projectGridPoint } from "../projection";
import { getBlockDepth } from "../render";
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
import { createPlayerView } from "./player-view";
import { getWalkPose, getWalkSheetCell } from "./walk";

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
const sceneOf = async (world: World, interpolation?: () => number) => {
  const mounted = await mountScene(world, [createTerrainView(), createPlayerView(PLAYER), createCameraView()], {
    interpolation,
  });
  const view = mounted.root.children.find(({ source }) => source === PLAYER.textureSource) as TestView;
  return { ...mounted, view, camera: mounted.scene.services.camera as SceneCamera };
};

/** Where the sprite of a player at `at` is drawn: 30 px above its top (see the mock). */
const spriteAt = (at: { x: number; y: number; elevation: number }) => {
  const ground = projectGridPoint(at, projection);
  return { x: ground.x, y: ground.y - at.elevation * TILE_METRICS.boxHeight - 30 };
};

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
    const { view, scene } = await sceneOf(standing(shore, { x: 1, y: 0 }));

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
    expect(cellOf(view)).toEqual({ source: SHEET.source, row: facing("south"), column: 0 });
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
    step(1.3, 1.3);
    const first = Math.hypot(0.3, 0.3);
    expect(cellOf(view)).toMatchObject({ row: facing("north"), column: getWalkPose(first, SHEET) });
    step(1.6, 1.6);
    expect(cellOf(view)).toMatchObject({ row: facing("north"), column: getWalkPose(2 * first, SHEET) });
    expect(getWalkPose(2 * first, SHEET)).not.toBe(getWalkPose(first, SHEET));

    // Right on screen: east, still walking.
    player.walk = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    step(1.9, 1.3);
    expect(cellOf(view)).toMatchObject({ row: facing("east"), column: getWalkPose(3 * first, SHEET) });
    scene.destroy();
  });

  it("stands still facing the way it last walked, and sets off again from the first pose", async () => {
    const world = fieldWithPlayer();
    const { ticker, root, scene } = await mountScene(world, [createPlayerView(WALKER)]);
    const [view] = root.children;
    const player = world.parts.get(PLAYER_PART);

    player.walk = { x: -1, y: 0 };
    Object.assign(player, { previous: { x: 1, y: 1, elevation: 1 }, x: 0.4, y: 1 });
    ticker.frame();
    expect(cellOf(view)).toMatchObject({ row: facing("south-west") });
    expect(cellOf(view).column).toBeGreaterThan(1);

    // Let go: the last tick did not move it.
    player.walk = { x: 0, y: 0 };
    player.previous = { x: 0.4, y: 1, elevation: 1 };
    ticker.frame();
    expect(cellOf(view)).toMatchObject({ row: facing("south-west"), column: 0 });

    player.walk = { x: -1, y: 0 };
    Object.assign(player, { x: 0.35 });
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
    ticker.frame();

    const standing = spriteAt({ x: 1, y: 1, elevation: 1 });
    expect(view.position).toMatchObject({ x: standing.x, y: standing.y - 0.5 * TILE_METRICS.boxHeight });
    expect(caster.foot().ground).toEqual({ x: 1, y: 1, elevation: 1.5 });
    for (let frame = 0; frame < 50; frame += 1) ticker.frame(50);
    expect(camera.state).toMatchObject(getGroundPointBelow({ x: 1, y: 1 }, 1, projection));
    scene.destroy();
  });

  it("shows the sheet's air pose in the air, standing when it has none", async () => {
    const jumpAt = async (walk: typeof SHEET | Omit<typeof SHEET, "airPose">) => {
      resetHarness();
      const world = fieldWithPlayer();
      const { ticker, root, scene } = await mountScene(world, [createPlayerView({ ...PLAYER, walk })]);
      Object.assign(world.parts.get(PLAYER_PART), { height: 0.3 });
      ticker.frame();
      const cell = cellOf(root.children[0]);
      scene.destroy();
      return cell;
    };
    const { airPose: _, ...withoutAirPose } = SHEET;

    expect(await jumpAt(SHEET)).toMatchObject({ column: 3 });
    expect(await jumpAt(withoutAirPose)).toMatchObject({ column: 0 });
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
    expect(view.texture).toEqual({ source: PLAYER.textureSource });
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
