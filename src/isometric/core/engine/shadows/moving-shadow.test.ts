import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());
vi.mock("./silhouette", async () => (await import("../flow-check/scene-harness")).mockSilhouette());

import { type Renderer, RenderTexture, Sprite } from "pixi.js";
import { TILE_METRICS } from "../constants";
import { getShadowProjection, getSilhouetteMatrix, SHADOW_REFRESH_TICKS } from "../lighting";
import { projectBoxesToIsometric } from "../projection";
import type { BuiltScene, SceneMovingCaster, SceneView } from "../scene";
import { getSunState, TICKS_PER_HOUR } from "../time";
import { createMovingShadow, MOVING_SHADOW_PIXELS_PER_TILE, MOVING_SHADOW_RADIUS } from "./moving-shadow";
import {
  createCasterSprites,
  createMovingSilhouette,
  placeGroundShadowView,
  placeSilhouette,
  SHADOW_MAP_PIXELS_PER_TILE,
} from "./silhouette";

const projection = {
  tileWidth: TILE_METRICS.tileWidth,
  tileHeight: TILE_METRICS.tileHeight,
  elevationStep: TILE_METRICS.boxHeight,
  originX: 0,
  originY: 0,
};
const SIDE = 2 * MOVING_SHADOW_RADIUS + 1;
const noon = getShadowProjection(getSunState(12 * TICKS_PER_HOUR));

/** The caster sprites a moving shadow made (`index`, in order), as the mock makes them. */
type Casters = {
  container: { filterArea?: object };
  sprite: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};
const castersOf = (index = 0) => vi.mocked(createCasterSprites).mock.results[index].value as unknown as Casters;

type Slot = { visible: boolean; tileTop?: { x: number; y: number }; texture: { frame: { x: number; y: number } } };

/** A caster standing on `ground`, drawn with its foot at `screen`; move it by writing `at`. */
const casterAt = (ground: { x: number; y: number; elevation: number }, view: unknown = new Sprite({} as never)) => {
  const at = { ground, screen: { x: 10, y: 20 } };
  const caster: SceneMovingCaster = { view: view as never, foot: () => at };
  return { at, caster };
};

/** A moving shadow over flat ground at elevation 1, but for the columns `heights` sets. */
const shadowOf = (caster: SceneMovingCaster, heights: (x: number, y: number) => number | undefined = () => 1) => {
  const renderer = { render: vi.fn() };
  const filters = [{ blur: true }, { alpha: 1 }];
  const shadow = createMovingShadow(caster, {
    renderer: renderer as unknown as Renderer,
    filters: filters as never,
    elevationAt: heights,
    topInsetAt: (x) => (x === 6 ? 0.25 : 0),
    projection,
    metrics: TILE_METRICS,
  });
  const moved: SceneView[] = [];
  const scene: BuiltScene = {
    placeAt: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    move: vi.fn((view: SceneView) => {
      moved.push(view);
    }),
  };
  const slots = shadow.views.map(({ view }) => view as unknown as Slot);
  return { shadow, renderer, scene, moved, slots, filters };
};

/** The slot of column `(x, y)` around a caster on `(cx, cy)`. */
const slotOf = (slots: Slot[], cx: number, cy: number, x: number, y: number) =>
  slots[x - cx + MOVING_SHADOW_RADIUS + (y - cy + MOVING_SHADOW_RADIUS) * SIDE];

