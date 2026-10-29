import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
vi.mock("./silhouette", async () => (await import("../flow-check/scene-harness")).mockSilhouette());
vi.mock("./terrain-faces", async () => (await import("../flow-check/scene-harness")).mockTerrainFaces());
vi.mock("./received-shadow", async () => (await import("../flow-check/scene-harness")).mockReceivedShadow());

import { type BlurFilter, RenderTexture, Sprite } from "pixi.js";
import { Entity } from "../entities";
import { createEntityView } from "../entity-view";
import type { SceneModule, SceneView } from "../scene";
import { TILE_METRICS } from "../constants";
import { CHUNK_SIZE, chunkKey } from "../grid";
import {
  AO_PIXELS_PER_TILE,
  getCastShadowOffset,
  DAY_SHADOW_PROJECTION,
  SHADOW_MAP_PIXELS_PER_TILE,
  SHADOW_BLUR,
  createPhaseLighting,
  LIGHTING_PHASES,
  getSilhouetteMatrix,
} from "../lighting";
import {
  columnsOf,
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
import { CLOCK_PART, TICKS_PER_DAY } from "../time";
import type { World } from "../world";
import { createTerrainFaceShadows } from "./terrain-faces";
import { createReceivedShadowRig, createReceivedShadows } from "./received-shadow";
import { createShadows, SHADOW_GATHERS_PER_FRAME, SHADOW_MAP_MARGIN } from "./shadows";
import {
  createCasterSprites,
  createGroundShadowView,
  createMovingSilhouette,
  createSilhouettes,
  placeSilhouette,
  type Silhouette,
} from "./silhouette";

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
    return { ticker, renderer, children: root.children, destroyScene: scene.destroy };
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
        !view.groundShadow && !view.source?.includes("statue") && isAt(view, entity.x, entity.y) ? index : last,
      -1,
    );
    const shadowIndex = children.findIndex(
      (view) =>
        view.groundShadow &&
        Math.floor(view.texture?.frame.x ?? 0) === (entity.x + SHADOW_MAP_MARGIN) * SHADOW_MAP_PIXELS_PER_TILE &&
        Math.floor(view.texture?.frame.y ?? 0) === (entity.y + SHADOW_MAP_MARGIN) * SHADOW_MAP_PIXELS_PER_TILE,
    );
    const entityIndex = children.findIndex(({ source }) => source?.includes("statue"));

    expect(groundShadows(children)).toHaveLength(columnsOf(world).length);
    expect(topIndex).toBeLessThan(shadowIndex);
    expect(shadowIndex).toBeLessThan(entityIndex);
    destroyScene();
  });

  it("gives each tile its square of its chunk's one shadow map, inset half a texel next to other levels", async () => {
    const world = worldFrom([
      { x: 0, y: 0, elevation: 2 },
      { x: 1, y: 0, elevation: 2 },
      { x: 0, y: 1, elevation: 1 },
      { x: 1, y: 1, elevation: -1 },
    ]);
    const { children, renderer, destroyScene } = await sceneOf(world);
    const shadows = groundShadows(children);

    // All heights compose into the same map, with no per-height render textures.
    expect(RenderTexture.create).toHaveBeenCalledTimes(1);
    const side = (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * SHADOW_MAP_PIXELS_PER_TILE;
    expect(RenderTexture.create).toHaveBeenCalledWith({ width: side, height: side });
    const map = vi.mocked(RenderTexture.create).mock.results[0].value as { source: unknown };
    expect(new Set(shadows.map(({ texture }) => texture?.source))).toEqual(new Set([map.source]));
    // A side next to a column of another level (or none) is inset: its edge texels hold that level.
    expect(shadows.map(({ texture }) => texture?.frame)).toEqual(
      expect.arrayContaining([
        { x: 24.5, y: 24.5, width: 23.5, height: 23 },
        { x: 48, y: 24.5, width: 23.5, height: 23 },
        { x: 24.5, y: 48.5, width: 23, height: 23 },
        { x: 48.5, y: 48.5, width: 23, height: 23 },
      ]),
    );

    const draws = renderer.drawn.filter(({ children }) => children.length >= 2);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toEqual(expect.objectContaining({ target: map, clear: true }));
    const { children: planes } = draws[0].children[1] as unknown as {
      children: { mask: { rect: ReturnType<typeof vi.fn>; fill: ReturnType<typeof vi.fn> } }[];
    };
    expect(planes).toHaveLength(3);
    const rectangles = planes.flatMap(({ mask }) => mask.rect.mock.calls);
    expect(rectangles).toHaveLength(3);
    expect(rectangles).toEqual(
      expect.arrayContaining([
        [24, 24, 48, 24],
        [24, 48, 24, 24],
        [48, 48, 24, 24],
      ]),
    );
    planes.forEach(({ mask }) => expect(mask.fill).toHaveBeenCalledWith(0xffffff));
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
      children.filter((view) => !view.groundShadow && view.x === x && view.source?.includes("/")).at(-1);
    const shadowAt = (frameX: number) =>
      groundShadows(children).find(({ texture }) => Math.floor(texture?.frame.x ?? 0) === frameX);

    expect(blockAt(1)?.source).toBe("/assets/sand/block.svg");
    // (2, 0) is half a tile higher on screen than (1, 0); the sand top is half a block lower still.
    expect((shadowAt(24)?.tileTop?.y ?? 0) - (shadowAt(48)?.tileTop?.y ?? 0)).toBeCloseTo(
      TILE_METRICS.tileHeight / 2 + TILE_METRICS.boxHeight / 2,
    );
    destroyScene();
  });

  type Renderer = ReturnType<typeof createRenderer>;
  /** The shared caster sprites, as a draw left them: the filters and how many it showed. */
  type Casters = { filters: unknown[]; filterArea: unknown; shown: number };
  type LevelDraw = { readonly container: unknown; readonly children: ReadonlyArray<Record<string, unknown>> };
  /**
   * Each level of a map drawn into the scratch texture, in order (`clear`), as it was drawn; the
   * copy of its columns into the chunk's map that follows each one is left out.
   */
  const levelDraws = (renderer: Renderer): LevelDraw[] =>
    renderer.drawn.filter(({ clear, children }) => clear && children.length === 2 && "filters" in children[1]);
  /** What level draw number `draw` was drawn from: the occlusion, the casters and the other levels' eraser. */
  const layerOf = (renderer: Renderer, draw: number) => levelDraws(renderer)[draw];
  /** The casters of a level draw, as it drew them. */
  const castersIn = (draw: LevelDraw): Casters => {
    const root = draw.children[1] as unknown as Casters & {
      children: { visible: boolean; children: { casterSprite?: boolean; visible: boolean }[] }[];
    };
    return {
      ...root,
      shown: root.children.reduce(
        (count, layer) =>
          count + (layer.visible ? layer.children.filter((sprite) => sprite.casterSprite && sprite.visible).length : 0),
        0,
      ),
    };
  };
  /** The module's caster sprites (made once, whatever the chunks shown). */
  const casterSprites = () =>
    vi.mocked(createCasterSprites).mock.results.map(
      ({ value }) =>
        value as {
          container: Casters & { children: unknown[]; addChild: ReturnType<typeof vi.fn> };
          sprite: ReturnType<typeof vi.fn>;
          show: ReturnType<typeof vi.fn>;
        },
    );

  it("draws every map when built: the level's occlusion, then the casters on it or higher", async () => {
    const world = at(defaultWorld(createTestEntities), 15);
    // The ground transform is one object written again for each silhouette: keep a copy of each.
    const grounds: unknown[] = [];
    vi.mocked(placeSilhouette).mockImplementation((_sprite, _silhouette, ground) => void grounds.push({ ...ground }));
    const { renderer, destroyScene } = await sceneOf(world);
    const levels = new Set(columnsOf(world).map(({ elevation, type }) => elevation - (type === "sand" ? 0.5 : 0)));
    const entity = entitiesOf(world)[0];
    const projection = DAY_SHADOW_PROJECTION;
    const lowerLevels = [...levels].filter((level) => level <= entity.elevation);

    expect(levelDraws(renderer)).toHaveLength(1);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ clear: true, clearColor: [0, 0, 0, 0] }));
    // Its silhouettes are made once; each map it reaches lays them on the module's caster sprites,
    // the same for every map. Nothing is cast on other entities: it is alone.
    expect(createSilhouettes).toHaveBeenCalledTimes(1);
    expect(casterSprites()).toHaveLength(1);
    const [casters] = casterSprites();
    const placements = casters.sprite.mock.calls.length;
    expect(placements).toBeGreaterThan(0);
    expect(placements).toBeLessThanOrEqual(lowerLevels.length);
    expect(casters.sprite.mock.calls.map(([index]) => index as number)).toEqual(
      Array.from({ length: placements }, (_value, index) => index),
    );
    expect(casters.container.children).toHaveLength(placements);
    expect(
      vi
        .mocked(createReceivedShadows)
        .mock.calls.every(([receivers]) => receivers.every(({ casters }) => casters.length === 0)),
    ).toBe(true);
    expect(placeSilhouette).toHaveBeenCalledTimes(placements);
    expect(placeSilhouette).toHaveBeenCalledWith(
      expect.anything(),
      (vi.mocked(createSilhouettes).mock.results[0].value as Silhouette[])[0],
      expect.anything(),
      { x: -1.5, y: -1.5 },
      SHADOW_MAP_PIXELS_PER_TILE,
    );
    const expectedTransforms = lowerLevels.map((level) =>
      getSilhouetteMatrix(projection, { x: entity.x, y: entity.y }, entity.elevation - level, TILE_METRICS),
    );
    grounds.forEach((matrix) => expect(expectedTransforms).toContainEqual(matrix));
    vi.mocked(placeSilhouette).mockReset();
    const draws = levelDraws(renderer);
    expect(draws).toHaveLength(1);
    expect(castersIn(draws[0]).shown).toBe(placements);
    destroyScene();
  });

  it("puts the chunk's ambient occlusion, computed once, at the bottom of every level", async () => {
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
    /** Whether the occlusion darkens any texel of column `(x, y)`'s square. */
    const darkened = (x: number, y: number) => {
      const { resource, width } = occlusionOf(0).texture.source.options;
      const left = (x + SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE;
      const top = (y + SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE;
      for (let j = 0; j < AO_PIXELS_PER_TILE; j += 1) {
        for (let i = 0; i < AO_PIXELS_PER_TILE; i += 1)
          if (resource[((top + j) * width + left + i) * 4 + 3] > 0) return true;
      }
      return false;
    };

    expect(levelDraws(renderer)).toHaveLength(1);
    const { options } = occlusionOf(0).texture.source;
    expect(options.width).toBe((CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE);
    expect(options.height).toBe((CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE);
    expect(occlusionOf(0).scale.value).toBe(SHADOW_MAP_PIXELS_PER_TILE / AO_PIXELS_PER_TILE);
    // One occlusion for both levels: the low ground at the foot of (0, 0) is darkened; its top is not.
    expect(darkened(1, 0)).toBe(true);
    expect(darkened(0, 0)).toBe(false);

    world.parts.get(CLOCK_PART).tick += 500;
    ticker.frame();
    // No casters: the occlusion never changes, so the maps are not redrawn by day.
    expect(levelDraws(renderer)).toHaveLength(1);
    destroyScene();
  });

  it("bakes entity contact shadows into the flat-ground occlusion map", async () => {
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
    expect(resource.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    destroyScene();
  });

  it("omits contact shadows for entities configured without them", async () => {
    const world = worldFrom(
      [
        { x: 0, y: 0, elevation: 0 },
        { x: 1, y: 0, elevation: 0 },
      ],
      (columns) => [
        new Entity(
          columns[0].x,
          columns[0].y,
          {
            id: "pier",
            textureSource: "/assets/pier.svg",
            height: 1,
            length: 2,
            spawnChance: 1,
            surface: "sand",
            contactShadow: false,
          },
          columns[0].elevation,
        ),
      ],
    );
    const { renderer, destroyScene } = await sceneOf(world);
    const resource = (
      layerOf(renderer, 0).children[0] as {
        texture: { source: { options: { resource: Uint8ClampedArray } } };
      }
    ).texture.source.options.resource;

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

  it("applies the sun's opacity to all the silhouettes of a map at once, with shared blur and alpha filters", async () => {
    const world = at(defaultWorld(createTestEntities), 9);
    const { destroyScene } = await sceneOf(world);
    const alpha = DAY_SHADOW_PROJECTION.alpha;

    expect(casterSprites()).toHaveLength(1);
    const [blur, opacity] = casterSprites()[0].container.filters as [{ options: unknown }, { alpha: number }];
    expect(blur.options).toEqual({ strength: SHADOW_BLUR, quality: 1 });
    expect(opacity.alpha).toBe(alpha);
    destroyScene();
  });

  it("bounds each filter by its receiver plane instead of filtering the entire chunk", async () => {
    const { renderer, destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 9));

    const maps = vi
      .mocked(RenderTexture.create)
      .mock.results.map(({ value }) => value as { width: number; height: number });
    expect(levelDraws(renderer).length).toBeGreaterThan(0);
    levelDraws(renderer).forEach((draw) => {
      const area = castersIn(draw).filterArea as { x: number; y: number; width: number; height: number };
      expect(area.width).toBeGreaterThan(0);
      expect(area.height).toBeGreaterThan(0);
      expect(area.x + area.width).toBeLessThanOrEqual(maps[0].width);
      expect(area.y + area.height).toBeLessThanOrEqual(maps[0].height);
    });
    destroyScene();
  });

  it("bakes the same daylight at every clock hour and never refreshes it as time advances", async () => {
    const world = at(defaultWorld(createTestEntities), 0);
    const { renderer, ticker, destroyScene } = await sceneOf(world);
    const draws = renderer.render.mock.calls.length;
    expect(placeSilhouette).toHaveBeenCalled();
    for (let hour = 0; hour <= 48; hour += 1) {
      at(world, hour);
      ticker.frame();
    }
    expect(renderer.render).toHaveBeenCalledTimes(draws);
    destroyScene();
  });

  it("reprojects maps during phase changes and stops baking once the phase is stable", async () => {
    const lighting = createPhaseLighting();
    const world = defaultWorld(createTestEntities);
    const { ticker, renderer, root, scene } = await mountScene(world, [
      createTerrainView(),
      createEntityView(),
      createShadows(lighting),
    ]);
    const draws = renderer.render.mock.calls.length;
    lighting.transitionTo("sunset");
    lighting.advance(1000);
    ticker.frame();
    const shadows = groundShadows(root.children);
    expect(shadows.every(({ alpha }) => alpha === 1)).toBe(true);
    lighting.advance(1000);
    ticker.frame();
    ticker.frame();
    expect(renderer.render.mock.calls.length).toBeGreaterThan(draws);
    const baked = renderer.render.mock.calls.length;
    ticker.frame();
    expect(renderer.render).toHaveBeenCalledTimes(baked);
    scene.destroy();
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
      draw: ReturnType<typeof vi.fn>;
      follow: ReturnType<typeof vi.fn>;
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
        [5, []],
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
      const [blur, opacity] = casterSprites()[0].container.filters;
      const [rig] = vi.mocked(createReceivedShadowRig).mock.results;

      expect(children.findIndex((child) => child === shadow.receivedShadowOf)).toBeLessThan(shadowIndex);
      expect(createReceivedShadowRig).toHaveBeenCalledTimes(1);
      expect(vi.mocked(createReceivedShadowRig).mock.calls[0][1]).toEqual([blur, opacity]);
      expect(vi.mocked(createReceivedShadows).mock.calls[0][1]).toBe(rig.value);
      destroyScene();
    });

    it("times its gathering and its draws for a profiled scene", async () => {
      const record = vi.fn();
      let clock = 0;
      const world = at(row([0, 1]), 10);
      const { ticker, scene } = await mountScene(world, [createTerrainView(), createEntityView(), createShadows()], {
        profiler: { now: () => (clock += 1), record },
      });
      world.parts.get(CLOCK_PART).tick += 100;
      ticker.frame();

      const labels = new Set(record.mock.calls.map(([label]) => label as string));
      expect([...labels]).toEqual(
        expect.arrayContaining([
          "shadows:gather-maps",
          "shadows:gather-pairs",
          "shadows:gather-received",
          "shadows:maps",
          "shadows:received",
          "shadows:follow",
        ]),
      );
      scene.destroy();
    });

    it("leans each atlas's views with the parts they cover, every frame", async () => {
      const world = at(row([0, 1]), 10);
      const { ticker, destroyScene } = await sceneOf(world);
      const { follow } = received();
      const before = follow.mock.calls.length;

      ticker.frame();
      ticker.frame();

      expect(follow).toHaveBeenCalledTimes(before + 2);
      destroyScene();
    });

    it("lays the casters with the sun when built and on its turn by day", async () => {
      const world = at(row([0, 1]), 10);
      const { ticker, destroyScene } = await sceneOf(world);
      const { draw } = received();
      const sun = DAY_SHADOW_PROJECTION;
      const offsetOf = draw.mock.calls[0][0] as (...args: unknown[]) => unknown;

      expect(draw).toHaveBeenCalledTimes(1);
      expect(offsetOf({ x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toEqual(
        getCastShadowOffset(sun as never, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, TILE_METRICS),
      );

      // One target per frame, the stalest: within a few frames the atlas is drawn again.
      const levels = new Set(columnsOf(world).map(({ elevation, type }) => elevation - (type === "sand" ? 0.5 : 0)))
        .size;
      for (let frame = 0; frame <= levels; frame += 1) {
        world.parts.get(CLOCK_PART).tick += 100;
        ticker.frame();
      }
      expect(draw).toHaveBeenCalledTimes(1);
      destroyScene();
    });

    it("uses the baked daylight atlas even when the clock starts at night", async () => {
      const { destroyScene } = await sceneOf(at(row([0, 1]), 0));

      expect(received().draw).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        DAY_SHADOW_PROJECTION,
      );
      destroyScene();
    });

    it("grades received atlases during a transition without rendering them again", async () => {
      const lighting = createPhaseLighting();
      const { root, ticker, scene } = await mountScene(row([0, 1]), [createEntityView(), createShadows(lighting)]);
      const views = root.children.filter((view) => "receivedShadowOf" in view);
      expect(views.length).toBeGreaterThan(0);
      const draws = received().draw.mock.calls.length;
      lighting.transitionTo("sunset", 0);
      ticker.frame();
      expect(views.every((view) => view.alpha === 1)).toBe(true);
      expect(received().draw.mock.calls.length).toBeGreaterThan(draws);
      scene.destroy();
    });

    it("destroys the received shadows and their rig with the scene", async () => {
      const { destroyScene } = await sceneOf(at(row([0, 1]), 10));
      const rig = vi.mocked(createReceivedShadowRig).mock.results[0].value as { destroy: ReturnType<typeof vi.fn> };

      destroyScene();
      expect(received().destroy).toHaveBeenCalled();
      expect(rig.destroy).toHaveBeenCalled();
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
        provides: {
          camera: {
            cullViews: vi.fn((views: readonly SceneView[]) => views.map(() => true)),
            visibleChunks: () => visible.chunks,
          } as never,
        },
        destroy: () => {},
      }),
    });
    const sceneOn = async (world: World, visible: { chunks: { cx: number; cy: number }[] }) => {
      const { ticker, renderer, root, scene } = await mountScene(world, [
        cameraOn(visible),
        createTerrainView(),
        createEntityView(),
        createShadows(),
      ]);
      return { ticker, renderer, children: () => root.children, scene };
    };

    it("keeps existing walls on the current phase while topology is gathered over several frames", async () => {
      const visible = { chunks: [0, 1, 2].map((cx) => ({ cx, cy: 0 })) };
      const lighting = createPhaseLighting();
      const { ticker, scene } = await mountScene(edge(), [
        cameraOn(visible),
        createTerrainView(),
        createEntityView(),
        createShadows(lighting),
      ]);
      const walls = vi
        .mocked(createTerrainFaceShadows)
        .mock.results.map(({ value }) => value as { draw: ReturnType<typeof vi.fn> });
      visible.chunks = [0, 1, 2, 3].map((cx) => ({ cx, cy: 0 }));
      lighting.transitionTo("sunset", 1000);
      for (let frame = 0; frame < 16; frame += 1) {
        lighting.advance(16);
        ticker.frame();
        walls.forEach(({ draw }) => expect(draw.mock.lastCall![1]).toBe(lighting.current.shadow));
        await Promise.resolve();
      }
      scene.destroy();
    });

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
      const receivedCount = () => children().filter(({ source }) => source === "received-shadow").length;
      // Chunk 0 alone: its tree receives no shadow.
      expect(
        vi
          .mocked(createReceivedShadows)
          .mock.calls.every(([receivers]) => receivers.every(({ casters }) => casters.length === 0)),
      ).toBe(true);

      visible.chunks = [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
      ];
      await frameUntil(ticker, () => expect(scene.shownChunks()).toHaveLength(2));
      expect(SHADOW_GATHERS_PER_FRAME).toBe(1);
      await frameUntil(ticker, () => {
        const paired = vi
          .mocked(createReceivedShadows)
          .mock.calls.filter(([receivers]) => receivers.some(({ casters }) => casters.length > 0));
        expect(paired).toHaveLength(2);
      });
      expect(receivedCount()).toBe(2);
      const beforeNeighbour = vi.mocked(createReceivedShadows).mock.calls.length;

      // Chunk 2 comes next to chunk 1: chunk 1 gathers again, and trades its atlas for a new one.
      visible.chunks = [0, 1, 2].map((cx) => ({ cx, cy: 0 }));
      await frameUntil(ticker, () => expect(scene.shownChunks()).toHaveLength(3));
      await frameUntil(ticker, () =>
        expect(vi.mocked(createReceivedShadows).mock.calls.length).toBeGreaterThan(beforeNeighbour),
      );
      // Chunk 1's first atlas: it gathered first, never drawn until then.
      const [first] = vi.mocked(createReceivedShadows).mock.results;
      expect((first.value as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled();
      expect(receivedCount()).toBe(2);

      // Out of view, hidden one per frame.
      visible.chunks = [];
      await frameUntil(ticker, () => expect(scene.shownChunks()).toEqual([]));
      expect(receivedCount()).toBe(0);
      vi.mocked(createReceivedShadows).mock.results.forEach(({ value }) =>
        expect((value as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled(),
      );
      scene.destroy();
    });

    it("leaves out of a level's map the casters that cannot reach a column of that level", async () => {
      // A tree on the high ground at x = 0; the low ground, 20 tiles away, is out of its reach.
      const world = at(
        worldFrom(
          [
            { x: 0, y: 0, elevation: 2 },
            { x: 1, y: 0, elevation: 2 },
            { x: 20, y: 0, elevation: 0 },
            { x: 21, y: 0, elevation: 0 },
          ],
          ([first]) => [new Entity(first.x, first.y, TREE, first.elevation)],
        ),
        10,
      );
      const { scene } = await sceneOn(world, { chunks: [{ cx: 0, cy: 0 }] });

      // Two maps, but only the high one takes the tree's silhouette.
      expect(RenderTexture.create).toHaveBeenCalledTimes(1);
      expect(placeSilhouette).toHaveBeenCalledTimes(1);
      scene.destroy();
    });

    it("keeps stable caster slots per receiver plane and reuses released slots when chunks leave", async () => {
      const visible = { chunks: [0, 1].map((cx) => ({ cx, cy: 0 })) };
      const { ticker, renderer, scene } = await sceneOn(edge(), visible);
      expect(new Set(levelDraws(renderer).map(({ container }) => container)).size).toBe(2);

      visible.chunks = [{ cx: 3, cy: 0 }];
      ticker.frame();
      expect(scene.shownChunks()).not.toContain(chunkKey(0, 0));
      visible.chunks = [0, 1].map((cx) => ({ cx, cy: 0 }));
      await frameUntil(ticker, () => expect(scene.shownChunks()).toHaveLength(2));
      for (let frame = 0; frame < 6; frame += 1) ticker.frame();

      // Each map contains only its own reached caster; the shared pool reuses all four slots.
      const largest = Math.max(...levelDraws(renderer).map((draw) => castersIn(draw).shown));
      expect(largest).toBe(1);
      expect(casterSprites()).toHaveLength(1);
      expect(casterSprites()[0].container.children).toHaveLength(4);
      scene.destroy();
    });

    it("draws a shown chunk's maps right away, and only those", async () => {
      const visible = { chunks: [{ cx: 3, cy: 0 }] };
      const { ticker, renderer, scene } = await mountScene(edge(), [cameraOn(visible), createShadows()]);
      const draws = levelDraws(renderer).length;

      visible.chunks = [{ cx: 0, cy: 0 }];
      ticker.frame();
      await vi.waitFor(() => expect(scene.shownChunks()).toHaveLength(1));
      ticker.frame();
      // Chunk 0 has one level of ground: one map, drawn on the frame after it is shown.
      expect(levelDraws(renderer)).toHaveLength(draws + 1);
      scene.destroy();
    });
  });

  it("casts nothing from a chunk whose entities are not provided", async () => {
    const empty: SceneModule = {
      id: "no-entities",
      setup: () => ({ provides: { entityViews: new Map() }, destroy: () => {} }),
    };
    const { renderer, scene } = await mountScene(at(defaultWorld(createTestEntities), 12), [empty, createShadows()]);

    expect(createSilhouettes).not.toHaveBeenCalled();
    expect(levelDraws(renderer).every((draw) => castersIn(draw).shown === 0)).toBe(true);
    scene.destroy();
  });

  it("draws the occlusion only without the entities' views", async () => {
    const world = at(defaultWorld(createTestEntities), 12);
    const { renderer, root, scene } = await mountScene(world, [createShadows()]);

    expect(root.children).toHaveLength(columnsOf(world).length);
    expect(levelDraws(renderer)).toHaveLength(1);
    expect(createSilhouettes).not.toHaveBeenCalled();
    expect(levelDraws(renderer).every((draw) => castersIn(draw).shown === 0)).toBe(true);
    scene.destroy();
  });

  it("takes the ground shadows' sprites from its pool and gives a hidden chunk's back to it", async () => {
    const { children, destroyScene } = await sceneOf(at(defaultWorld(), 12));
    const ground = children.filter(({ source }) => source === "ground-shadow");
    const pool = vi.mocked(createGroundShadowView).mock.calls[0][4] as unknown as {
      kept: unknown[];
      destroy: ReturnType<typeof vi.fn>;
    };

    expect(ground.length).toBeGreaterThan(0);
    expect(vi.mocked(createGroundShadowView).mock.calls.every((call) => (call[4] as unknown) === pool)).toBe(true);
    destroyScene();
    expect(pool.kept).toHaveLength(ground.length);
    expect(pool.kept).toEqual(expect.arrayContaining(ground));
    expect(pool.destroy).toHaveBeenCalled();
  });

  it("unites moving and static casters in the same terrain maps without a second overlay", async () => {
    const world = at(defaultWorld(), 12);
    const [column] = columnsOf(world);
    const foot = { ground: { x: column.x, y: column.y, elevation: column.elevation }, screen: { x: 0, y: 0 } };
    const view = new Sprite({} as never);
    view.width = 1;
    view.height = 1;
    const mover: SceneModule = {
      id: "mover",
      setup: () => ({ provides: { movingCasters: [{ view, foot: () => foot }] }, destroy: () => {} }),
    };
    const { ticker, renderer, root, scene } = await mountScene(world, [createTerrainView(), mover, createShadows()]);
    expect(RenderTexture.create).toHaveBeenCalledTimes(1);
    expect(groundShadows(root.children)).toHaveLength(columnsOf(world).length);
    expect(createMovingSilhouette).toHaveBeenCalledTimes(1);
    const front = vi.mocked(RenderTexture.create).mock.results[0].value as ReturnType<typeof RenderTexture.create>;
    const writes = () => renderer.drawn.filter(({ target }) => target === front).length;
    const initial = writes();
    foot.ground = { ...foot.ground, x: column.x + 0.1 };
    ticker.frame();
    expect(writes()).toBe(initial * 2);
    expect(createMovingSilhouette).toHaveBeenCalledTimes(1);
    ticker.frame();
    expect(writes()).toBe(initial * 2);
    scene.destroy();
    expect(front.destroy).toHaveBeenCalledWith(true);
  });

  it("destroys the shadow maps, their masks and occlusion, the scratch, the filters and what draws them with the scene", async () => {
    const { renderer, destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 12));
    type Destroyable = { destroy: ReturnType<typeof vi.fn> };
    const maps = vi.mocked(RenderTexture.create).mock.results.map(({ value }) => value as Destroyable);
    const occlusion = layerOf(renderer, 0).children[0].texture as Destroyable;
    const masks = vi
      .mocked(casterSprites()[0].container.addChild)
      .mock.calls.map(([root]) => (root as { mask: Destroyable }).mask);
    const roots = new Set(
      renderer.drawn.filter(({ children }) => children.length >= 2).map(({ container }) => container as Destroyable),
    );
    const [rig] = vi.mocked(createReceivedShadowRig).mock.results;
    const filters = casterSprites()[0].container.filters as Destroyable[];

    destroyScene();

    // The blur and the sun's opacity, shared by the maps and the received shadows.
    expect(filters).toHaveLength(2);
    filters.forEach((filter) => expect(filter.destroy).toHaveBeenCalledTimes(1));

    expect(maps).toHaveLength(1);
    maps.forEach((map) => expect(map.destroy).toHaveBeenCalledWith(true));
    // The level and its copy, with the caster sprites.
    expect(roots.size).toBe(1);
    roots.forEach((root) => expect(root.destroy).toHaveBeenCalledWith({ children: true }));
    expect((rig.value as Destroyable).destroy).toHaveBeenCalled();
    expect(occlusion.destroy).toHaveBeenCalledWith(true);
    masks.forEach((mask) => expect(mask.destroy).toHaveBeenCalledWith({ context: true }));
  });
});

describe("moving terrain shadow receivers", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });
  it("uses current-frame terrain visibility and grades moving and received views without clock refresh", async () => {
    const world = worldFrom(
      [
        { x: 0, y: 0, elevation: 0 },
        { x: 0, y: -1, elevation: 4 },
        { x: 1, y: 0, elevation: 0 },
      ],
      (columns) =>
        columns
          .filter(({ y }) => y === 0)
          .map(
            (column) =>
              new Entity(
                column.x,
                column.y,
                { id: "tree", height: 1, spawnChance: 1, surface: "grass", textureSource: "/assets/tree/block.svg" },
                column.elevation,
              ),
          ),
    );
    const foot = { ground: { x: 0, y: 0, elevation: 0 }, screen: { x: 0, y: 0 } };
    const receiveTerrainShadow = vi.fn();
    const mover: SceneModule = {
      id: "mover",
      setup: () => ({
        provides: { movingCasters: [{ view: new Sprite({} as never), foot: () => foot, receiveTerrainShadow }] },
        destroy: () => {},
      }),
    };
    const lighting = createPhaseLighting();
    const { ticker, scene } = await mountScene(world, [createEntityView(), mover, createShadows(lighting)]);
    for (let i = 0; i < 60; i += 1) ticker.frame();
    expect(receiveTerrainShadow).toHaveBeenCalled();
    expect(receiveTerrainShadow.mock.calls.some(([alpha]) => alpha > 0)).toBe(true);
    const dayAlpha = receiveTerrainShadow.mock.lastCall![0] as number;
    lighting.transitionTo("night", 0);
    for (let i = 0; i < 60; i += 1) ticker.frame();
    expect(receiveTerrainShadow.mock.lastCall![0]).toBeCloseTo(
      (dayAlpha * lighting.current.shadowStrength * lighting.current.shadow.alpha) / DAY_SHADOW_PROJECTION.alpha,
      2,
    );
    foot.ground = { x: -50, y: -50, elevation: 0 };
    for (let i = 0; i < 60; i += 1) ticker.frame();
    expect(receiveTerrainShadow).toHaveBeenLastCalledWith(0);
    foot.ground = { x: 80, y: 80, elevation: 0 };
    ticker.frame();
    scene.destroy();
  });
});

