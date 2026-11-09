import { expect, it, vi } from "vitest";
vi.mock("pixi.js", async () => (await import("../flow-check/scene-harness")).mockPixi());
import { Texture } from "pixi.js";
import { createSpriteShadowSampler } from "./sprite-sample";

it("samples cached silhouette alpha and reads each texture only once", () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) pixels[(y * 64 + x) * 4 + 3] = x * 4;
  const renderer = { render: vi.fn(), extract: { pixels: vi.fn(() => ({ pixels })) } };
  const sampler = createSpriteShadowSampler(renderer as never);
  const texture = new Texture({ source: {} as never });
  const shape = { texture, display: { left: 0, top: 0, width: 64, height: 64 } };
  expect(sampler.sample(shape, -1, 10)).toBe(0);
  expect(sampler.sample(shape, 1, 65)).toBe(0);
  expect(sampler.sample(shape, 65, 1)).toBe(0);
  expect(sampler.sample(shape, 1, -1)).toBe(0);
  expect(renderer.render).not.toHaveBeenCalled();
  expect(sampler.sample(shape, 0, 0)).toBe(0);
  expect(sampler.sample(shape, 32, 32)).toBeCloseTo(126 / 255);
  expect(sampler.sample(shape, 63.99, 63.99)).toBeCloseTo(252 / 255);
  expect(renderer.extract.pixels).toHaveBeenCalledTimes(1);
  expect(sampler.sample({ ...shape, texture: new Texture({ source: {} as never }) }, 32, 32)).toBeCloseTo(126 / 255);
  expect(renderer.extract.pixels).toHaveBeenCalledTimes(2);
  sampler.destroy();
});

it("releases an unused sampler without allocating a texture", () => {
  const sampler = createSpriteShadowSampler({} as never);
  sampler.destroy();
});
