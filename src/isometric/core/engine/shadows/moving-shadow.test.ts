import { expect, it, vi } from "vitest";
vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
vi.mock("./silhouette", async () => (await import("../flow-check/scene-harness")).mockSilhouette());
import { Sprite } from "pixi.js";
import { createMovingCasters } from "./moving-shadow";
import { createMovingSilhouette } from "./silhouette";

it("captures current feet, reuses poses and invalidates the common caster pass only when needed", () => {
  vi.clearAllMocks();
  const sprite = new Sprite({} as never);
  const foot = { ground: { x: 0, y: 0, elevation: 0 }, screen: { x: 0, y: 0 } };
  let loaded = true;
  const moving = createMovingCasters([{ view: sprite, foot: () => foot }], () => loaded);
  expect(moving.update()).toBe(true);
  expect(moving.states[0].shape?.worldFoot).toEqual({ x: 0, y: 0 });
  // The mock silhouette uses a unit display; match it to exercise a cached pose.
  sprite.width = 1;
  sprite.height = 1;
  expect(moving.update()).toBe(true);
  foot.ground.x = 0.25;
  expect(moving.update()).toBe(true);
  expect(moving.states[0].shape?.worldFoot.x).toBe(0.25);
  expect(moving.update()).toBe(false);
  const original = sprite.texture;
  sprite.texture = {} as never;
  expect(moving.update()).toBe(true);
  sprite.texture = original;
  expect(moving.update()).toBe(true);
  foot.ground.elevation = 2;
  expect(moving.update()).toBe(true);
  expect(moving.states[0].elevation).toBe(2);
  sprite.width = 2;
  expect(moving.update()).toBe(true);
  sprite.height = 2;
  expect(moving.update()).toBe(true);
  loaded = false;
  expect(moving.update()).toBe(true);
  expect(moving.states[0].shape).toBeUndefined();
  foot.ground.y = 1;
  expect(moving.update()).toBe(false);
  expect(createMovingSilhouette).toHaveBeenCalled();
});

it("ignores unsupported caster views and leaves an empty service idle", () => {
  const foot = { ground: { x: 0, y: 0, elevation: 0 }, screen: { x: 0, y: 0 } };
  expect(createMovingCasters([], () => true).update()).toBe(false);
  const moving = createMovingCasters([{ view: {} as never, foot: () => foot }], () => true);
  expect(moving.update()).toBe(false);
  expect(moving.update()).toBe(false);
});