it("uses the same height-aware terrain visibility on complete entity receivers and wall bands", async () => {
  resetHarness();
  vi.clearAllMocks();
  const wallView = new Sprite({} as never);
  const walls = {
    views: [{ view: wallView, depth: 0, layer: 1 as const }],
    levels: [-0.5],
    clear: vi.fn(),
    begin: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  };
  vi.mocked(createTerrainFaceShadows).mockReturnValueOnce(walls);
  const world = worldFrom(
    [
      { x: 0, y: 0, elevation: 0 },
      { x: 0, y: -1, elevation: 5 },
    ],
    ([column]) => [
      new Entity(
        column.x,
        column.y,
        { id: "tree", height: 2, spawnChance: 1, textureSource: "/assets/tree/block.svg", surface: "grass" },
        column.elevation,
      ),
    ],
  );
  const lighting = createPhaseLighting();
  const { ticker, scene } = await mountScene(world, [createEntityView(), createShadows(lighting)]);
  const wallVisible = vi.mocked(createTerrainFaceShadows).mock.calls.at(-1)![1].isVisible!;
  const receiverVisible = vi.mocked(createReceivedShadows).mock.calls[0][3]!;
  expect(wallVisible(wallView)).toBe(true);
  expect(receiverVisible(wallView)).toBe(true);
  wallView.culled = true;
  expect(wallVisible(wallView)).toBe(false);
  expect(receiverVisible(wallView)).toBe(false);
  wallView.culled = false;
  const result = vi.mocked(createReceivedShadows).mock.results[0].value as ReturnType<typeof createReceivedShadows> & {
    draw: ReturnType<typeof vi.fn>;
  };
  const own = vi.mocked(createReceivedShadows).mock.calls[0][0][0].own;
  const sample = result.draw.mock.calls[0][1] as (own: Silhouette, x: number, y: number) => number;
  expect(sample(own, own.screenFoot.x, own.screenFoot.y)).toBe(1);
  expect(sample(own, own.screenFoot.x, own.screenFoot.y - 6 * TILE_METRICS.boxHeight)).toBe(0);
  lighting.transitionTo("sunset", 0);
  ticker.frame();
  expect(wallView.alpha).toBe(1);
  expect(walls.commit).toHaveBeenLastCalledWith(lighting.current.shadowStrength * lighting.current.shadow.alpha);
  const sunsetSample = result.draw.mock.lastCall![1] as typeof sample;
  expect(sunsetSample(own, own.screenFoot.x, own.screenFoot.y)).toBe(0);
  expect(walls.draw).toHaveBeenCalledWith(null, lighting.current.shadow, expect.any(Array), expect.any(Array));
  scene.destroy();
  expect(walls.destroy).toHaveBeenCalled();
});

