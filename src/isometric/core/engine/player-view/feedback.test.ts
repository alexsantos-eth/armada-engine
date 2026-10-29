import { describe, expect, it } from "vitest";
import { PLAYER_JUMP_SPEED } from "../player";
import { DUST_MS, getBodyScale, getDust, LANDING_SQUASH_MS, TAKEOFF_STRETCH_MS } from "./feedback";

describe("getBodyScale", () => {
  it("is the body's own scale when nothing happened", () => {
    expect(getBodyScale(Infinity, Infinity, 0)).toEqual({ x: 1, y: 1 });
    expect(getBodyScale(TAKEOFF_STRETCH_MS, LANDING_SQUASH_MS, PLAYER_JUMP_SPEED)).toEqual({ x: 1, y: 1 });
  });

  it("stretches up at a take-off and squashes at a landing, harder landings more", () => {
    const stretched = getBodyScale(0, Infinity, 0);
    expect(stretched.y).toBeGreaterThan(1);
    expect(stretched.x).toBeLessThan(1);

    const soft = getBodyScale(Infinity, 0, 0.02);
    const hard = getBodyScale(Infinity, 0, PLAYER_JUMP_SPEED);
    const harder = getBodyScale(Infinity, 0, 10);
    expect(soft.y).toBeLessThan(1);
    expect(hard.y).toBeLessThan(soft.y);
    expect(harder.y).toBeLessThan(hard.y);
    expect(harder).toEqual(getBodyScale(Infinity, 0, PLAYER_JUMP_SPEED * 1.5));
    expect(getBodyScale(Infinity, LANDING_SQUASH_MS / 2, PLAYER_JUMP_SPEED).y).toBeCloseTo(1 - 0.07);
  });
});

describe("getDust", () => {
  it("spreads and fades, and is gone after DUST_MS", () => {
    expect(getDust(0)).toEqual({ scale: 0.6, alpha: 0.55 });
    expect(getDust(DUST_MS / 2)).toEqual({ scale: expect.closeTo(1), alpha: expect.closeTo(0.275) });
    expect(getDust(DUST_MS)).toBeUndefined();
  });
});
