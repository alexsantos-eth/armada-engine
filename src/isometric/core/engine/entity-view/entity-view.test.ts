import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Assets } from "pixi.js";
import { Entity } from "../entities";
import { createSvgColorVariant, releaseSvgColorVariant } from "../render";
import type { EntityView, SceneModule } from "../scene";
import {
  createColorizedEntities,
  createTestEntities,
  defaultWorld,
  entitiesOf,
  loadTexture,
  mountScene,
  renderCalls,
  resetHarness,
  worldFrom,
} from "../flow-check/scene-harness";
import { createEntityView } from "./entity-view";

const HOUSE = {
  id: "house",
  textureSource: "/assets/house/block.svg",
  height: 1,
  spawnChance: 1,
  surface: "grass" as const,
  colorReplacements: { "#9f4b2f": ["#f0c040", "#c0392b", "#3478b8"] },
};

describe("createEntityView", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
    vi.mocked(Assets.load).mockImplementation(loadTexture as never);
  });

  it("draws every entity standing on its column, with its height and footprint", async () => {
    const world = defaultWorld(createTestEntities);
    const { root, scene } = await mountScene(world, [createEntityView()]);

    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/statue/block.svg",
      parser: "svg",
      data: expect.anything(),
    });
    expect(renderCalls).toEqual([
      expect.objectContaining({ texture: { source: "/assets/statue/block.svg" }, height: 1, length: 2 }),
    ]);
    expect(root.children).toHaveLength(1);
    scene.destroy();
    expect(Assets.unload).toHaveBeenCalledWith("/assets/statue/block.svg");
  });

  it("provides the entities of each shown chunk with their views, until the chunk is hidden", async () => {
    const world = defaultWorld(createTestEntities);
    let seen: readonly EntityView[] | undefined;
    const reader: SceneModule = {
      id: "reader",
      requires: ["entityViews"],
      setup: ({ services }) => ({
        showChunk: ({ key }) => {
          seen = services.get("entityViews")?.get(key);
          return {};
        },
        destroy: () => {},
      }),
    };

    const { root, scene } = await mountScene(world, [createEntityView(), reader]);

    expect(seen).toEqual([
      { entity: expect.objectContaining({ box: entitiesOf(world)[0] }), views: [expect.anything()] },
    ]);
    expect(root.children[0]).toBe(seen?.[0].views[0].view);
    expect(scene.services.entityViews?.size).toBe(1);
    scene.destroy();
    expect(scene.services.entityViews?.size).toBe(0);
  });

  it("cuts the sprite of an entity that sways where its sway says", async () => {
    const world = defaultWorld((boxes) =>
      boxes
        .slice(0, 1)
        .map(
          (box) =>
            new Entity(
              box.x,
              box.y,
              { ...HOUSE, id: "tree", colorReplacements: undefined, sway: { cut: 0.6, amplitude: 2, period: 3000 } },
              box.elevation,
            ),
        ),
    );
    const { scene } = await mountScene(world, [createEntityView()]);

    expect(renderCalls).toEqual([expect.objectContaining({ splitAt: 0.6 })]);
    scene.destroy();
  });

  it("creates one colorized SVG variant per entity type and variation", async () => {
    const { scene } = await mountScene(defaultWorld(createColorizedEntities), [createEntityView()]);

    // Two different types → one variant each, with the variation stored on the entity.
    expect(createSvgColorVariant).toHaveBeenCalledTimes(2);
    vi.mocked(createSvgColorVariant).mock.calls.forEach(([source, replacements, variation]) => {
      expect(source).toBe("/assets/house/block.svg");
      expect(replacements).toEqual(HOUSE.colorReplacements);
      expect(variation).toBe(0);
    });
    expect(Assets.load).toHaveBeenCalledWith({
      src: "/assets/house/block.svg#0",
      parser: "svg",
      data: expect.anything(),
    });
    // The variant's URL is given back once its texture is loaded.
    expect(releaseSvgColorVariant).toHaveBeenCalledWith("/assets/house/block.svg#0");
    scene.destroy();
  });

  it("shares variant textures between instances of the same type and variation", async () => {
    const world = defaultWorld((columns) =>
      columns
        .slice(0, 40)
        .map((box, index) => new Entity(box.x, box.y, HOUSE, box.elevation, { colorVariant: index % 3 })),
    );

    const { scene } = await mountScene(world, [createEntityView()]);

    const variations = vi.mocked(createSvgColorVariant).mock.calls.map(([, , variation]) => variation);
    expect(variations.sort()).toEqual([0, 1, 2]);
    expect(Assets.load).toHaveBeenCalledTimes(3);
    expect(renderCalls).toHaveLength(40);
    scene.destroy();
  });

  it("loads a texture once for every chunk that needs it", async () => {
    const world = worldFrom(
      [
        { x: 0, y: 0, elevation: 1 },
        { x: 40, y: 0, elevation: 1 },
      ],
      (columns) => columns.map((box) => new Entity(box.x, box.y, HOUSE, box.elevation, { colorVariant: 1 })),
    );

    const { scene } = await mountScene(world, [createEntityView()]);

    expect(scene.shownChunks()).toHaveLength(2);
    expect(createSvgColorVariant).toHaveBeenCalledTimes(1);
    expect(renderCalls).toHaveLength(2);
    scene.destroy();
  });

  it("skips an entity whose texture cannot be used", async () => {
    vi.mocked(Assets.load).mockImplementation((asset) => {
      const source = (asset as unknown as { src: string }).src;
      return Promise.resolve((source.includes("/statue/") ? undefined : { source }) as never);
    });
    const world = defaultWorld((columns) => [
      ...createTestEntities(columns),
      new Entity(columns[5].x, columns[5].y, { ...HOUSE, colorReplacements: undefined }, columns[5].elevation),
    ]);

    const { scene } = await mountScene(world, [createEntityView()]);

    expect(renderCalls.map(({ texture }) => texture.source)).toEqual(["/assets/house/block.svg"]);
    expect(scene.services.entityViews?.get(world.chunks.get({ cx: 0, cy: 0 })!.key)).toHaveLength(1);
    scene.destroy();
  });
});