it("samples shadow rows at the moving receiver's actual height, with a safe non-sprite fallback", async () => {
  resetHarness();
  vi.clearAllMocks();
  const world = worldFrom([
    { x: 0, y: 0, elevation: 0 },
    { x: 0, y: -1, elevation: 3 },
  ]);
  const view = new Sprite({} as never);
  Object.assign(view, { x: 0, y: -3 * TILE_METRICS.boxHeight, width: 20, height: 3 * TILE_METRICS.boxHeight });
  view.anchor.x = 0.5;
  const foot = { ground: { x: 0, y: 0, elevation: 0 }, screen: { x: 0, y: 0 } };
  let shown = new Float32Array(16);
  const receiveTerrainShadowBands = vi.fn((samples: ArrayLike<number>) => {
    shown = Float32Array.from(samples);
  });
  const unsupported = vi.fn();
  const mover: SceneModule = {
    id: "mover",
    setup: () => ({
      provides: {
        movingCasters: [
          { view, foot: () => foot, receiveTerrainShadowBands },
          { view: {} as never, foot: () => foot, receiveTerrainShadowBands: unsupported },
        ],
      },
      destroy: () => {},
    }),
  };
  const { ticker, scene } = await mountScene(world, [mover, createShadows()]);
  for (let i = 0; i < 60; i += 1) ticker.frame();
  expect(shown[0]).toBeGreaterThan(shown[15]);
  expect(unsupported).not.toHaveBeenCalled();
  foot.ground = { x: 100, y: 100, elevation: 0 };
  for (let i = 0; i < 60; i += 1) ticker.frame();
  expect(shown.every((alpha) => alpha < 0.001)).toBe(true);
  scene.destroy();
});

