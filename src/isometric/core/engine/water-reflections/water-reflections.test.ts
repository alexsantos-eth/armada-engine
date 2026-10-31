import { beforeEach, describe, expect, it, vi } from "vitest";

// Meshes that keep their texture, to tell the materials apart, and sprites that keep a copy of the
// matrix they were placed with (the module writes every one into the same `Matrix`).
vi.mock("pixi.js", async () => {
  const pixi = (await import("../flow-check/scene-harness")).mockPixi();
  class Sprite extends pixi.Sprite {
    public matrix: unknown;
    public setFromMatrix = vi.fn((matrix: object) => {
      this.matrix = { ...matrix };
    });
  }
  class MeshSimple extends pixi.MeshSimple {
    public texture: unknown;
    constructor(options: ConstructorParameters<typeof pixi.MeshSimple>[0] & { texture: unknown }) {
      super(options);
      this.texture = options.texture;
    }
  }
  class Container extends pixi.Container {
    public matrix: unknown;
    public setFromMatrix = vi.fn((matrix: object) => {
      this.matrix = { ...matrix };
    });
  }
  return { ...pixi, Container, MeshSimple, Sprite };
});

import { Assets, Container, RenderTexture, Sprite } from "pixi.js";
import { Entity } from "../entities";
import {
  frameUntil,
  loadTexture,
  mountScene,
  type RenderedDraw,
  resetHarness,
  worldFrom,
} from "../flow-check/scene-harness";
import { chunkKey } from "../grid";
import { type EntityView, type SceneModule, type SceneMovingCaster } from "../scene";
import type { ChunkKey, TerrainPoint } from "../../types";
import { composeInto, getReflectionMatrix, getWaterPlaneMatrix, REFLECTION_PIXELS_PER_TILE } from "./reflection";
import { TILE_METRICS } from "../constants";
import {
  createWaterReflections,
  REFLECTION_ALPHA,
  REFLECTION_BAKES_PER_FRAME,
  REFLECTION_TINT,
  SKY_REFLECTION,
} from "./water-reflections";

/**
 * A 4 × 6 world: water one level down on its first three rows (two levels down on `(0, 0)`) and a
 * grass bank one block up behind it.
 */
const POINTS: TerrainPoint[] = Array.from({ length: 24 }, (_, index) => {
  const x = index % 4;
  const y = Math.floor(index / 4);
  return { x, y, elevation: y >= 3 ? 1 : x === 0 && y === 0 ? -2 : -1 };
});
const KEY = chunkKey(0, 0);
const blank = () => ({ a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 });

type MockTexture = {
  source: unknown;
  frame: { x: number; y: number; width: number; height: number };
  destroy: ReturnType<typeof vi.fn>;
};
type MockSprite = Sprite & { texture: MockTexture; setFromMatrix: ReturnType<typeof vi.fn> };
type MockRenderTexture = { width: number; height: number; source: object; destroy: ReturnType<typeof vi.fn> };

/** An entity standing at `(x, y)` one block up, drawn by `views`. */
const entityView = (
  x: number,
  y: number,
  views: { view: object; stacked?: boolean }[],
  length = 1,
  lengthAxis?: "x" | "y",
  reflectionSource?: string,
) =>
  ({
    entity: {
      x,
      y,
      screenX: (x - y) * 20,
      screenY: -(x + y) * 10 - 40 / 3,
      baseScreenY: -(x + y) * 10,
      box: new Entity(
        x,
        y,
        {
          id: "tree",
          textureSource: "/t.svg",
          height: 2,
          length,
          ...(lengthAxis ? { lengthAxis } : {}),
          ...(reflectionSource ? { reflectionSource } : {}),
          spawnChance: 1,
          surface: "grass",
        },
        1,
      ),
    },
    views: views.map(({ view, stacked }) => ({ view, depth: 0, ...(stacked ? { stacked } : {}) })),
  }) as unknown as EntityView;

