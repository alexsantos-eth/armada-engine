/** Options of a fixed-step accumulator (`createFixedStepper`). */
export type FixedStepperOptions = {
  /** Real milliseconds per simulation step. Defaults to one world tick (`STEP_MS`). */
  stepMs?: number;
  /** Cap on the real time a single frame contributes. Defaults to `DEFAULT_MAX_FRAME_MS`. */
  maxFrameMs?: number;
  /** Game speed multiplier: `1` real time, `0` frozen. Defaults to `1`. */
  timeScale?: number;
};

/**
 * Fixed-step accumulator state. Pure data: the simulation reads and updates it with
 * `consumeFrame()`, `setTimeScale()` and by toggling `paused`.
 */
export type FixedStepper = {
  /** Real milliseconds per simulation step. */
  readonly stepMs: number;
  /** Cap on the real time a single frame contributes. */
  readonly maxFrameMs: number;
  /** Game speed multiplier; change it with `setTimeScale()`. */
  timeScale: number;
  /** While `true`, frames run no steps and accumulate nothing. */
  paused: boolean;
  /** Scaled milliseconds waiting to become a step, in `[0, stepMs)`. */
  accumulatorMs: number;
};

/** What one rendered frame did to the simulation. */
export type SimulationFrame = {
  /** Simulation steps (world ticks) run in this frame. */
  readonly steps: number;
  /** Fraction of the next step already elapsed, for render interpolation. */
  readonly alpha: number;
  /** World tick after this frame. */
  readonly tick: number;
};

/** Simulation loop of a world (`createSimulation`). */
export type Simulation<TWorld> = {
  /** The simulated world. */
  readonly world: TWorld;
  /** Accumulator state: pause it or change its speed here. */
  readonly stepper: FixedStepper;
  /** Feeds one rendered frame's real elapsed milliseconds and runs the due steps. */
  frame(elapsedMs: number): SimulationFrame;
};
