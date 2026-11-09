import { describe, expect, it } from "vitest";
import { createPhaseLighting, DAY_SHADOW_PROJECTION, LIGHTING_PHASES } from "./phases";

describe("phase lighting", () => {
  it("holds the authored daylight indefinitely without consulting the world clock", () => {
    const lighting = createPhaseLighting();
    const state = lighting.current;
    lighting.transitionTo("day");
    expect(lighting.transitioning).toBe(false);
    lighting.advance(100000);
    expect(lighting.current).toBe(state);
    expect(state).toEqual(LIGHTING_PHASES.day);
    expect(Math.hypot(DAY_SHADOW_PROJECTION.dirX, DAY_SHADOW_PROJECTION.dirY)).toBeCloseTo(1);
  });

  it("blends ambient and shadow strength smoothly and lands exactly on a phase", () => {
    const lighting = createPhaseLighting();
    lighting.transitionTo("sunset", 1000);
    lighting.advance(250);
    const amount = 0.15625;
    expect(lighting.current.ambient.g).toBeCloseTo(1 + (LIGHTING_PHASES.sunset.ambient.g - 1) * amount);
    lighting.advance(750);
    expect(lighting.current).toEqual(LIGHTING_PHASES.sunset);
    const end = lighting.current;
    lighting.advance(500);
    expect(lighting.current).toBe(end);
  });

  it("retargets from the displayed light without a jump, and supports immediate changes", () => {
    const lighting = createPhaseLighting("dawn");
    lighting.transitionTo("night", 1000);
    lighting.advance(500);
    const displayed = lighting.current;
    lighting.transitionTo("day", 1000);
    lighting.advance(0);
    expect(lighting.current).toEqual(displayed);
    lighting.advance(-10);
    expect(lighting.current).toEqual(displayed);
    lighting.advance(1000);
    expect(lighting.current).toEqual(LIGHTING_PHASES.day);
    lighting.transitionTo("night", 0);
    expect(lighting.current).toEqual(LIGHTING_PHASES.night);
    lighting.transitionTo("dawn", -1);
    expect(lighting.current).toEqual(LIGHTING_PHASES.dawn);
  });
});

it("moves and lengthens shadows along a unit direction between phases, including retargeting", () => {
  const light = createPhaseLighting();
  const start = light.current.shadow;
  expect(light.transitioning).toBe(false);
  light.transitionTo("sunset", 1000);
  light.advance(500);
  expect(light.transitioning).toBe(true);
  expect(light.current.shadow).not.toEqual(start);
  expect(Math.hypot(light.current.shadow.dirX, light.current.shadow.dirY)).toBeCloseTo(1);
  expect(light.current.shadow.stretch).toBeGreaterThan(start.stretch);
  const shown = light.current.shadow;
  light.transitionTo("dawn", 1000);
  light.advance(0);
  expect(light.current.shadow.dirX).toBeCloseTo(shown.dirX);
  light.advance(1000);
  expect(light.current.shadow).toEqual(LIGHTING_PHASES.dawn.shadow);
});