it("reprojects the complete wall atlas in the current frame, including sub-degree phase movement", async () => {
  resetHarness();
  vi.clearAllMocks();
  const walls = {
    views: [],
    levels: Array.from({ length: 80 }, (_, index) => index / 2 - 40),
    clear: vi.fn(),
    begin: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  };
  vi.mocked(createTerrainFaceShadows).mockReturnValueOnce(walls);
  const lighting = createPhaseLighting();
  const { ticker, scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 0 }]), [createShadows(lighting)]);
  walls.draw.mockClear();
  lighting.transitionTo("sunset", 3000);
  lighting.advance(1);
  ticker.frame();
  expect(walls.draw).toHaveBeenCalledTimes(1);
  expect(walls.draw.mock.calls.every(([, light]) => light === lighting.current.shadow)).toBe(true);
  walls.draw.mockClear();
  lighting.advance(1);
  ticker.frame();
  expect(walls.draw).toHaveBeenCalledTimes(1);
  expect(walls.draw.mock.calls.every(([, light]) => light === lighting.current.shadow)).toBe(true);
  lighting.advance(3000);
  ticker.frame();
  walls.draw.mockClear();
  for (let frame = 0; frame < 120; frame += 1) ticker.frame();
  expect(walls.draw).not.toHaveBeenCalled();
  scene.destroy();
});