const spriteOf = (source: string) => Object.assign(new Sprite(), { texture: { source }, tint: 0x808080 });

/** A module that provides `entityViews` and `movingCasters` (when given). */
const provider = (
  entityViews: Map<ChunkKey, readonly EntityView[]> | undefined,
  movingCasters?: SceneMovingCaster[],
): SceneModule => ({
  id: "provider",
  setup: () => ({
    provides: { ...(entityViews ? { entityViews } : {}), ...(movingCasters ? { movingCasters } : {}) },
    destroy: () => {},
  }),
});

/** The player as `player-view` provides it, standing at `ground`. */
const player = (ground: { x: number; y: number; elevation: number }, view: object = spriteOf("player")) => {
  const caster = {
    ground,
    view: view as SceneMovingCaster["view"],
    foot: () => ({ ground: caster.ground, screen: { x: 0, y: 0 } }),
  };
  return caster;
};

const mount = async (modules: SceneModule[], points = POINTS) => {
  const mounted = await mountScene(worldFrom(points), [...modules, createWaterReflections()]);
  // The views that show a reflection map: their texture is a frame of a render texture.
  const reflections = () =>
    mounted.root.children.filter((view) => (view.texture?.source as { renderTarget?: boolean }).renderTarget);
  return { ...mounted, reflections };
};

/** The render textures made, in order. */
const maps = () =>
  vi.mocked(RenderTexture.create).mock.results.map(({ value }) => value as unknown as MockRenderTexture);

