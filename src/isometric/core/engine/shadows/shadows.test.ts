import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
vi.mock("./silhouette", async () => (await import("../flow-check/scene-harness")).mockSilhouette());
vi.mock("./received-shadow", async () => (await import("../flow-check/scene-harness")).mockReceivedShadow());

import { RenderTexture } from "pixi.js";
import { Entity } from "../entities";
import { createEntityView } from "../entity-view";
import type { SceneModule } from "../scene";
import { TILE_METRICS } from "../constants";
import { CHUNK_SIZE } from "../grid";
import {
  AO_PIXELS_PER_TILE,
  getCastShadowOffset,
  getShadowProjection,
  getSilhouetteMatrix,
  SHADOW_REFRESH_TICKS,
} from "../lighting";
import {
  columnsOf,
  containers,
  type createRenderer,
  createTestEntities,
  defaultWorld,
  entitiesOf,
  frameUntil,
  mountScene,
  resetHarness,
  worldFrom,
} from "../flow-check/scene-harness";
import type { Box } from "../terrain";
import { createTerrainView } from "../terrain-view";
import { CLOCK_PART, getSunState, TICKS_PER_DAY } from "../time";
import type { World } from "../world";
import { createReceivedShadows } from "./received-shadow";
import { createShadows, SHADOW_GATHERS_PER_FRAME, SHADOW_MAP_MARGIN } from "./shadows";
import { createSilhouettes, createSilhouetteSprite, placeSilhouette, type Silhouette } from "./silhouette";

