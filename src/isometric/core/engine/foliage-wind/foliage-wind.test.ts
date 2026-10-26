import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("../render", async () => (await import("../flow-check/scene-harness")).mockRender());

import { Entity } from "../entities";
import { mountScene, resetHarness, worldFrom } from "../flow-check/scene-harness";
import type { EntityView, SceneModule } from "../scene";
import { getSwayOffset, getSwayPhase } from "../wind";
import type { ChunkKey, EntitySway } from "../../types";
import { createFoliageWind, SWAY_REFRESH_MS } from "./foliage-wind";

const SWAY: EntitySway = { cut: 0.6, amplitude: 2, period: 3000 };

/** A sprite as the module reads it: its height, whether it is culled and its skew. */
const sprite = (height: number, culled = false) => {
  const writes: number[] = [];
  return {
    height,
    culled,
    writes,
    skew: {
      value: 0,
      get x() {
        return this.value;
      },
      set x(value: number) {
        this.value = value;
        writes.push(value);
      },
    },
  };
};
type TestSprite = ReturnType<typeof sprite>;

const entityView = (id: string, sway: EntitySway | undefined, views: { view: TestSprite; stacked?: boolean }[]) =>
  ({
    entity: {
      box: new Entity(0, 0, { id, textureSource: "/t.svg", height: 2, spawnChance: 1, surface: "grass", sway }, 1, {
        id,
      }),
    },
    views: views.map(({ view, stacked }) => ({ view, depth: 0, ...(stacked ? { stacked } : {}) })),
  }) as unknown as EntityView;

/** A module that provides `entityViews`, as `entity-view` does. */
const provider = (entityViews: Map<ChunkKey, readonly EntityView[]>): SceneModule => ({
  id: "entities",
  setup: () => ({ provides: { entityViews }, destroy: () => {} }),
});

const world = () => worldFrom([{ x: 0, y: 0, elevation: 1 }]);
const leanOf = (id: string, height: number, timeMs: number) =>
  -Math.asin(getSwayOffset(SWAY, getSwayPhase(id), timeMs) / height);

describe("createFoliageWind", () => {
  beforeEach(() => {
    resetHarness();
    vi.clearAllMocks();
  });

  it("leans the stacked part of each swaying entity about the cut, by the wind at the time elapsed", async () => {
    const [trunk, canopy] = [sprite(20), sprite(30)];
    const still = sprite(40);
    const entityViews = new Map<ChunkKey, readonly EntityView[]>([
      [
        0 as ChunkKey,
        [
          entityView("tree@0,0", SWAY, [{ view: trunk }, { view: canopy, stacked: true }]),
          entityView("rock@1,0", undefined, [{ view: still }]),
        ],
      ],
    ]);
    const { ticker, scene } = await mountScene(world(), [provider(entityViews), createFoliageWind()]);

    ticker.frame(SWAY_REFRESH_MS);
    expect(canopy.skew.x).toBeCloseTo(leanOf("tree@0,0", 30, SWAY_REFRESH_MS), 12);
    // The top of the canopy moves by the sway's offset: `−sin(skew) × height`.
    expect(-Math.sin(canopy.skew.x) * 30).toBeCloseTo(
      getSwayOffset(SWAY, getSwayPhase("tree@0,0"), SWAY_REFRESH_MS),
      12,
    );
    expect(trunk.writes).toEqual([]);
    expect(still.writes).toEqual([]);
    scene.destroy();
  });

  it("leans every SWAY_REFRESH_MS, only the sprites the camera shows, writing only changes", async () => {
    const shown = sprite(30);
    const culled = sprite(30, true);
    const calm = sprite(30);
    const entityViews = new Map<ChunkKey, readonly EntityView[]>([
      [
        0 as ChunkKey,
        [
          entityView("tree@0,0", SWAY, [{ view: sprite(10) }, { view: shown, stacked: true }]),
          entityView("tree@1,0", SWAY, [{ view: sprite(10) }, { view: culled, stacked: true }]),
          entityView("tree@2,0", { ...SWAY, amplitude: 0 }, [{ view: sprite(10) }, { view: calm, stacked: true }]),
        ],
      ],
    ]);
    const { ticker, scene } = await mountScene(world(), [provider(entityViews), createFoliageWind()]);

    // The first frame leans at once; then every SWAY_REFRESH_MS.
    ticker.frame(SWAY_REFRESH_MS);
    ticker.frame(SWAY_REFRESH_MS / 2);
    expect(shown.writes).toHaveLength(1);
    ticker.frame(SWAY_REFRESH_MS / 2);
    expect(shown.writes).toHaveLength(2);
    expect(shown.skew.x).toBeCloseTo(leanOf("tree@0,0", 30, 2 * SWAY_REFRESH_MS), 12);
    expect(culled.writes).toEqual([]);
    // Without amplitude the lean stays at 0: never written.
    expect(calm.writes).toEqual([]);
    scene.destroy();
  });

  it("scales the lean with the wind strength and follows the chunks shown", async () => {
    const canopy = sprite(30);
    const entityViews = new Map<ChunkKey, readonly EntityView[]>();
    const { ticker, scene } = await mountScene(world(), [provider(entityViews), createFoliageWind({ strength: 0.5 })]);

    ticker.frame(SWAY_REFRESH_MS);
    entityViews.set(1 as ChunkKey, [
      entityView("tree@0,0", SWAY, [{ view: sprite(10) }, { view: canopy, stacked: true }]),
    ]);
    ticker.frame(SWAY_REFRESH_MS);
    const offset = getSwayOffset(SWAY, getSwayPhase("tree@0,0"), 2 * SWAY_REFRESH_MS, 0.5);
    expect(canopy.skew.x).toBeCloseTo(-Math.asin(offset / 30), 12);
    scene.destroy();
  });

  it("does nothing without the entities' views", async () => {
    const { ticker, scene } = await mountScene(world(), [createFoliageWind()]);

    expect(() => ticker.frame(SWAY_REFRESH_MS)).not.toThrow();
    scene.destroy();
  });
});
