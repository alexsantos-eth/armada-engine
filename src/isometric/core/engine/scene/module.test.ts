import { describe, expect, expectTypeOf, it } from "vitest";
import type { Container } from "pixi.js";
import type { ChunkKey, SceneCamera } from "../../types";
import type {
  BuiltScene,
  EntityView,
  SceneCameraService,
  SceneFocus,
  SceneMovingCaster,
  SceneFrame,
  SceneLayer,
  SceneModule,
  SceneModulePart,
  SceneServiceKey,
  SceneServiceRegistry,
  SceneServices,
  SceneTerrainSurfaces,
} from "./module";
import { SCENE_LAYER } from "./scene";

// `module.ts` only declares the contract between the scene and its modules: these checks run when
// the tests are type-checked (`pnpm lint`, `pnpm build`), and fail there if the contract drifts.
describe("scene module contract", () => {
  it("has one layer per `SCENE_LAYER` entry, in draw order", () => {
    expectTypeOf<(typeof SCENE_LAYER)[keyof typeof SCENE_LAYER]>().toEqualTypeOf<SceneLayer>();
    expect(Object.values(SCENE_LAYER)).toEqual([0, 1, 2, 3]);
  });

  it("names the services modules share, each with its type", () => {
    expectTypeOf<SceneServiceKey>().toEqualTypeOf<
      "camera" | "entityViews" | "focus" | "movingCasters" | "terrainSurfaces"
    >();
    expectTypeOf<SceneServices["camera"]>().toEqualTypeOf<SceneCameraService>();
    // The camera of the core types, plus culling the views just added.
    expectTypeOf<SceneCameraService>().toExtend<SceneCamera>();
    expectTypeOf<SceneServices["entityViews"]>().toEqualTypeOf<ReadonlyMap<ChunkKey, readonly EntityView[]>>();
    expectTypeOf<SceneServices["focus"]>().toEqualTypeOf<SceneFocus>();
    expectTypeOf<SceneServices["movingCasters"]>().toEqualTypeOf<readonly SceneMovingCaster[]>();
    expectTypeOf<SceneServices["terrainSurfaces"]>().toEqualTypeOf<SceneTerrainSurfaces>();
  });

  it("reads a service by name, `undefined` when no module provides it", () => {
    const registry: SceneServiceRegistry = { get: () => undefined };

    expectTypeOf(registry.get("camera")).toEqualTypeOf<SceneCameraService | undefined>();
    expectTypeOf(registry.get("focus")).toEqualTypeOf<SceneFocus | undefined>();
    expect(registry.get("entityViews")).toBeUndefined();
  });

  it("only asks a module part for `destroy()`", () => {
    const part = { destroy: () => {} };

    expectTypeOf(part).toExtend<SceneModulePart>();
    expectTypeOf<{ views: [] }>().not.toExtend<SceneModulePart>();
    expect(part.destroy()).toBeUndefined();
  });

  it("lets a module set up synchronously or asynchronously", () => {
    const now = { id: "now", setup: () => ({ destroy: () => {} }) } satisfies SceneModule;
    const later = { id: "later", setup: () => Promise.resolve({ destroy: () => {} }) } satisfies SceneModule;

    expectTypeOf(now).toExtend<SceneModule>();
    expectTypeOf(later).toExtend<SceneModule>();
    expectTypeOf<SceneModule["requires"]>().toEqualTypeOf<readonly SceneServiceKey[] | undefined>();
    expect([now.id, later.id]).toEqual(["now", "later"]);
  });

  it("hands modules the frame and the built scene", () => {
    expectTypeOf<SceneFrame>().toEqualTypeOf<{
      readonly tick: number;
      readonly elapsedMs: number;
      readonly alpha: number;
    }>();
    expectTypeOf<BuiltScene["placeAt"]>().parameters.toEqualTypeOf<[view: Container, depth: number]>();
  });
});