it("keeps hidden phase maps dirty and catches them up before their receivers enter the cull margin", async () => {
  resetHarness();
  vi.clearAllMocks();
  let visible = false;
  let state = { x: 0, y: 0, zoom: 1 };
  const camera: SceneModule = {
    id: "camera",
    setup: () => ({
      provides: {
        camera: {
          get state() {
            return state;
          },
          visibleChunks: () => [{ cx: 0, cy: 0 }],
          cullViews: (views: readonly SceneView[]) => views.map(() => visible),
        } as never,
      },
      destroy: () => {},
    }),
  };
  const lighting = createPhaseLighting();
  const { ticker, renderer, root, scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 0 }]), [
    camera,
    createShadows(lighting),
  ]);
  const initial = renderer.render.mock.calls.length;
  lighting.transitionTo("sunset", 0);
  ticker.frame();
  expect(renderer.render).toHaveBeenCalledTimes(initial);
  // A later scene cull has a larger margin. It must not expand the baking workload.
  root.children.forEach((view) => {
    view.culled = false;
  });
  ticker.frame();
  expect(renderer.render).toHaveBeenCalledTimes(initial);
  visible = true;
  state = { ...state, x: 1 };
  ticker.frame();
  expect(renderer.render.mock.calls.length).toBeGreaterThan(initial);
  const ready = renderer.render.mock.calls.length;
  ticker.frame();
  expect(renderer.render).toHaveBeenCalledTimes(ready);
  scene.destroy();
});

