import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
vi.mock("./silhouette", async () => (await import("../flow-check/scene-harness")).mockSilhouette());
vi.mock("./terrain-faces", async () => (await import("../flow-check/scene-harness")).mockTerrainFaces());
vi.mock("./received-shadow", async () => (await import("../flow-check/scene-harness")).mockReceivedShadow());

import { RenderTexture, Sprite } from "pixi.js";
import { Entity } from "../entities";
import { createEntityView } from "../entity-view";
import type { SceneModule } from "../scene";
import { TILE_METRICS } from "../constants";
import { CHUNK_SIZE, chunkKey } from "../grid";
import {
  AO_PIXELS_PER_TILE,
  getCastShadowOffset,
  DAY_SHADOW_PROJECTION,
  SHADOW_MAP_PIXELS_PER_TILE,
  SHADOW_BLUR,
  createPhaseLighting,
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
import { MOVING_SHADOW_PIXELS_PER_TILE, MOVING_SHADOW_RADIUS } from "./moving-shadow";
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

    // The chunk's map and the scratch its levels are drawn in: its chunk and a margin around it,
    // so a shadow's blur does not stop at the chunk's edge.
    expect(RenderTexture.create).toHaveBeenCalledTimes(2);
    const side = (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * SHADOW_MAP_PIXELS_PER_TILE;
    expect(RenderTexture.create).toHaveBeenCalledWith({ width: side, height: side });
    const [map, scratch] = vi
      .mocked(RenderTexture.create)
      .mock.results.map(({ value }) => value as { source: unknown });
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

    // Each level is drawn into the scratch with the other levels' columns erased, then copied
    // into the map over its own columns, erased first.
    type Mask = {
      blendMode: string;
      scale: { value: number };
      texture: { source: { options: { resource: Uint8ClampedArray; width: number } } };
    };
    const draws = renderer.drawn.filter(({ children }) => children.length >= 2);
    expect(draws).toHaveLength(6);
    const masked = (mask: Mask) => {
      const { resource, width } = mask.texture.source.options;
      const columns: string[] = [];
      for (let texel = 0; texel < resource.length / 4; texel += 1) {
        if (resource[texel * 4 + 3] === 255) columns.push(`${(texel % width) - 1},${Math.floor(texel / width) - 1}`);
      }
      return columns;
    };
    const levels = [2, 1, -1];
    const columnsOfLevel = (level: number) =>
      columnsOf(world)
        .filter(({ elevation }) => elevation === level)
        .map(({ x, y }) => `${x},${y}`);
    levels.forEach((level, index) => {
      const [drawn, copied] = [draws[2 * index], draws[2 * index + 1]];
      expect(drawn).toEqual(expect.objectContaining({ target: scratch, clear: true }));
      expect(copied).toEqual(expect.objectContaining({ target: map, clear: false }));
      const others = drawn.children.at(-1) as unknown as Mask;
      const [own, copy] = copied.children as unknown as [Mask, { texture: unknown }];
      expect(others.blendMode).toBe("erase");
      expect(own.blendMode).toBe("erase");
      expect(own.scale.value).toBe(SHADOW_MAP_PIXELS_PER_TILE);
      expect(masked(own)).toEqual(columnsOfLevel(level));
      expect(masked(others)).toHaveLength((CHUNK_SIZE + 2) ** 2 - columnsOfLevel(level).length);
      expect(copy.texture).toBe(scratch);
    });
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
  type LevelDraw = { readonly children: ReadonlyArray<Record<string, unknown>> };
  /**
   * Each level of a map drawn into the scratch texture, in order (`clear`), as it was drawn; the
   * copy of its columns into the chunk's map that follows each one is left out.
   */
  const levelDraws = (renderer: Renderer): LevelDraw[] =>
    renderer.drawn.filter(({ clear, children }) => clear && children.length === 3);
  /** What level draw number `draw` was drawn from: the occlusion, the casters and the other levels' eraser. */
  const layerOf = (renderer: Renderer, draw: number) => levelDraws(renderer)[draw];
  /** The casters of a level draw, as it drew them. */
  const castersIn = (draw: LevelDraw) => draw.children[1] as unknown as Casters;
  /** The module's caster sprites (made once, whatever the chunks shown). */
  const casterSprites = () =>
    vi.mocked(createCasterSprites).mock.results.map(
      ({ value }) =>
        value as {
          container: Casters & { children: unknown[] };
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

    expect(levelDraws(renderer)).toHaveLength(levels.size);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ clear: true, clearColor: [0, 0, 0, 0] }));
    // Its silhouettes are made once; each map it reaches lays them on the module's caster sprites,
    // the same for every map. Nothing is cast on other entities: it is alone.
    expect(createSilhouettes).toHaveBeenCalledTimes(1);
    expect(casterSprites()).toHaveLength(1);
    const [casters] = casterSprites();
    expect(casters.sprite).toHaveBeenCalledTimes(lowerLevels.length);
    expect(casters.sprite.mock.calls.every(([index]) => index === 0)).toBe(true);
    expect(casters.container.children).toHaveLength(1);
    expect(
      vi
        .mocked(createReceivedShadows)
        .mock.calls.every(([receivers]) => receivers.every(({ casters }) => casters.length === 0)),
    ).toBe(true);
    expect(placeSilhouette).toHaveBeenCalledTimes(lowerLevels.length);
    lowerLevels.forEach((level) => {
      expect(placeSilhouette).toHaveBeenCalledWith(
        expect.anything(),
        (vi.mocked(createSilhouettes).mock.results[0].value as Silhouette[])[0],
        expect.anything(),
        { x: -1.5, y: -1.5 },
        SHADOW_MAP_PIXELS_PER_TILE,
      );
      expect(grounds).toContainEqual(
        getSilhouetteMatrix(projection as never, { x: entity.x, y: entity.y }, entity.elevation - level, TILE_METRICS),
      );
    });
    vi.mocked(placeSilhouette).mockReset();
    // The occlusion, the casters (shown on the levels they reach) and the other levels' eraser.
    const draws = levelDraws(renderer);
    expect(draws.every(({ children }) => children.length === 3)).toBe(true);
    expect(draws.filter((draw) => castersIn(draw).shown === 1)).toHaveLength(lowerLevels.length);
    expect(draws.filter((draw) => castersIn(draw).shown === 0)).toHaveLength(levels.size - lowerLevels.length);
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

    expect(levelDraws(renderer)).toHaveLength(2);
    const { options } = occlusionOf(0).texture.source;
    expect(options.width).toBe((CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE);
    expect(options.height).toBe((CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) * AO_PIXELS_PER_TILE);
    expect(occlusionOf(0).scale.value).toBe(SHADOW_MAP_PIXELS_PER_TILE / AO_PIXELS_PER_TILE);
    // One occlusion for both levels: the low ground at the foot of (0, 0) is darkened; its top is not.
    expect(occlusionOf(1).texture).toBe(occlusionOf(0).texture);
    expect(darkened(1, 0)).toBe(true);
    expect(darkened(0, 0)).toBe(false);

    world.parts.get(CLOCK_PART).tick += 500;
    ticker.frame();
    // No casters: the occlusion never changes, so the maps are not redrawn by day.
    expect(levelDraws(renderer)).toHaveLength(2);
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
    expect(blur.options).toEqual({ strength: SHADOW_BLUR, quality: 2 });
    expect(opacity.alpha).toBe(alpha);
    destroyScene();
  });

  it("gives the silhouettes of each map its rectangle as filter area, so Pixi never measures them", async () => {
    const { renderer, destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 9));

    const maps = vi
      .mocked(RenderTexture.create)
      .mock.results.map(({ value }) => value as { width: number; height: number });
    expect(levelDraws(renderer).length).toBeGreaterThan(0);
    levelDraws(renderer).forEach((draw) => {
      expect(castersIn(draw).filterArea).toEqual({ x: 0, y: 0, width: maps[0].width, height: maps[0].height });
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
    expect(shadows.every(({ alpha }) => alpha === lighting.current.shadowStrength)).toBe(true);
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

      expect(received().draw).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
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
      expect(views.every((view) => view.alpha === lighting.current.shadowStrength)).toBe(true);
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
        provides: { camera: { cullViews: vi.fn(), visibleChunks: () => visible.chunks } as never },
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
      expect(RenderTexture.create).toHaveBeenCalledTimes(2);
      expect(placeSilhouette).toHaveBeenCalledTimes(1);
      scene.destroy();
    });

    it("keeps the caster sprites of its largest draw only, whatever the chunks shown and hidden", async () => {
      const visible = { chunks: [0, 1].map((cx) => ({ cx, cy: 0 })) };
      const { ticker, renderer, scene } = await sceneOn(edge(), visible);

      visible.chunks = [{ cx: 3, cy: 0 }];
      ticker.frame();
      expect(scene.shownChunks()).not.toContain(chunkKey(0, 0));
      visible.chunks = [0, 1].map((cx) => ({ cx, cy: 0 }));
      await frameUntil(ticker, () => expect(scene.shownChunks()).toHaveLength(2));
      for (let frame = 0; frame < 6; frame += 1) ticker.frame();

      // Two trees: every map they reach is drawn with the same two sprites.
      const largest = Math.max(...levelDraws(renderer).map((draw) => castersIn(draw).shown));
      expect(largest).toBe(2);
      expect(casterSprites()).toHaveLength(1);
      expect(casterSprites()[0].container.children).toHaveLength(largest);
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
    const levels = new Set(columnsOf(world).map(({ elevation, type }) => elevation - (type === "sand" ? 0.5 : 0)));

    expect(root.children).toHaveLength(columnsOf(world).length);
    expect(levelDraws(renderer)).toHaveLength(levels.size);
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

  it("casts the shadow of what moves in a map of its own that follows it, with the sun's opacity", async () => {
    const world = at(defaultWorld(), 12);
    const [column] = columnsOf(world);
    const foot = { ground: { x: column.x, y: column.y, elevation: column.elevation }, screen: { x: 0, y: 0 } };
    const view = new Sprite({} as never);
    const mover: SceneModule = {
      id: "mover",
      setup: () => ({ provides: { movingCasters: [{ view, foot: () => foot }] }, destroy: () => {} }),
    };
    const { ticker, renderer, root, scene } = await mountScene(world, [createTerrainView(), mover, createShadows()]);
    const side = (2 * MOVING_SHADOW_RADIUS + 1) * MOVING_SHADOW_PIXELS_PER_TILE;
    const movingMap = vi
      .mocked(RenderTexture.create)
      .mock.results.map(({ value }) => value as { width: number; destroy: ReturnType<typeof vi.fn> })
      .find(({ width }) => width === side);
    const movingDraws = () => renderer.drawn.filter(({ target }) => target === movingMap);
    const [filters] = casterSprites().map(({ container }) => container.filters as Array<{ alpha?: number }>);

    // Its views stand on the columns around it, never culled: they follow it, in the camera's view.
    const followers = (root.children as Array<View & { cullable: boolean }>).filter(
      ({ texture }) => texture?.source === (movingMap as unknown as { source: unknown }).source,
    );
    expect(followers).toHaveLength((2 * MOVING_SHADOW_RADIUS + 1) ** 2);
    expect(followers.every(({ cullable }) => !cullable)).toBe(true);
    const planes = movingDraws().length;
    expect(planes).toBeGreaterThan(0);
    expect(createMovingSilhouette).toHaveBeenCalledWith(view, foot.screen, foot.ground);

    foot.ground = { ...foot.ground, x: column.x + 0.1 };
    filters[1].alpha = 1;
    ticker.frame();
    expect(movingDraws()).toHaveLength(planes * 2);
    expect(filters[1].alpha).toBe(DAY_SHADOW_PROJECTION.alpha);

    scene.destroy();
    expect(movingMap?.destroy).toHaveBeenCalledWith(true);
  });

  it("destroys the shadow maps, their masks and occlusion, the scratch, the filters and what draws them with the scene", async () => {
    const { renderer, destroyScene } = await sceneOf(at(defaultWorld(createTestEntities), 12));
    type Destroyable = { destroy: ReturnType<typeof vi.fn> };
    const maps = vi.mocked(RenderTexture.create).mock.results.map(({ value }) => value as Destroyable);
    // Each level's occlusion (first) and other levels' mask (last), and its own mask (first of its copy).
    const textures = renderer.drawn
      .filter(({ children }) => children.length >= 2)
      .flatMap(({ children }) => [
        children[0].texture as Destroyable,
        children[children.length - 1].texture as Destroyable,
      ]);
    const roots = new Set(
      renderer.drawn.filter(({ children }) => children.length >= 2).map(({ container }) => container as Destroyable),
    );
    const [rig] = vi.mocked(createReceivedShadowRig).mock.results;
    const filters = casterSprites()[0].container.filters as Destroyable[];

    destroyScene();

    // The blur and the sun's opacity, shared by the maps and the received shadows.
    expect(filters).toHaveLength(2);
    filters.forEach((filter) => expect(filter.destroy).toHaveBeenCalledTimes(1));

    expect(maps).toHaveLength(2);
    maps.forEach((map) => expect(map.destroy).toHaveBeenCalledWith(true));
    // The level and its copy, with the caster sprites.
    expect(roots.size).toBe(2);
    roots.forEach((root) => expect(root.destroy).toHaveBeenCalledWith({ children: true }));
    expect((rig.value as Destroyable).destroy).toHaveBeenCalled();
    textures
      .filter((texture) => !maps.includes(texture))
      .forEach((texture) => expect(texture.destroy).toHaveBeenCalledWith(true));
  });
});

describe("moving terrain shadow receivers", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });
  it("fades entering and leaving a baked terrain shadow and grades moving and received views without rebaking", async () => {
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
  const result = vi.mocked(createReceivedShadows).mock.results[0].value as ReturnType<typeof createReceivedShadows> & {
    draw: ReturnType<typeof vi.fn>;
  };
  const own = vi.mocked(createReceivedShadows).mock.calls[0][0][0].own;
  const sample = result.draw.mock.calls[0][1] as (own: Silhouette, x: number, y: number) => number;
  expect(sample(own, own.screenFoot.x, own.screenFoot.y)).toBe(1);
  expect(sample(own, own.screenFoot.x, own.screenFoot.y - 6 * TILE_METRICS.boxHeight)).toBe(0);
  lighting.transitionTo("sunset", 0);
  ticker.frame();
  expect(wallView.alpha).toBe(lighting.current.shadowStrength);
  expect(walls.draw).toHaveBeenCalledWith(-0.5, lighting.current.shadow);
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

it("publishes a phase chunk only after all its planes finish, and cancels when neighbours change", async () => {
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
  const visible = { chunks: [{ cx: 0, cy: 0 }] };
  const camera: SceneModule = {
    id: "camera",
    setup: () => ({
      provides: { camera: { visibleChunks: () => visible.chunks, cullViews: vi.fn() } as never },
      destroy: () => {},
    }),
  };
  const world = worldFrom([
    { x: 0, y: 0, elevation: 0 },
    { x: 32, y: 0, elevation: 0 },
  ]);
  const lighting = createPhaseLighting();
  const { ticker, renderer, scene } = await mountScene(world, [camera, createShadows(lighting)]);
  const front = vi.mocked(RenderTexture.create).mock.results[0].value;
  const frontDraws = () => renderer.render.mock.calls.filter(([call]) => call.target === front).length;
  const initial = frontDraws();
  lighting.transitionTo("sunset", 0);
  ticker.frame();
  expect(walls.begin).toHaveBeenCalled();
  expect(frontDraws()).toBe(initial);
  visible.chunks = [
    { cx: 0, cy: 0 },
    { cx: 1, cy: 0 },
  ];
  await frameUntil(ticker, () => expect(walls.cancel).toHaveBeenCalled());
  await frameUntil(ticker, () => expect(walls.commit).toHaveBeenCalled());
  expect(frontDraws()).toBeGreaterThan(initial);
  lighting.transitionTo("night", 0);
  ticker.frame();
  const cancelled = walls.cancel.mock.calls.length;
  visible.chunks = [];
  await frameUntil(ticker, () => expect(scene.shownChunks()).toEqual([]));
  expect(walls.cancel.mock.calls.length).toBeGreaterThan(cancelled);
  scene.destroy();
});
