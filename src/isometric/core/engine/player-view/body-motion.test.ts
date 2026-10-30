import { describe, expect, it } from "vitest";
import { PLAYER_GROUND_ACCEL, PLAYER_JUMP_SPEED, PLAYER_RUN_STEP, PLAYER_STEP } from "../player";
import {
  BODY_CLIMB_STRETCH,
  BODY_CLIMB_SWING,
  CLIMB_PUSH_SHARE,
  CLIMB_SWING_SHARE,
  BODY_MAX_AIR_STRETCH,
  BODY_MAX_LEAN,
  BODY_SKID_LEAN_PER_SPEED,
  DANCE_DELAY_MS,
  DANCE_FADE_MS,
  getBodyShape,
  getClimbSwing,
  getForwardLeanShare,
  getIdleDance,
  getSideLeanShare,
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

  it("leans back against a skid instead of into it, more from a run, never past its limit", () => {
    const walk = getLeanTarget(right(PLAYER_STEP), STILL, true);
    expect(walk).toBeCloseTo(-BODY_SKID_LEAN_PER_SPEED * PLAYER_STEP);
    expect(getLeanTarget(right(PLAYER_RUN_STEP), STILL, true)).toBeLessThan(walk);
    expect(getLeanTarget(right(-PLAYER_STEP), STILL, true)).toBeCloseTo(-walk);
    expect(getLeanTarget(right(1), right(-1), true)).toBe(-BODY_MAX_LEAN);
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
    const run = getBodyShape({ ...STAND, motion: "running", speed: PLAYER_RUN_STEP, walked: 1.4 / 8 });
    expect(run).toEqual(step(PLAYER_RUN_STEP, 1.4 / 8));
    const skid = getBodyShape({ ...STAND, motion: "skidding", speed: PLAYER_STEP, walked: 1.4 / 8 });
    expect(skid).toEqual(walkUp);
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

describe("getIdleDance", () => {
  const DANCE = { beat: 400, lean: 0.2, bounce: 0.1 };
  /** `beats` beats into the dance, once it has grown to its full size (a whole number of cycles). */
  const at = (beats: number) => getIdleDance(DANCE_DELAY_MS + 2 * DANCE.beat * 10 + beats * DANCE.beat, DANCE);

  it("does nothing for a short stop, then grows into the dance from upright, leaning right first", () => {
    expect(10 * 2 * DANCE.beat).toBeGreaterThan(DANCE_FADE_MS);
    expect(getIdleDance(0, DANCE)).toEqual({ lean: 0, shape: { x: 1, y: 1 } });
    expect(getIdleDance(DANCE_DELAY_MS, DANCE)).toEqual({ lean: 0, shape: { x: 1, y: 1 } });
    const early = getIdleDance(DANCE_DELAY_MS + 100, DANCE);
    expect(early.lean).toBeGreaterThan(0);
    expect(early.lean).toBeLessThan(DANCE.lean / 4);
  });

  it("leans fully over one foot and then the other, one each beat, dipping as the weight lands", () => {
    expect(at(0.5).lean).toBeCloseTo(DANCE.lean);
    expect(at(1.5).lean).toBeCloseTo(-DANCE.lean);
    expect(at(2.5).lean).toBeCloseTo(DANCE.lean);
    expect(at(0.5).shape.y).toBeCloseTo(1 - DANCE.bounce);
    expect(at(0.5).shape.x).toBeCloseTo(1 + DANCE.bounce / 2);
    // Between beats: upright and stretched as much.
    expect(at(1).lean).toBeCloseTo(0);
    expect(at(1).shape.y).toBeCloseTo(1 + DANCE.bounce);
  });

  it("steps from foot to foot: a quarter beat from the middle it leans further than a plain sway", () => {
    expect(at(1.25).lean).toBeLessThan(-Math.SQRT1_2 * DANCE.lean);
  });
});

describe("getSideLeanShare", () => {
  it("shows a sideways lean fully facing the camera or away, partly on a diagonal, not in profile", () => {
    // Facings: east, north-east, north, north-west, west, south-west, south, south-east.
    expect(getSideLeanShare(6, 8)).toBeCloseTo(1);
    expect(getSideLeanShare(2, 8)).toBeCloseTo(1);
    expect(getSideLeanShare(7, 8)).toBeCloseTo(Math.SQRT1_2);
    expect(getSideLeanShare(0, 8)).toBe(0);
    expect(getSideLeanShare(4, 8)).toBeCloseTo(0);
  });
});

describe("getClimbSwing", () => {
  it("swings back and then forward on its hand, wider each time, and pushes itself upright", () => {
    expect(getClimbSwing(0)).toBeCloseTo(0);
    // Back first, at a third of its swing.
    expect(getClimbSwing(CLIMB_SWING_SHARE / 3)).toBeCloseTo(-0.6 * BODY_CLIMB_SWING);
    // Its widest swing forward, at the end of the swing.
    expect(getClimbSwing(CLIMB_SWING_SHARE)).toBeCloseTo(BODY_CLIMB_SWING);
    // Half pushed up, half upright again; then upright.
    expect(getClimbSwing((CLIMB_SWING_SHARE + CLIMB_PUSH_SHARE) / 2)).toBeCloseTo(BODY_CLIMB_SWING / 2);
    expect(getClimbSwing(CLIMB_PUSH_SHARE)).toBeCloseTo(0);
    expect(getClimbSwing(1)).toBeCloseTo(0);
    expect(getClimbSwing(-1)).toBeCloseTo(0);
  });
});

describe("getForwardLeanShare", () => {
  it("shows a lean forward across the screen in profile, signed by the side it faces, and none head on", () => {
    expect(getForwardLeanShare(0, 8)).toBeCloseTo(1);
    expect(getForwardLeanShare(4, 8)).toBeCloseTo(-1);
    expect(getForwardLeanShare(1, 8)).toBeCloseTo(Math.SQRT1_2);
    expect(getForwardLeanShare(2, 8)).toBeCloseTo(0);
    expect(getForwardLeanShare(6, 8)).toBeCloseTo(0);
  });
});