it.each(["wall", "entity"])("updates a phase when only a %s receiver is inside the cull margin", async (kind) => {
  resetHarness();
  vi.clearAllMocks();
  const wall = new Sprite({} as never);
  vi.mocked(createTerrainFaceShadows).mockReturnValueOnce({
    views: [{ view: wall, depth: 0, layer: 1 }],
    levels: [],
    clear: vi.fn(),
    begin: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  });
  const camera: SceneModule = {
    id: "camera",
    setup: () => ({
      provides: {
        camera: {
          state: { x: 0, y: 0, zoom: 1 },
          visibleChunks: () => [{ cx: 0, cy: 0 }],
          cullViews: (views: readonly SceneView[]) =>
            views.map(({ view }) => (kind === "wall" ? view === wall : "receivedShadowOf" in view)),
        } as never,
      },
      destroy: () => {},
    }),
  };
  const lighting = createPhaseLighting();
  const { ticker, scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 0 }], createTestEntities), [
    camera,
    createEntityView(),
    createShadows(lighting),
  ]);
  const target = (
    kind === "wall"
      ? vi.mocked(createTerrainFaceShadows).mock.results.at(-1)!.value
      : vi.mocked(createReceivedShadows).mock.results.at(-1)!.value
  ) as { draw: ReturnType<typeof vi.fn> };
  const initial = vi.mocked(target.draw).mock.calls.length;
  lighting.transitionTo("sunset", 0);
  ticker.frame();
  expect(vi.mocked(target.draw).mock.calls.length).toBeGreaterThan(initial);
  scene.destroy();
});