describe("createMovingShadow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("draws into a map of its own around the caster, twice as fine as a chunk's", () => {
    const { caster } = casterAt({ x: 3, y: 4, elevation: 1 });
    const { shadow, slots } = shadowOf(caster);
    const side = SIDE * MOVING_SHADOW_PIXELS_PER_TILE;

    expect(MOVING_SHADOW_PIXELS_PER_TILE).toBe(2 * SHADOW_MAP_PIXELS_PER_TILE);
    expect(RenderTexture.create).toHaveBeenCalledWith({ width: side, height: side });
    expect(createCasterSprites).toHaveBeenCalledWith([{ blur: true }, { alpha: 1 }]);
    const { container } = castersOf();
    expect(container.filterArea).toMatchObject({ x: 0, y: 0, width: side, height: side });
    // One ground view per column of the map, each with its own square, hidden until placed.
    expect(shadow.views).toHaveLength(SIDE * SIDE);
    expect(shadow.views.every(({ layer }) => layer === 1)).toBe(true);
    expect(slots[SIDE + 2].texture.frame).toMatchObject({
      x: 2 * MOVING_SHADOW_PIXELS_PER_TILE,
      y: MOVING_SHADOW_PIXELS_PER_TILE,
    });
    expect(slots.every(({ visible }) => !visible)).toBe(true);
  });

  it("lays its views on the columns around the caster at its level, under what stands on them", () => {
    const { caster } = casterAt({ x: 3.2, y: 4, elevation: 1 });
    const { shadow, scene, moved, slots } = shadowOf(caster, (x) => (x === 5 ? 2 : 1));

    shadow.update(scene, noon, 0);

    const [top] = projectBoxesToIsometric([{ x: 4, y: 5, elevation: 1, metadata: {} }], projection);
    expect(slotOf(slots, 3, 4, 4, 5)).toMatchObject({ visible: true, tileTop: { x: top.screenX, y: top.screenY } });
    expect(moved).toContainEqual(expect.objectContaining({ view: slotOf(slots, 3, 4, 4, 5), depth: top.baseScreenY }));
    // A column of another level shows none of it.
    expect(slotOf(slots, 3, 4, 5, 5).visible).toBe(false);
    // On a sand top, as much lower.
    expect(slotOf(slots, 3, 4, 6, 4).tileTop?.y).toBeCloseTo(
      projectBoxesToIsometric([{ x: 6, y: 4, elevation: 1, metadata: {} }], projection)[0].screenY +
        0.25 * TILE_METRICS.boxHeight,
    );
    expect(placeGroundShadowView).toHaveBeenCalledWith(slotOf(slots, 3, 4, 4, 5), expect.anything(), TILE_METRICS, {
      width: MOVING_SHADOW_PIXELS_PER_TILE,
      height: MOVING_SHADOW_PIXELS_PER_TILE,
    });
    expect(moved).toHaveLength(SIDE * SIDE - SIDE);
  });

  it("lays the caster's silhouette by the sun from its foot, made once", () => {
    const { caster, at } = casterAt({ x: 3.2, y: 4, elevation: 1.5 });
    const { shadow, scene, renderer } = shadowOf(caster);
    const light = noon as NonNullable<typeof noon>;

    shadow.update(scene, light, 0);

    expect(createMovingSilhouette).toHaveBeenCalledWith(caster.view, at.screen, at.ground);
    // Copies of its feet, not the caster's own points (which may be written in place as it moves).
    const [, screenFoot, worldFoot] = vi.mocked(createMovingSilhouette).mock.calls[0];
    expect(screenFoot).not.toBe(at.screen);
    expect(worldFoot).not.toBe(at.ground);
    const silhouette = vi.mocked(createMovingSilhouette).mock.results[0].value as { texture: unknown };
    const sprites = castersOf();
    expect(sprites.sprite).toHaveBeenCalledWith(0, silhouette.texture);
    expect(sprites.show).toHaveBeenLastCalledWith(1);
    // Half a block above its column's top while it climbs: the shadow lands that much further.
    expect(placeSilhouette).toHaveBeenCalledWith(
      sprites.sprite.mock.results[0].value,
      silhouette,
      expect.objectContaining(getSilhouetteMatrix(light, at.ground, 0.5, TILE_METRICS)),
      { x: 3 - MOVING_SHADOW_RADIUS - 0.5, y: 4 - MOVING_SHADOW_RADIUS - 0.5 },
      MOVING_SHADOW_PIXELS_PER_TILE,
    );
    expect(renderer.render).toHaveBeenCalledWith({
      container: sprites.container,
      target: vi.mocked(RenderTexture.create).mock.results[0].value,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });

    at.ground = { x: 3.4, y: 4, elevation: 1 };
    at.screen.x = 99;
    shadow.update(scene, light, 1);
    expect(createMovingSilhouette).toHaveBeenCalledTimes(1);
    expect(screenFoot).toEqual({ x: 10, y: 20 });
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it("draws again only when the caster moves, the sun turns or a refresh is due", () => {
    const { caster, at } = casterAt({ x: 3, y: 4, elevation: 1 });
    const { shadow, scene, renderer, moved } = shadowOf(caster);

    shadow.update(scene, noon, 0);
    shadow.update(scene, noon, SHADOW_REFRESH_TICKS - 1);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    shadow.update(scene, noon, SHADOW_REFRESH_TICKS);
    expect(renderer.render).toHaveBeenCalledTimes(2);

    // At night, an empty map.
    shadow.update(scene, null, SHADOW_REFRESH_TICKS);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(castersOf().show).toHaveBeenLastCalledWith(0);

    // Moving within its column moves no view.
    const placed = moved.length;
    at.ground = { x: 3.3, y: 4, elevation: 1 };
    shadow.update(scene, null, SHADOW_REFRESH_TICKS);
    expect(renderer.render).toHaveBeenCalledTimes(4);
    expect(moved).toHaveLength(placed);
  });

  it("follows the caster into another column, showing the views of its new level only", () => {
    const { caster, at } = casterAt({ x: 3, y: 4, elevation: 1 });
    const { shadow, scene, moved, slots } = shadowOf(caster, (x) => (x >= 5 ? 2 : 1));
    shadow.update(scene, noon, 0);
    expect(slotOf(slots, 3, 4, 5, 4).visible).toBe(false);

    at.ground = { x: 5, y: 4, elevation: 2 };
    moved.length = 0;
    shadow.update(scene, noon, 0);

    expect(slotOf(slots, 5, 4, 5, 4).visible).toBe(true);
    expect(slotOf(slots, 5, 4, 4, 4).visible).toBe(false);
    expect(moved).toHaveLength(SIDE * (MOVING_SHADOW_RADIUS + 1));
  });

  it("shows nothing off the loaded ground, nor for a caster that is not a sprite", () => {
    const off = casterAt({ x: 3, y: 4, elevation: 0 });
    const offGround = shadowOf(off.caster, () => undefined);
    offGround.shadow.update(offGround.scene, noon, 0);
    expect(offGround.slots.every(({ visible }) => !visible)).toBe(true);
    expect(offGround.renderer.render).toHaveBeenCalledTimes(1);
    expect(createMovingSilhouette).not.toHaveBeenCalled();

    const flat = casterAt({ x: 3, y: 4, elevation: 1 }, { notASprite: true });
    const notSprite = shadowOf(flat.caster);
    notSprite.shadow.update(notSprite.scene, noon, 0);
    expect(createMovingSilhouette).not.toHaveBeenCalled();
    expect(castersOf(1).show).toHaveBeenLastCalledWith(0);
  });

  it("destroys its map and caster sprites, leaving its views to the scene", () => {
    const { caster } = casterAt({ x: 3, y: 4, elevation: 1 });
    const { shadow } = shadowOf(caster);
    const map = vi.mocked(RenderTexture.create).mock.results[0].value as unknown as { destroy: () => void };

    shadow.destroy();

    expect(map.destroy).toHaveBeenCalledWith(true);
    expect(castersOf().destroy).toHaveBeenCalled();
  });
});