describe("createWaterReflections", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
    vi.mocked(Assets.load).mockImplementation(loadTexture as never);
  });

  it("lays a map of each water level on its columns' tops, drawn once with the sky", async () => {
    const { scene, renderer, reflections } = await mount([]);

    // Two levels: `(0, 0)` alone at −2, the rest of the first three rows at −1.
    expect(maps().map(({ width, height }) => [width, height])).toEqual([
      [REFLECTION_PIXELS_PER_TILE, REFLECTION_PIXELS_PER_TILE],
      [4 * REFLECTION_PIXELS_PER_TILE, 3 * REFLECTION_PIXELS_PER_TILE],
    ]);
    const views = reflections() as unknown as MockSprite[];
    expect(views).toHaveLength(12);
    expect(views.every((view) => view.setFromMatrix.mock.calls.length === 1)).toBe(true);
    // Column (2, 1) shows its own square of the −1 map.
    expect(views.map(({ texture }) => texture.source)).toContain(maps()[1].source);
    expect(
      views.find(
        ({ texture }) =>
          texture.frame.x === 2 * REFLECTION_PIXELS_PER_TILE && texture.frame.y === REFLECTION_PIXELS_PER_TILE,
      ),
    ).toBeDefined();
    expect(renderer.drawn.map(({ target }) => target)).toEqual(maps());
    const clear = renderer.render.mock.calls[0][0] as unknown as { clearColor: number[] };
    expect(clear.clearColor[3]).toBe(SKY_REFLECTION.alpha);
    expect(clear.clearColor[2]).toBeCloseTo(SKY_REFLECTION.alpha);
    const content = renderer.drawn[1].container as Container;
    expect(content.alpha).toBe(REFLECTION_ALPHA);
    expect(content.tint).toBe(REFLECTION_TINT);
    scene.destroy();
  });

  it("mirrors the bank's camera-facing sides, a mesh per material", async () => {
    const { scene, renderer } = await mount([]);
    // The bank's grass tops of row 3 over the ground under them, in both maps.
    [0, 1].forEach((map) =>
      expect(
        renderer.drawn[map].children
          .filter((child) => "geometry" in child)
          .map(({ texture }) => (texture as { source: string }).source)
          .sort(),
      ).toEqual(["/assets/grass/block.svg", "/assets/ground/block.svg"]),
    );
    scene.destroy();
  });

  it("leaves out the sides of a material whose texture did not load", async () => {
    vi.mocked(Assets.load).mockImplementation(((asset: { src: string }) =>
      Promise.resolve(asset.src.includes("grass") ? undefined : { source: asset.src })) as never);
    const { scene, renderer } = await mount([]);
    const meshes = renderer.drawn[1].children.filter((child) => "geometry" in child);
    expect(meshes.map(({ texture }) => (texture as { source: string }).source)).toEqual(["/assets/ground/block.svg"]);
    scene.destroy();
  });

  it("draws nothing for a chunk without water", async () => {
    const { scene, renderer } = await mount([], [{ x: 0, y: 0, elevation: 1 }]);
    expect(RenderTexture.create).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    scene.destroy();
  });

  it("mirrors the sprites of the entities near the water, the furthest first, a long one's as one", async () => {
    const front = spriteOf("front");
    const back = spriteOf("back");
    const [first, second, top] = [spriteOf("first"), spriteOf("second"), spriteOf("second-top")];
    const far = spriteOf("far");
    const entityViews = new Map<ChunkKey, readonly EntityView[]>([
      [
        KEY,
        [
          entityView(1, 3, [{ view: front }, { view: new Container() }]),
          entityView(2, 5, [{ view: back }]),
          entityView(2, 4, [{ view: first }, { view: second }, { view: top, stacked: true }], 2),
        ],
      ],
      [chunkKey(5, 5), [entityView(170, 170, [{ view: far }])]],
    ]);
    const { scene, renderer } = await mount([provider(entityViews)]);

    const mirrored = renderer.drawn[1].children.filter((child) => !("geometry" in child));
    expect(mirrored.map(({ texture }) => (texture as { source: string }).source)).toEqual([
      "back",
      "first",
      "second",
      "second-top",
      "front",
    ]);
    expect(mirrored.every(({ tintWrites }) => (tintWrites as number[]).at(-1) === 0x808080)).toBe(true);
    // The two-tile entity's strips share one mirror, turned as one about its anchor: no steps, and its row keeps its diagonal.
    const area = { level: -1, rect: { minX: 0, minY: 0, maxX: 3, maxY: 2 }, columns: [] };
    const anchor = { x: 2, y: 4, elevation: 1, screenX: (2 - 4) * 20, screenY: -60 - 40 / 3 };
    // Turned half a circle: flipped down, and left to right about the middle of its sprite.
    const turn = { a: -1, b: 0, c: 0, d: 1, tx: 2 * (-40 + 10), ty: 0 };
    const expected = { ...composeInto(getReflectionMatrix(anchor, area, TILE_METRICS, blank()), turn, blank()) };
    expect(mirrored.slice(1, 4).map(({ matrix }) => matrix)).toEqual([expected, expected, expected]);
    scene.destroy();
  });

  describe("reflection SVGs", () => {
    const ART = "/assets/pier/block_reflection.svg";
    const pier = () => entityView(2, 4, [{ view: spriteOf("first") }, { view: spriteOf("second") }], 2, "y", ART);
    /** The containers that lay an entity's reflection SVG on the water in the last draw of `map`. */
    const laidIn = (drawn: RenderedDraw | undefined) =>
      (drawn?.children ?? []).filter(
        (child) => (child.children as Array<{ texture?: { source?: unknown } }> | undefined)?.length,
      );

    it("draws an entity's reflection SVG laid on the water as it is, once loaded, in place of its turned sprite", async () => {
      const { scene, renderer, ticker } = await mount([provider(new Map([[KEY, [pier()]]]))]);
      // Not loaded yet: the sprite turned half a circle meanwhile.
      expect(laidIn(renderer.drawn[1])).toEqual([]);
      expect(renderer.drawn[1].children.filter((child) => !("geometry" in child))).toHaveLength(2);

      await frameUntil(ticker, () => expect(laidIn(renderer.drawn.at(-1))).toHaveLength(1));

      const [laid] = laidIn(renderer.drawn.at(-1));
      const area = { level: -1, rect: { minX: 0, minY: 0, maxX: 3, maxY: 2 }, columns: [] };
      expect(laid.matrix).toEqual({ ...getWaterPlaneMatrix(area, TILE_METRICS, blank()) });
      // Placed as the sprite would be: cut in strips along its footprint, from the reflection SVG.
      const strips = laid.children as Array<{ texture: { source: string } }>;
      expect(strips.length).toBeGreaterThan(1);
      expect(strips.every(({ texture }) => texture.source === ART)).toBe(true);
      expect(
        vi.mocked(Assets.load).mock.calls.filter(([asset]) => (asset as unknown as { src: string }).src === ART),
      ).toHaveLength(1);
      scene.destroy();
    });

    it("keeps the turned sprite when the SVG cannot be loaded", async () => {
      vi.mocked(Assets.load).mockImplementation(((asset: { src: string }) =>
        asset.src === ART ? Promise.resolve(undefined) : loadTexture(asset)) as never);
      const { scene, renderer, ticker } = await mount([provider(new Map([[KEY, [pier()]]]))]);
      for (let frame = 0; frame < 5; frame += 1) {
        ticker.frame();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(laidIn(renderer.drawn.at(-1))).toEqual([]);
      expect(renderer.drawn.at(-1)?.children.filter((child) => !("geometry" in child))).toHaveLength(2);
      scene.destroy();
    });

    it("draws nothing again for a chunk hidden before its SVG loaded", async () => {
      let release = (_texture: unknown) => {};
      vi.mocked(Assets.load).mockImplementation(((asset: { src: string }) =>
        asset.src === ART
          ? new Promise((resolve) => {
              release = resolve;
            })
          : loadTexture(asset)) as never);
      const { scene, renderer } = await mount([provider(new Map([[KEY, [pier()]]]))]);
      scene.destroy();
      const drawn = renderer.drawn.length;
      release({ source: ART, frame: { x: 0, y: 0, width: 16, height: 16 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(renderer.drawn).toHaveLength(drawn);
    });
  });

  it("turns a long entity along y as one, about its anchor and its middle", async () => {
    const view = entityView(2, 4, [{ view: spriteOf("first") }, { view: spriteOf("second") }], 2, "y");
    const { scene, renderer } = await mount([provider(new Map([[KEY, [view]]]))]);
    const area = { level: -1, rect: { minX: 0, minY: 0, maxX: 3, maxY: 2 }, columns: [] };
    const anchor = { x: 2, y: 4, elevation: 1, screenX: (2 - 4) * 20, screenY: -60 - 40 / 3 };
    const turn = { a: -1, b: 0, c: 0, d: 1, tx: 2 * (-40 - 10), ty: 0 };
    const expected = { ...composeInto(getReflectionMatrix(anchor, area, TILE_METRICS, blank()), turn, blank()) };
    const mirrored = renderer.drawn[1].children.filter((child) => !("geometry" in child));
    expect(mirrored.map(({ matrix }) => matrix)).toEqual([expected, expected]);
    scene.destroy();
  });

  it("mirrors the entities again when those around change, a few chunks a frame", async () => {
    const entityViews = new Map<ChunkKey, readonly EntityView[]>([
      [KEY, [entityView(1, 4, [{ view: spriteOf("a") }])]],
    ]);
    const { scene, renderer, ticker } = await mount([provider(entityViews)]);
    ticker.frame();
    const drawn = renderer.drawn.length;

    // Nothing changed: nothing is drawn again.
    ticker.frame();
    expect(renderer.drawn).toHaveLength(drawn);

    // A chunk shown beside it: the chunk's maps are drawn again with what it brings.
    entityViews.set(chunkKey(1, 0), [entityView(33, 1, [{ view: spriteOf("b") }])]);
    ticker.frame();
    expect(renderer.drawn.length - drawn).toBe(2 * REFLECTION_BAKES_PER_FRAME);
    ticker.frame();
    expect(renderer.drawn.length - drawn).toBe(2 * REFLECTION_BAKES_PER_FRAME);

    // The chunk's own entities replaced, then a neighbour hidden.
    entityViews.set(KEY, [entityView(1, 4, [{ view: spriteOf("c") }])]);
    ticker.frame();
    expect(
      renderer.drawn.at(-1)?.children.map(({ texture }) => (texture as { source: string } | undefined)?.source),
    ).toContain("c");
    entityViews.delete(chunkKey(1, 0));
    ticker.frame();
    expect(renderer.drawn.length - drawn).toBe(6);
    scene.destroy();
  });

  it("draws again at most a few chunks a frame", async () => {
    // Water along two chunks.
    const points = Array.from({ length: 40 * 3 }, (_, index) => ({
      x: index % 40,
      y: Math.floor(index / 40),
      elevation: -1,
    }));
    const entityViews = new Map<ChunkKey, readonly EntityView[]>();
    const { scene, renderer, ticker } = await mount([provider(entityViews)], points);
    await frameUntil(ticker, () => expect(maps()).toHaveLength(2));
    ticker.frame();
    const drawn = renderer.drawn.length;

    entityViews.set(KEY, []);
    ticker.frame();
    expect(renderer.drawn.length - drawn).toBe(REFLECTION_BAKES_PER_FRAME);
    ticker.frame();
    expect(renderer.drawn.length - drawn).toBe(2 * REFLECTION_BAKES_PER_FRAME);
    scene.destroy();
  });

  it("draws the player in the maps it is near every frame, and once more when it leaves", async () => {
    const caster = player({ x: 1, y: 3.2, elevation: 1 });
    const { scene, renderer, ticker } = await mount([provider(undefined, [caster])]);
    const shown = renderer.drawn.length;
    expect(
      renderer.drawn
        .at(-1)
        ?.children.some(({ texture }) => (texture as { source: string } | undefined)?.source === "player"),
    ).toBe(true);

    ticker.frame();
    ticker.frame();
    // Near both levels' water: both maps, every frame.
    expect(renderer.drawn.length - shown).toBe(4);

    caster.ground = { x: 30, y: 30, elevation: 1 };
    ticker.frame();
    expect(renderer.drawn.length - shown).toBe(6);
    expect(
      renderer.drawn
        .at(-1)
        ?.children.some(({ texture }) => (texture as { source: string } | undefined)?.source === "player"),
    ).toBe(false);
    ticker.frame();
    expect(renderer.drawn.length - shown).toBe(6);
    scene.destroy();
  });

  it("leaves out a moving caster that is not a sprite", async () => {
    const { scene, renderer, ticker } = await mount([
      provider(undefined, [player({ x: 1, y: 3, elevation: 1 }, new Container())]),
    ]);
    const shown = renderer.drawn.length;
    ticker.frame();
    expect(renderer.drawn).toHaveLength(shown);
    scene.destroy();
  });

  it("draws no player without one", async () => {
    const { scene, renderer, ticker } = await mount([provider(undefined, [])]);
    const shown = renderer.drawn.length;
    ticker.frame();
    expect(renderer.drawn).toHaveLength(shown);
    scene.destroy();
  });

  it("frees its maps, frames and sprites when the chunk is hidden", async () => {
    const entityViews = new Map<ChunkKey, readonly EntityView[]>([
      [KEY, [entityView(1, 4, [{ view: spriteOf("a") }])]],
    ]);
    const { scene, ticker, reflections } = await mount([provider(entityViews)]);
    const views = reflections() as unknown as MockSprite[];
    await frameUntil(ticker, () => expect(views.length).toBeGreaterThan(0));

    scene.destroy();

    maps().forEach((map) => expect(map.destroy).toHaveBeenCalledWith(true));
    views.forEach(({ texture }) => expect(texture.destroy).toHaveBeenCalled());
  });
});