it.each(["bands", "grid"])(
  "exchanges moving and static entity shadows through %s without another ground overlay",
  async (mode) => {
    resetHarness();
    vi.clearAllMocks();
    const display = { left: 0, top: -20, width: 5, height: 20 };
    const own: Silhouette = {
      texture: {} as never,
      body: {} as never,
      sources: [],
      bodyDisplay: display,
      display,
      worldFoot: { x: 0, y: 0 },
      screenFoot: { x: 0, y: 0 },
      depth: 0,
    };
    vi.mocked(createSilhouettes).mockReturnValueOnce([own]);
    const world = worldFrom(
      [
        { x: 0, y: 0, elevation: 0 },
        { x: 0, y: 1, elevation: 0 },
      ],
      () => [
        new Entity(
          0,
          0,
          { id: "tree", height: 1, spawnChance: 1, textureSource: "/assets/tree/block.svg", surface: "grass" },
          2,
        ),
      ],
    );
    const foot = {
      ground: { x: DAY_SHADOW_PROJECTION.dirX, y: DAY_SHADOW_PROJECTION.dirY, elevation: 0 },
      screen: { x: 0, y: 0 },
    };
    const view = new Sprite({} as never);
    Object.assign(view, { x: -5, y: -20, width: 10, height: 20 });
    let bands = new Float32Array(16);
    const mover: SceneModule = {
      id: "mover",
      setup: () => ({
        provides: {
          movingCasters: [
            {
              view,
              foot: () => foot,
              ...(mode === "grid"
                ? {
                    receiveShadowGrid: (values: ArrayLike<number>) => {
                      bands = Float32Array.from(values);
                    },
                  }
                : {
                    receiveTerrainShadowBands: (values: ArrayLike<number>) => {
                      bands = Float32Array.from(values);
                    },
                  }),
            },
            { view: {} as never, foot: () => foot },
          ],
        },
        destroy: () => {},
      }),
    };
    const { ticker, renderer, scene } = await mountScene(world, [createEntityView(), mover, createShadows()]);
    expect(bands.some((alpha) => alpha > 0.3)).toBe(true);
    expect(bands.some((alpha) => alpha === 0)).toBe(true);
    if (mode === "grid") {
      expect(bands).toHaveLength(128);
      expect(bands[32]).toBe(0);
      expect(bands[39]).toBeGreaterThan(0.3);
    }
    expect(renderer.extract.pixels).toHaveBeenCalledTimes(1);
    const received = vi.mocked(createReceivedShadows).mock.results[0].value as ReturnType<typeof createReceivedShadows>;
    const additional = vi.mocked(received.draw).mock.lastCall![2]!;
    expect(additional(own)).toHaveLength(1);
    expect(additional(own)[0].lift).toBe(-2);
    ticker.frame();
    expect(renderer.extract.pixels).toHaveBeenCalledTimes(1);
    foot.ground = { x: 100, y: 100, elevation: 0 };
    ticker.frame();
    expect(additional(own)).toEqual([]);
    expect(bands.every((alpha) => alpha === 0)).toBe(true);
    scene.destroy();
  },
);

it("invalidates only receiver chunks reached by the old or new moving shadow", async () => {
  resetHarness();
  vi.clearAllMocks();
  const world = worldFrom([
    { x: 0, y: 0, elevation: 0 },
    { x: 64, y: 0, elevation: 0 },
  ]);
  const foot = { ground: { x: 0, y: 0, elevation: 0 }, screen: { x: 0, y: 0 } };
  const view = new Sprite({} as never);
  view.width = 1;
  view.height = 1;
  const mover: SceneModule = {
    id: "mover",
    setup: () => ({ provides: { movingCasters: [{ view, foot: () => foot }] }, destroy: () => {} }),
  };
  const { ticker, renderer, scene } = await mountScene(world, [mover, createShadows()]);
  const frame = vi.mocked(createGroundShadowView).mock.calls.at(-1)![0];
  const farMap = vi
    .mocked(RenderTexture.create)
    .mock.results.map(({ value }) => value as ReturnType<typeof RenderTexture.create>)
    .find((texture) => texture.source === frame.source)!;
  const writes = () => renderer.drawn.filter(({ target }) => target === farMap).length;
  const initial = writes();
  expect(initial).toBeGreaterThan(0);
  foot.ground.x = 0.1;
  ticker.frame();
  expect(writes()).toBe(initial);
  scene.destroy();
});

