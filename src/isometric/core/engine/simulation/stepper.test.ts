import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "../time";
import {
  consumeFrame,
  createFixedStepper,
  DEFAULT_MAX_FRAME_MS,
  getInterpolationAlpha,
  setTimeScale,
  STEP_MS,
} from "./stepper";

describe("createFixedStepper", () => {
  it("defaults to one step per world tick, real time and a 250 ms frame cap", () => {
    const stepper = createFixedStepper();

    expect(STEP_MS).toBe(1000 / TICKS_PER_SECOND);
    expect(DEFAULT_MAX_FRAME_MS).toBe(250);
    expect(stepper).toEqual({
      stepMs: STEP_MS,
      maxFrameMs: DEFAULT_MAX_FRAME_MS,
      timeScale: 1,
      paused: false,
      accumulatorMs: 0,
    });
  });

  it("accepts custom options", () => {
    const stepper = createFixedStepper({ stepMs: 10, maxFrameMs: 100, timeScale: 2 });

    expect(stepper).toMatchObject({ stepMs: 10, maxFrameMs: 100, timeScale: 2 });
  });

  it.each([
    [{ stepMs: 0 }],
    [{ stepMs: Number.POSITIVE_INFINITY }],
    [{ maxFrameMs: -1 }],
    [{ maxFrameMs: Number.NaN }],
    [{ timeScale: -1 }],
    [{ timeScale: Number.POSITIVE_INFINITY }],
  ])("rejects the invalid options %o", (options) => {
    expect(() => createFixedStepper(options)).toThrow(RangeError);
  });
});

describe("consumeFrame", () => {
  it("returns whole steps and keeps the remainder for the next frame", () => {
    const stepper = createFixedStepper({ stepMs: 50 });

    expect(consumeFrame(stepper, 16)).toBe(0);
    expect(consumeFrame(stepper, 16)).toBe(0);
    expect(consumeFrame(stepper, 16)).toBe(0);
    expect(consumeFrame(stepper, 16)).toBe(1);
    expect(stepper.accumulatorMs).toBeCloseTo(14);
  });

  it("runs several steps in a long frame", () => {
    const stepper = createFixedStepper({ stepMs: 50 });

    expect(consumeFrame(stepper, 175)).toBe(3);
    expect(stepper.accumulatorMs).toBeCloseTo(25);
  });

  it("gives the same number of steps whatever the frame rate", () => {
    const at60 = createFixedStepper();
    const at144 = createFixedStepper();
    let steps60 = 0;
    let steps144 = 0;

    for (let frame = 0; frame < 600; frame += 1) steps60 += consumeFrame(at60, 1000 / 60);
    for (let frame = 0; frame < 1440; frame += 1) steps144 += consumeFrame(at144, 1000 / 144);

    expect(steps60).toBe(10 * TICKS_PER_SECOND);
    expect(Math.abs(steps144 - steps60)).toBeLessThanOrEqual(1);
  });

  it("caps a frame at maxFrameMs so a long pause does not trigger a burst of steps", () => {
    const stepper = createFixedStepper({ stepMs: 50, maxFrameMs: 250 });

    expect(consumeFrame(stepper, 60_000)).toBe(5);
    expect(stepper.accumulatorMs).toBe(0);
  });

  it("scales time before stepping", () => {
    const fast = createFixedStepper({ stepMs: 50, timeScale: 4 });
    const slow = createFixedStepper({ stepMs: 50, timeScale: 0.5 });

    expect(consumeFrame(fast, 100)).toBe(8);
    expect(consumeFrame(slow, 100)).toBe(1);
  });

  it("caps the real frame time, not the scaled one, so fast time stays fast", () => {
    const stepper = createFixedStepper({ stepMs: 50, maxFrameMs: 250, timeScale: 60 });

    expect(consumeFrame(stepper, 1000)).toBe(300);
  });

  it("does not step or accumulate while paused", () => {
    const stepper = createFixedStepper({ stepMs: 50 });
    consumeFrame(stepper, 30);
    stepper.paused = true;

    expect(consumeFrame(stepper, 500)).toBe(0);
    expect(stepper.accumulatorMs).toBe(30);

    stepper.paused = false;
    expect(consumeFrame(stepper, 20)).toBe(1);
  });

  it.each([0, -16, Number.NaN, Number.POSITIVE_INFINITY])("ignores the invalid frame time %s", (elapsed) => {
    const stepper = createFixedStepper({ stepMs: 50 });

    expect(consumeFrame(stepper, elapsed)).toBe(0);
    expect(stepper.accumulatorMs).toBe(0);
  });
});

describe("getInterpolationAlpha", () => {
  it("is the fraction of the next step already elapsed", () => {
    const stepper = createFixedStepper({ stepMs: 50 });

    expect(getInterpolationAlpha(stepper)).toBe(0);
    consumeFrame(stepper, 60);
    expect(getInterpolationAlpha(stepper)).toBeCloseTo(0.2);
  });
});

describe("setTimeScale", () => {
  it("changes the speed of time; zero freezes it", () => {
    const stepper = createFixedStepper({ stepMs: 50 });

    setTimeScale(stepper, 0);
    expect(consumeFrame(stepper, 100)).toBe(0);

    setTimeScale(stepper, 2);
    expect(consumeFrame(stepper, 100)).toBe(4);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects the invalid scale %s", (scale) => {
    const stepper = createFixedStepper();

    expect(() => setTimeScale(stepper, scale)).toThrow(RangeError);
    expect(stepper.timeScale).toBe(1);
  });
});
