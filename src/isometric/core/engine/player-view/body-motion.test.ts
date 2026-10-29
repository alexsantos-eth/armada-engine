import { describe, expect, it } from "vitest";
import { PLAYER_GROUND_ACCEL, PLAYER_JUMP_SPEED, PLAYER_RUN_STEP, PLAYER_STEP } from "../player";
import {
  BODY_CLIMB_STRETCH,
  BODY_MAX_AIR_STRETCH,
  BODY_MAX_LEAN,
  getBodyShape,
  getLeanTarget,
  getScreenDrift,
  stepBodyLean,
  type BodyLean,
  type BodyShapeInput,
} from "./body-motion";

const STILL = { x: 0, y: 0 };
/** A ground velocity of `speed` columns per tick straight to the right of the screen. */
const right = (speed: number) => ({ x: speed / Math.SQRT2, y: -speed / Math.SQRT2 });

describe("getScreenDrift", () => {
  it("is the move across the screen: right positive, toward or away from the camera nothing", () => {
    expect(getScreenDrift(right(0.2))).toBeCloseTo(0.2);
    expect(getScreenDrift(right(-0.2))).toBeCloseTo(-0.2);
    expect(getScreenDrift({ x: 0.1, y: 0.1 })).toBe(0);
  });
});

describe("getLeanTarget", () => {
  it("leans forward with speed, a run more than a walk, and not at all standing still", () => {
    expect(getLeanTarget(STILL, STILL)).toBe(0);
    const walk = getLeanTarget(right(PLAYER_STEP), STILL);
    const run = getLeanTarget(right(PLAYER_RUN_STEP), STILL);
    expect(walk).toBeGreaterThan(0);
    expect(run).toBeGreaterThan(walk);
    expect(getLeanTarget(right(-PLAYER_RUN_STEP), STILL)).toBeCloseTo(-run);
  });

  it("leans further into a start and back against a stop, never past its limit", () => {
    const cruising = getLeanTarget(right(PLAYER_STEP), STILL);
    expect(getLeanTarget(right(PLAYER_STEP), right(PLAYER_GROUND_ACCEL))).toBeGreaterThan(cruising);
    expect(getLeanTarget(right(0.05), right(-PLAYER_GROUND_ACCEL))).toBeLessThan(0);
    expect(getLeanTarget(right(1), right(1))).toBe(BODY_MAX_LEAN);
    expect(getLeanTarget(right(-1), STILL)).toBe(-BODY_MAX_LEAN);
  });
});

describe("stepBodyLean", () => {
  it("follows its target along a spring that overshoots, then settles on it", () => {
    const lean: BodyLean = { angle: 0, speed: 0 };
    stepBodyLean(lean, 0.1, 50);
    expect(lean.angle).toBeGreaterThan(0);
    expect(lean.angle).toBeLessThan(0.1);
    let most = lean.angle;
    for (let frame = 0; frame < 20; frame += 1) {
      stepBodyLean(lean, 0.1, 16);
      most = Math.max(most, lean.angle);
    }
    expect(most).toBeGreaterThan(0.1);
    stepBodyLean(lean, 0.1, 3000);
    expect(lean.angle).toBeCloseTo(0.1, 4);
  });

  it("swings back past upright after a stop and then rests exactly upright", () => {
    const lean: BodyLean = { angle: 0.1, speed: 0 };
    let least = lean.angle;
    for (let frame = 0; frame < 30; frame += 1) {
      stepBodyLean(lean, 0, 16);
      least = Math.min(least, lean.angle);
    }
    expect(least).toBeLessThan(0);
    stepBodyLean(lean, 0, 5000);
    expect(lean).toEqual({ angle: 0, speed: 0 });
  });

  it("stays put over no time, or time going back", () => {
    const lean: BodyLean = { angle: 0.05, speed: 0.2 };
    stepBodyLean(lean, 0.1, 0);
    stepBodyLean(lean, 0.1, -16);
    expect(lean).toEqual({ angle: 0.05, speed: 0.2 });
  });
});

describe("getBodyShape", () => {
  const STAND: BodyShapeInput = {
    motion: "idle",
    speed: 0,
    walked: 0,
    stride: 1.4,
    verticalSpeed: undefined,
    climb: undefined,
  };

  it("keeps its own shape standing still, and at the start of a walk", () => {
    expect(getBodyShape(STAND)).toEqual({ x: 1, y: 1 });
    expect(getBodyShape({ ...STAND, motion: "walking", speed: PLAYER_STEP })).toEqual({ x: 1, y: 1 });
  });

  it("bobs twice per walk cycle, more running, keeping its volume", () => {
    const step = (speed: number, walked: number) => getBodyShape({ ...STAND, motion: "walking", speed, walked });
    const walkUp = step(PLAYER_STEP, 1.4 / 8);
    const walkDown = step(PLAYER_STEP, (3 * 1.4) / 8);
    expect(walkUp.y).toBeGreaterThan(1);
    expect(walkUp.x).toBeCloseTo(1 - (walkUp.y - 1) / 2);
    expect(walkDown.y).toBeCloseTo(2 - walkUp.y);
    expect(step(PLAYER_STEP, 1.4 / 8 + 0.7).y).toBeCloseTo(walkUp.y);
    expect(step(PLAYER_RUN_STEP, 1.4 / 8).y).toBeGreaterThan(walkUp.y);
    expect(getBodyShape({ ...STAND, motion: "walking", speed: PLAYER_STEP, walked: 0.35, stride: 0 })).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("stretches in the air with its vertical speed, rising or falling, and not at the apex", () => {
    const air = (motion: "jumping" | "falling", verticalSpeed?: number) =>
      getBodyShape({ ...STAND, motion, verticalSpeed });
    expect(air("jumping", PLAYER_JUMP_SPEED).y).toBeGreaterThan(1);
    expect(air("falling", -0.2).y).toBeGreaterThan(1);
    expect(air("jumping", 0)).toEqual({ x: 1, y: 1 });
    expect(air("falling")).toEqual({ x: 1, y: 1 });
    expect(air("falling", -10).y).toBeCloseTo(1 + BODY_MAX_AIR_STRETCH);
  });

  it("stretches most halfway through a climb", () => {
    const climb = (progress: number) => getBodyShape({ ...STAND, motion: "climbing", climb: progress });
    expect(climb(0).y).toBe(1);
    expect(climb(0.5).y).toBeCloseTo(1 + BODY_CLIMB_STRETCH);
    expect(climb(1).y).toBeCloseTo(1);
  });
});