it("lets moving receivers receive another mover while excluding their own silhouette", async () => {
  resetHarness();
  vi.clearAllMocks();
  const world = worldFrom([
    { x: 0, y: 0, elevation: 0 },
    { x: 0, y: 1, elevation: 0 },
  ]);
  const view = new Sprite({} as never);
  Object.assign(view, { x: -5, y: -20, width: 10, height: 20 });
  const caster = new Sprite({} as never);
  const receiverFoot = {
    ground: { x: DAY_SHADOW_PROJECTION.dirX, y: DAY_SHADOW_PROJECTION.dirY, elevation: 0 },
    screen: { x: 0, y: 0 },
  };
  const casterFoot = { ground: { x: 0, y: 0, elevation: 2 }, screen: { x: 0, y: 0 } };
  let samples = new Float32Array(16);
  const movers: SceneModule = {
    id: "movers",
    setup: () => ({
      provides: {
        movingCasters: [
          {
            view,
            foot: () => receiverFoot,
            receiveTerrainShadowBands: (values: ArrayLike<number>) => {
              samples = Float32Array.from(values);
            },
          },
          { view: caster, foot: () => casterFoot },
        ],
      },
      destroy: () => {},
    }),
  };
  const { ticker, scene } = await mountScene(world, [movers, createShadows()]);
  expect(samples.some((alpha) => alpha > 0.3)).toBe(true);
  casterFoot.ground = { x: 100, y: 100, elevation: 2 };
  ticker.frame();
  expect(samples.every((alpha) => alpha === 0)).toBe(true);
  scene.destroy();
});

it("refreshes newly visible receivers after resize and restores filter detail when zooming in", async () => {
  resetHarness();
  vi.clearAllMocks();
  let state = { x: 0, y: 0, zoom: 1 };
  let visible = false;
  const cull = vi.fn((views: readonly SceneView[]) => views.map(() => visible));
  const camera: SceneModule = {
    id: "camera",
    setup: () => ({
      provides: {
        camera: {
          get state() {
            return state;
          },
          visibleChunks: () => [{ cx: 0, cy: 0 }],
          cullViews: cull,
        } as never,
      },
      destroy: () => {},
    }),
  };
  const { renderer, ticker, scene } = await mountScene(defaultWorld(createTestEntities), [
    camera,
    createEntityView(),
    createShadows(),
  ]);
  visible = true;
  renderer.screen.width += 1;
  ticker.frame();
  const drawn = renderer.render.mock.calls.length;
  const map = vi.mocked(RenderTexture.create).mock.results[0].value as RenderTexture;
  const lowDensity = map.source.resolution;
  expect(lowDensity).toBeLessThan(1);
  const blur = vi.mocked(createCasterSprites).mock.calls[0][0][0] as BlurFilter;
  expect(blur.enabled).toBe(false);
  const received = (vi.mocked(createReceivedShadows).mock.results[0].value as ReturnType<typeof createReceivedShadows>)
    .atlas;
  expect(received.source.resolution).toBe(lowDensity);
  const culled = cull.mock.calls.length;
  state = { ...state, x: 1e-8 };
  ticker.frame();
  expect(cull).toHaveBeenCalledTimes(culled);
  expect(renderer.render).toHaveBeenCalledTimes(drawn);
  renderer.screen.height += 1;
  ticker.frame();
  expect(cull.mock.calls.length).toBeGreaterThan(culled);
  expect(renderer.render).toHaveBeenCalledTimes(drawn);
  state = { ...state, zoom: 4 };
  ticker.frame();
  expect(renderer.render.mock.calls.length).toBeGreaterThan(drawn);
  expect(map.source.resolution).toBe(1);
  expect(blur.enabled).toBe(true);
  expect(received.source.resolution).toBe(1);
  const highDetail = renderer.render.mock.calls.length;
  state = { ...state, zoom: 1 };
  ticker.frame();
  expect(renderer.render).toHaveBeenCalledTimes(highDetail);
  scene.destroy();
});

it("reuses receiver heights during phase animation instead of querying every terrain column again", async () => {
  resetHarness();
  vi.clearAllMocks();
  const world = worldFrom([
    { x: 0, y: 0, elevation: 0 },
    { x: 1, y: 0, elevation: 1 },
    { x: 2, y: 0, elevation: 2 },
  ]);
  const lighting = createPhaseLighting();
  const { ticker, scene } = await mountScene(world, [createShadows(lighting)]);
  const get = vi.spyOn(world.columnIndex, "get");
  lighting.transitionTo("sunset", 1000);
  lighting.advance(500);
  ticker.frame();
  expect(get).not.toHaveBeenCalled();
  scene.destroy();
});

it("bakes strength into the common mask without changing thousands of scene sprite alphas", async () => {
  resetHarness();
  vi.clearAllMocks();
  const lighting = createPhaseLighting("day", {
    ...LIGHTING_PHASES,
    sunset: { ...LIGHTING_PHASES.day, shadowStrength: 0.5 },
  });
  const { renderer, root, ticker, scene } = await mountScene(worldFrom([{ x: 0, y: 0, elevation: 0 }]), [
    createShadows(lighting),
  ]);
  const drawn = renderer.render.mock.calls.length;
  lighting.transitionTo("sunset", 0);
  ticker.frame();
  expect(renderer.render.mock.calls.length).toBeGreaterThan(drawn);
  expect(root.children.every(({ alpha }) => alpha === 1)).toBe(true);
  const container = renderer.render.mock.lastCall![0].container as {
    children: [{ alpha: number }, { filters: { alpha: number }[] }];
  };
  expect(container.children[0].alpha).toBe(0.5);
  expect(container.children[1].filters[1].alpha).toBe(DAY_SHADOW_PROJECTION.alpha * 0.5);
  const updated = renderer.render.mock.calls.length;
  ticker.frame();
  expect(renderer.render).toHaveBeenCalledTimes(updated);
  scene.destroy();
});