describe("createShadows", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  type View = {
    source: string;
    x?: number;
    y?: number;
    groundShadow?: boolean;
    tileTop?: { x: number; y: number };
    texture?: { source: unknown; frame: { x: number; y: number; width: number; height: number } };
    visible?: boolean;
    alpha?: number;
  };

  /** The terrain, the entities and their shadows, as the game draws them. */
  const sceneOf = async (world: World) => {
    const { ticker, renderer, root, scene } = await mountScene(world, [
      createTerrainView(),
      createEntityView(),
      createShadows(),
    ]);
    return { ticker, renderer, children: root.children as View[], destroyScene: scene.destroy };
  };
  const at = (world: World, hour: number) => {
    world.parts.get(CLOCK_PART).tick = Math.round((hour / 24) * TICKS_PER_DAY);
    return world;
  };
  const groundShadows = (children: View[]) => children.filter(({ groundShadow }) => groundShadow);

  it("puts a shadow layer on the top of every column, right after its top block", async () => {
    const world = at(defaultWorld(createTestEntities), 12);
    const { children, destroyScene } = await sceneOf(world);
    const entity = entitiesOf(world)[0];
    const isAt = (view: View, x: number, y: number) => view.x === x && view.y === y;
    const topIndex = children.reduce(
      (last, view, index) =>
        !view.groundShadow && !view.source.includes("statue") && isAt(view, entity.x, entity.y) ? index : last,
      -1,
    );
    const shadowIndex = children.findIndex(
      (view) =>
        view.groundShadow &&
        view.texture?.frame.x === (entity.x + SHADOW_MAP_MARGIN) * 16 &&
        view.texture.frame.y === (entity.y + SHADOW_MAP_MARGIN) * 16,
    );
    const entityIndex = children.findIndex(({ source }) => source.includes("statue"));

    expect(groundShadows(children)).toHaveLength(columnsOf(world).length);
    expect(topIndex).toBeLessThan(shadowIndex);
    expect(shadowIndex).toBeLessThan(entityIndex);
    destroyScene();
  });

  it("gives each tile its square of the shadow map of its own elevation", async () => {
    const world = worldFrom([
      { x: 0, y: 0, elevation: 2 },
      { x: 1, y: 0, elevation: 2 },
      { x: 0, y: 1, elevation: 1 },
      { x: 1, y: 1, elevation: -1 },
    ]);
    const { children, destroyScene } = await sceneOf(world);
    const shadows = groundShadows(children);

    expect(RenderTexture.create).toHaveBeenCalledTimes(3);
    // Its chunk and a margin around it, so a shadow's blur does not stop at the chunk's edge.
    const side = (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * 16;
    expect(RenderTexture.create).toHaveBeenCalledWith({ width: side, height: side });
    const frames = shadows.map(({ texture }) => texture?.frame);
    expect(frames).toEqual(
      expect.arrayContaining([
        { x: 16, y: 16, width: 16, height: 16 },
        { x: 32, y: 16, width: 16, height: 16 },
        { x: 16, y: 32, width: 16, height: 16 },
        { x: 32, y: 32, width: 16, height: 16 },
      ]),
    );
    const sourceOf = (fx: number, fy: number) =>
      shadows.find(({ texture }) => texture?.frame.x === fx && texture.frame.y === fy)?.texture?.source;
    expect(sourceOf(16, 16)).toBe(sourceOf(32, 16));
    expect(sourceOf(16, 16)).not.toBe(sourceOf(16, 32));
    destroyScene();
  });

  it("lays the shadow of a sand tile on its half-height top", async () => {
    const { children, destroyScene } = await sceneOf(
      worldFrom([
        { x: 0, y: 0, elevation: -1 },
        { x: 1, y: 0, elevation: 0 },
        { x: 2, y: 0, elevation: 0 },
        { x: 3, y: 0, elevation: 0 },
      ]),
    );
    const blockAt = (x: number) =>
      children.filter((view) => !view.groundShadow && view.x === x && view.source.includes("/")).at(-1);
    const shadowAt = (frameX: number) => groundShadows(children).find(({ texture }) => texture?.frame.x === frameX);

    expect(blockAt(1)?.source).toBe("/assets/sand/block.svg");
    // (2, 0) is half a tile higher on screen than (1, 0); the sand top is half a block lower still.
    expect((shadowAt(16)?.tileTop?.y ?? 0) - (shadowAt(32)?.tileTop?.y ?? 0)).toBeCloseTo(
      TILE_METRICS.tileHeight / 2 + TILE_METRICS.boxHeight / 2,
    );
    destroyScene();
  });

  type Layer = { children: unknown[]; visibleWrites: boolean[]; filters?: unknown[] };
  /** The fixed layer each map is drawn from, in the order of the render-to-texture calls. */
  const layerOf = (renderer: ReturnType<typeof createRenderer>, call: number) =>
    (renderer.render.mock.calls[call][0] as { container: Layer }).container;
  /** The containers of silhouettes: the only ones with filters. */
  const castersOf = () => containers.filter((container) => (container as Layer).filters !== undefined) as Layer[];

  it("draws every map when built: the level's occlusion, then the casters on it or higher", async () => {
    const world = at(defaultWorld(createTestEntities), 15);
    const { renderer, destroyScene } = await sceneOf(world);
    const levels = new Set(columnsOf(world).map(({ elevation }) => elevation));
    const entity = entitiesOf(world)[0];
    const projection = getShadowProjection(getSunState(world.parts.get(CLOCK_PART).tick));
    const lowerLevels = [...levels].filter((level) => level <= entity.elevation);

    expect(renderer.render).toHaveBeenCalledTimes(levels.size);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ clear: true, clearColor: [0, 0, 0, 0] }));
    // Its silhouettes are made once; each map it reaches draws them with a sprite of its own, in
    // that map's fixed layer. Nothing is cast on other entities: it is alone.
    expect(createSilhouettes).toHaveBeenCalledTimes(1);
    expect(createSilhouetteSprite).toHaveBeenCalledTimes(lowerLevels.length);
    expect(createReceivedShadows).not.toHaveBeenCalled();
    expect(placeSilhouette).toHaveBeenCalledTimes(lowerLevels.length);
    lowerLevels.forEach((level) => {
      expect(placeSilhouette).toHaveBeenCalledWith(
        expect.anything(),
        (vi.mocked(createSilhouettes).mock.results[0].value as Silhouette[])[0],
        getSilhouetteMatrix(projection as never, { x: entity.x, y: entity.y }, entity.elevation - level, TILE_METRICS),
        { x: -1.5, y: -1.5 },
        16,
      );
    });
    const layers = renderer.render.mock.calls.map((_, call) => layerOf(renderer, call));
    expect(layers.every(({ children }) => children.length >= 1)).toBe(true);
    expect(layers.filter(({ children }) => children.length === 2)).toHaveLength(lowerLevels.length);
    destroyScene();
  });

  it("puts the level's ambient occlusion, computed once, at the bottom of each map", async () => {
    const world = at(
      worldFrom([
        { x: 0, y: 0, elevation: 1 },
        { x: 1, y: 0, elevation: 0 },
        { x: 0, y: 1, elevation: 0 },
        { x: 1, y: 1, elevation: 0 },
      ]),
      12,
    );
    const { renderer, ticker, destroyScene } = await sceneOf(world);
    type OcclusionSprite = {
      texture: { source: { options: { resource: Uint8ClampedArray; width: number; height: number } } };
      scale: { value: number };
    };
    const occlusionOf = (call: number) => layerOf(renderer, call).children[0] as OcclusionSprite;
    const darkened = (call: number) => occlusionOf(call).texture.source.options.resource.some((value) => value > 0);

    expect(renderer.render).toHaveBeenCalledTimes(2);
    const { options } = occlusionOf(0).texture.source;
    expect(options.width).toBe((CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE);
    expect(options.height).toBe((CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE);
    expect(occlusionOf(0).scale.value).toBe(16 / AO_PIXELS_PER_TILE);
    // The low ground at the foot of (0, 0) is darkened; the top of (0, 0) is not.
    expect([darkened(0), darkened(1)].sort()).toEqual([false, true]);

    world.parts.get(CLOCK_PART).tick += 5 * SHADOW_REFRESH_TICKS;
    ticker.frame();
    // No casters: the occlusion never changes, so the maps are not redrawn by day.
    expect(renderer.render).toHaveBeenCalledTimes(2);
    destroyScene();
  });

  it("leaves no contact shadow around entities on flat ground", async () => {
    const world = at(
      worldFrom(
        [
          { x: 0, y: 0, elevation: 0 },
          { x: 1, y: 0, elevation: 0 },
        ],
        createTestEntities,
      ),
      0,
    );
    const { renderer, destroyScene } = await sceneOf(world);
    const resource = (
      layerOf(renderer, 0).children[0] as {
        texture: { source: { options: { resource: Uint8ClampedArray } } };
      }
    ).texture.source.options.resource;

    expect(entitiesOf(world).length).toBeGreaterThan(0);
    expect(resource.every((value) => value === 0)).toBe(true);
    destroyScene();
  });

  it("never hides or fades the ground views: the map decides what they show", async () => {
    const world = at(defaultWorld(createTestEntities), 9);
    const { children, ticker, destroyScene } = await sceneOf(world);

    for (let hour = 9; hour < 33; hour += 3) {
      world.parts.get(CLOCK_PART).tick = Math.round((hour / 24) * TICKS_PER_DAY);
      ticker.frame();
    }
    expect(groundShadows(children).every(({ visible, alpha }) => visible === true && alpha === 1)).toBe(true);
    destroyScene();
  });

  it("applies the sun's opacity to each group of silhouettes with shared blur and alpha filters", async () => {
    const world = at(defaultWorld(createTestEntities), 9);
    const { destroyScene } = await sceneOf(world);
    const casters = castersOf();
    const alpha = getShadowProjection(getSunState(world.parts.get(CLOCK_PART).tick))?.alpha;

    expect(casters.length).toBeGreaterThan(0);
    const [blur, opacity] = casters[0].filters as [{ options: unknown }, { alpha: number }];
    expect(blur.options).toEqual({ strength: 2, quality: 2 });
    expect(opacity.alpha).toBe(alpha);
    casters.forEach(({ filters }) => {
      expect(filters?.[0]).toBe(blur);
      expect(filters?.[1]).toBe(opacity);
    });
    destroyScene();
  });

  it("gives each group of silhouettes its map's rectangle as filter area, so Pixi never measures it", async () => {
    const { destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 9));
    const casters = castersOf() as (Layer & { filterArea?: unknown })[];

    expect(casters.length).toBeGreaterThan(0);
    const maps = vi
      .mocked(RenderTexture.create)
      .mock.results.map(({ value }) => value as { width: number; height: number });
    casters.forEach(({ filterArea }) => {
      expect(filterArea).toEqual({ x: 0, y: 0, width: maps[0].width, height: maps[0].height });
    });
    destroyScene();
  });

  it("draws the maps at night with the occlusion only, hiding the casters once", async () => {
    const world = at(defaultWorld(createTestEntities), 0);
    const { renderer, ticker, destroyScene } = await sceneOf(world);
    const levels = new Set(columnsOf(world).map(({ elevation }) => elevation));
    const casters = castersOf();

    expect(renderer.render).toHaveBeenCalledTimes(levels.size);
    expect(placeSilhouette).not.toHaveBeenCalled();
    expect(casters.length).toBeGreaterThan(0);
    expect(casters.every(({ visibleWrites }) => visibleWrites.join() === "false")).toBe(true);

    world.parts.get(CLOCK_PART).tick += 5 * SHADOW_REFRESH_TICKS;
    ticker.frame();
    expect(renderer.render).toHaveBeenCalledTimes(levels.size);
    expect(casters.every(({ visibleWrites }) => visibleWrites.length === 1)).toBe(true);
    destroyScene();
  });

  it("by day redraws one map per frame, once it is SHADOW_REFRESH_TICKS old", async () => {
    const world = at(defaultWorld(createTestEntities), 10);
    const { ticker, renderer, destroyScene } = await sceneOf(world);
    const draws = renderer.render.mock.calls.length;

    world.parts.get(CLOCK_PART).tick += SHADOW_REFRESH_TICKS - 1;
    ticker.frame();
    expect(renderer.render).toHaveBeenCalledTimes(draws);

    world.parts.get(CLOCK_PART).tick += 1;
    ticker.frame();
    expect(renderer.render).toHaveBeenCalledTimes(draws + 1);
    // The frame loop runs even when the clock stands still: the next stale map is drawn.
    ticker.frame();
    expect(renderer.render).toHaveBeenCalledTimes(draws + 2);
    destroyScene();
  });

  it("keeps every map moving when a refresh falls due on every frame", async () => {
    const world = at(defaultWorld(createTestEntities), 10);
    const { ticker, renderer, destroyScene } = await sceneOf(world);
    const built = renderer.render.mock.calls.length;
    const withCasters = new Set(
      renderer.render.mock.calls
        .map((_, call) => layerOf(renderer, call))
        .filter(({ children }) => children.length === 2),
    );

    for (let frame = 0; frame < 3 * withCasters.size; frame += 1) {
      world.parts.get(CLOCK_PART).tick += SHADOW_REFRESH_TICKS * 3;
      ticker.frame();
    }
    const redrawn = renderer.render.mock.calls.slice(built).map((_, call) => layerOf(renderer, built + call));

    expect(redrawn).toHaveLength(3 * withCasters.size);
    expect(new Set(redrawn)).toEqual(withCasters);
    destroyScene();
  });

  it("redraws each map with the sun of the frame it is drawn in", async () => {
    const world = at(defaultWorld(createTestEntities), 10);
    const { ticker, renderer, destroyScene } = await sceneOf(world);
    const entity = entitiesOf(world)[0];
    const lifts = [...new Set(columnsOf(world).map(({ elevation }) => elevation))]
      .filter((level) => level <= entity.elevation)
      .map((level) => entity.elevation - level);
    vi.mocked(placeSilhouette).mockClear();
    renderer.render.mockClear();

    world.parts.get(CLOCK_PART).tick += SHADOW_REFRESH_TICKS;
    ticker.frame();
    const projection = getShadowProjection(getSunState(world.parts.get(CLOCK_PART).tick));
    const [, silhouette, matrix] = vi.mocked(placeSilhouette).mock.calls[0];

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(
      lifts.map((lift) => getSilhouetteMatrix(projection as never, silhouette.worldFoot, lift, TILE_METRICS)),
    ).toContainEqual(matrix);
    destroyScene();
  });

  it("draws every map again at sunrise, with the casters shown", async () => {
    const world = at(defaultWorld(createTestEntities), 5.9);
    const { ticker, renderer, destroyScene } = await sceneOf(world);
    const levels = new Set(columnsOf(world).map(({ elevation }) => elevation));
    const casters = castersOf();
    expect(placeSilhouette).not.toHaveBeenCalled();

    world.parts.get(CLOCK_PART).tick = Math.round((6.2 / 24) * TICKS_PER_DAY);
    ticker.frame();

    expect(renderer.render).toHaveBeenCalledTimes(2 * levels.size);
    expect(placeSilhouette).toHaveBeenCalled();
    expect(casters.every(({ visibleWrites }) => visibleWrites.join() === "false,true")).toBe(true);
    destroyScene();
  });

  describe("on other entities", () => {
    /** A row of columns, entities standing on `entityColumns` (one with its block raised). */
    const row = (entityColumns: number[], raised?: number) =>
      worldFrom(
        [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0, elevation: x === raised ? 2 : 1 })),
        (columns) =>
          entityColumns.map((x) => {
            const column = columns.find((box) => box.x === x) as Box;
            return new Entity(
              x,
              0,
              {
                id: `tree-${x}`,
                textureSource: "/assets/tree/block.svg",
                height: 1,
                spawnChance: 1,
                surface: "grass",
              },
              column.elevation,
            );
          }),
      );
    type Received = ReturnType<typeof createReceivedShadows> & {
      casters: { visible: boolean };
      draw: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    const received = () => vi.mocked(createReceivedShadows).mock.results[0].value as Received;
    const receiversOf = () => vi.mocked(createReceivedShadows).mock.calls[0][0];

    it("lets each entity receive the silhouettes of the others whose shadow can reach it", async () => {
      const world = at(row([0, 1, 5]), 10);
      const { destroyScene } = await sceneOf(world);
      const footOf = (silhouette: { worldFoot: { x: number } }) => silhouette.worldFoot.x;

      expect(createReceivedShadows).toHaveBeenCalledTimes(1);
      // The two neighbours shade each other; the tree at x = 5 is beyond any shadow's reach.
      expect(
        receiversOf().map(({ own, casters }) => [footOf(own), casters.map(({ silhouette }) => footOf(silhouette))]),
      ).toEqual([
        [0, [1]],
        [1, [0]],
      ]);
      expect(receiversOf()[0].casters[0].lift).toBe(0);
      destroyScene();
    });

    it("gives each caster the blocks it stands above its receiver", async () => {
      const { destroyScene } = await sceneOf(at(row([0, 1], 1), 10));
      const lifts = receiversOf().map(({ casters }) => casters[0].lift);

      expect(lifts).toEqual([1, -1]);
      destroyScene();
    });

    it("draws a receiver's shadow right after its sprite, with the ground shadows' filters", async () => {
      const world = at(row([0, 1]), 10);
      const { children, destroyScene } = await sceneOf(world);
      type Child = View & { receivedShadowOf?: unknown };
      const shadowIndex = (children as Child[]).findIndex(({ receivedShadowOf }) => receivedShadowOf !== undefined);
      const shadow = children[shadowIndex] as Child;
      const [blur, opacity] = castersOf()[0].filters as unknown[];

      expect(children[shadowIndex - 1]).toBe(shadow.receivedShadowOf);
      expect(vi.mocked(createReceivedShadows).mock.calls[0][2]).toEqual([blur, opacity]);
      destroyScene();
    });

    it("lays the casters with the sun when built and on its turn by day", async () => {
      const world = at(row([0, 1]), 10);
      const { ticker, destroyScene } = await sceneOf(world);
      const { draw } = received();
      const sun = getShadowProjection(getSunState(world.parts.get(CLOCK_PART).tick));
      const offsetOf = draw.mock.calls[0][0] as (...args: unknown[]) => unknown;

      expect(draw).toHaveBeenCalledTimes(1);
      expect(offsetOf({ x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toEqual(
        getCastShadowOffset(sun as never, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, TILE_METRICS),
      );

      // One target per frame, the stalest: within a few frames the atlas is drawn again.
      const levels = new Set(columnsOf(world).map(({ elevation }) => elevation)).size;
      for (let frame = 0; frame <= levels; frame += 1) {
        world.parts.get(CLOCK_PART).tick += SHADOW_REFRESH_TICKS;
        ticker.frame();
      }
      expect(draw.mock.calls.length).toBeGreaterThan(1);
      destroyScene();
    });

    it("draws the atlas empty at night, hiding its casters", async () => {
      const { destroyScene } = await sceneOf(at(row([0, 1]), 0));

      expect(received().draw).toHaveBeenCalledWith(null);
      expect(received().casters.visible).toBe(false);
      destroyScene();
    });

    it("destroys the received shadows with the scene", async () => {
      const { destroyScene } = await sceneOf(at(row([0, 1]), 10));

      destroyScene();
      expect(received().destroy).toHaveBeenCalled();
    });
  });

  describe("chunk by chunk", () => {
    const TREE = {
      id: "tree",
      textureSource: "/assets/tree/block.svg",
      height: 1,
      spawnChance: 1,
      surface: "grass" as const,
    };
    /** Columns in chunks `0…3` along x, trees on both sides of the edge between chunks 0 and 1. */
    const edge = () =>
      at(
        worldFrom(
          [0, 30, 31, 32, 33, 64, 100].map((x) => ({ x, y: 0, elevation: 1 })),
          (columns) =>
            columns.filter(({ x }) => x === 31 || x === 32).map((box) => new Entity(box.x, 0, TREE, box.elevation)),
        ),
        10,
      );
    /** A camera module whose view is whatever `visible` holds. */
    const cameraOn = (visible: { chunks: { cx: number; cy: number }[] }) => ({
      id: "camera",
      setup: () => ({
        provides: { camera: { resize: vi.fn(), visibleChunks: () => visible.chunks } as never },
        destroy: () => {},
      }),
    });
    const sceneOn = async (world: World, visible: { chunks: { cx: number; cy: number }[] }) => {
      const { ticker, root, scene } = await mountScene(world, [
        cameraOn(visible),
        createTerrainView(),
        createEntityView(),
        createShadows(),
      ]);
      return { ticker, children: root.children as View[], scene };
    };

    it("lays the silhouettes of the neighbouring chunks' entities on a chunk's maps", async () => {
      const world = edge();
      const { scene } = await sceneOn(world, { chunks: [{ cx: 1, cy: 0 }] });

      // Chunk 1's map starts a margin before x = 32: the tree at x = 31, in chunk 0, casts on it.
      expect(scene.shownChunks()).toHaveLength(1);
      const origins = vi.mocked(placeSilhouette).mock.calls.map(([, , , origin]) => origin);
      expect(origins).toContainEqual({ x: 32 - SHADOW_MAP_MARGIN - 0.5, y: -SHADOW_MAP_MARGIN - 0.5 });
      // Made once, for the maps and the shadows entities cast on each other.
      expect(vi.mocked(createSilhouettes).mock.calls.map(([, entity]) => entity.box.x)).toEqual([32]);
      scene.destroy();
    });

    it("leaves out of a map the casters whose shadow cannot reach it", async () => {
      const world = edge();
      const visible = { chunks: [0, 1, 2].map((cx) => ({ cx, cy: 0 })) };
      const { scene } = await sceneOn(world, visible);
      const origins = vi.mocked(placeSilhouette).mock.calls.map(([, , , origin]) => origin.x);

      // The trees stand at x 31 and 32: chunk 1's map gets both, chunk 2's (from x 63) none.
      expect(scene.shownChunks()).toHaveLength(3);
      expect(origins.filter((x) => x === 32 - SHADOW_MAP_MARGIN - 0.5)).toHaveLength(2);
      expect(origins).not.toContain(64 - SHADOW_MAP_MARGIN - 0.5);
      scene.destroy();
    });

    it("gathers a chunk's casters again when a neighbour is shown or hidden", async () => {
      const world = edge();
      const visible = { chunks: [{ cx: 0, cy: 0 }] };
      const { ticker, children, scene } = await sceneOn(world, visible);
      const receivedCount = () => children.filter(({ source }) => source === "received-shadow").length;
      // Chunk 0 alone: its tree receives no shadow.
      expect(createReceivedShadows).not.toHaveBeenCalled();

      visible.chunks = [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
      ];
      await frameUntil(ticker, () => expect(scene.shownChunks()).toHaveLength(2));
      expect(SHADOW_GATHERS_PER_FRAME).toBe(1);
      // Both chunks gather their casters again, a step per frame (their maps, then the shadows
      // their entities receive), the one never gathered first.
      ticker.frame();
      expect(createReceivedShadows).not.toHaveBeenCalled();
      ticker.frame();
      expect(createReceivedShadows).toHaveBeenCalledTimes(1);
      ticker.frame();
      expect(createReceivedShadows).toHaveBeenCalledTimes(1);
      ticker.frame();
      // Both trees now shade each other, each in its own chunk's atlas.
      expect(createReceivedShadows).toHaveBeenCalledTimes(2);
      expect(receivedCount()).toBe(2);

      // Chunk 2 comes next to chunk 1: chunk 1 gathers again, and trades its atlas for a new one.
      visible.chunks = [0, 1, 2].map((cx) => ({ cx, cy: 0 }));
      await frameUntil(ticker, () => expect(scene.shownChunks()).toHaveLength(3));
      await frameUntil(ticker, () => expect(createReceivedShadows).toHaveBeenCalledTimes(3));
      // Chunk 1's first atlas: it gathered first, never drawn until then.
      const [first] = vi.mocked(createReceivedShadows).mock.results;
      expect((first.value as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled();
      expect(receivedCount()).toBe(2);

      visible.chunks = [];
      ticker.frame();
      expect(scene.shownChunks()).toEqual([]);
      expect(receivedCount()).toBe(0);
      vi.mocked(createReceivedShadows).mock.results.forEach(({ value }) =>
        expect((value as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled(),
      );
      scene.destroy();
    });

    it("draws a shown chunk's maps right away, and only those", async () => {
      const visible = { chunks: [{ cx: 3, cy: 0 }] };
      const { ticker, renderer, scene } = await mountScene(edge(), [cameraOn(visible), createShadows()]);
      const draws = renderer.render.mock.calls.length;

      visible.chunks = [{ cx: 0, cy: 0 }];
      ticker.frame();
      await vi.waitFor(() => expect(scene.shownChunks()).toHaveLength(1));
      ticker.frame();
      // Chunk 0 has one level of ground: one map, drawn on the frame after it is shown.
      expect(renderer.render).toHaveBeenCalledTimes(draws + 1);
      scene.destroy();
    });
  });

  it("casts nothing from a chunk whose entities are not provided", async () => {
    const empty: SceneModule = {
      id: "no-entities",
      setup: () => ({ provides: { entityViews: new Map() }, destroy: () => {} }),
    };
    const { scene } = await mountScene(at(defaultWorld(createTestEntities), 12), [empty, createShadows()]);

    expect(createSilhouettes).not.toHaveBeenCalled();
    expect(castersOf()).toHaveLength(0);
    scene.destroy();
  });

  it("draws the occlusion only without the entities' views", async () => {
    const world = at(defaultWorld(createTestEntities), 12);
    const { renderer, root, scene } = await mountScene(world, [createShadows()]);
    const levels = new Set(columnsOf(world).map(({ elevation }) => elevation));

    expect(root.children).toHaveLength(columnsOf(world).length);
    expect(renderer.render).toHaveBeenCalledTimes(levels.size);
    expect(createSilhouettes).not.toHaveBeenCalled();
    expect(castersOf()).toHaveLength(0);
    scene.destroy();
  });

  it("destroys the shadow maps, their layers and the occlusion textures when the scene is destroyed", async () => {
    const { renderer, destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 12));
    const maps = vi
      .mocked(RenderTexture.create)
      .mock.results.map(({ value }) => value as { destroy: ReturnType<typeof vi.fn> });
    const layers = renderer.render.mock.calls.map(
      (_, call) => layerOf(renderer, call) as Layer & { destroy: ReturnType<typeof vi.fn> },
    );
    const occlusion = layers.map(
      ({ children }) => (children[0] as { texture: { destroy: ReturnType<typeof vi.fn> } }).texture,
    );

    destroyScene();

    maps.forEach((map) => expect(map.destroy).toHaveBeenCalledWith(true));
    layers.forEach((layer) => expect(layer.destroy).toHaveBeenCalledWith({ children: true }));
    occlusion.forEach((texture) => expect(texture.destroy).toHaveBeenCalledWith(true));
  });
});
