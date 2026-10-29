import type { GridPoint, PlayerIdleDance, PlayerMotionType } from "../../types";

/**
 * Lean of the body, in radians (head to the right on screen when positive), per column per tick
 * it drifts across the screen: a walk (0.15) leans about 3°, a run (0.25) about 5°.
 */
export const BODY_LEAN_PER_SPEED = 0.35;

/**
 * Lean, in radians, per column per tick² the player speeds up across the screen: it leans into a
 * start and back against a stop (`PLAYER_GROUND_ACCEL` 0.05 → about 3.5°), like a body with weight.
 */
export const BODY_LEAN_PER_ACCEL = 1.2;

/** Most the body ever leans, in radians (about 9°): a stop against a wall leans no further. */
export const BODY_MAX_LEAN = 0.16;

/** Angular frequency of the spring the lean follows its target with, in radians per second. */
export const BODY_LEAN_STIFFNESS = 18;

/** Damping ratio of that spring: under `1`, so a stop overshoots into a short wobble. */
export const BODY_LEAN_DAMPING = 0.45;

/**
 * Footfall bob of the body on the ground, as a share of its height per column per tick it moves: a
 * walk (0.15) bobs 3 %, a run (0.25) 5 %, twice per walk cycle, and it fades as it slows down.
 */
export const BODY_BOB_PER_SPEED = 0.2;

/** Stretch of the body in the air, as a share of its height per block per tick of vertical speed. */
export const BODY_AIR_STRETCH_PER_SPEED = 0.25;

/** Most the body stretches in the air: rising fast or falling far. */
export const BODY_MAX_AIR_STRETCH = 0.12;

/** Stretch of the body halfway through a climb, as it pulls itself up. */
export const BODY_CLIMB_STRETCH = 0.05;

/** Real milliseconds the player stands still before it starts to dance: a short stop does not. */
export const DANCE_DELAY_MS = 300;

/** Real milliseconds its dance takes to grow to its full size once it starts. */
export const DANCE_FADE_MS = 700;

/**
 * How sharply the dance snaps from one foot to the other: `1` sways smoothly, less holds each side
 * longer and crosses faster, a marked step rather than a rocking.
 */
export const DANCE_SNAP = 0.8;

/** Longest step, in real milliseconds, the lean spring takes at once: a long frame takes several. */
const LEAN_STEP_MS = 16;

/** Where the lean is and how fast it turns (radians per second): a spring's state, changed in place. */
export type BodyLean = { angle: number; speed: number };

/**
 * How far across the screen a ground velocity drifts, in columns per tick: right (`+x −y`) is
 * positive, toward or away from the camera (`±(x + y)`) nothing, so only a sideways move leans.
 */
export function getScreenDrift(velocity: GridPoint): number {
  return (velocity.x - velocity.y) / Math.SQRT2;
}

/**
 * The angle the body leans toward (radians, see {@link BodyLean}) moving at `velocity` and speeding
 * up by `acceleration` (columns per tick, and per tick²): forward with its speed, more while it
 * speeds up and back while it brakes, never past {@link BODY_MAX_LEAN}.
 */
export function getLeanTarget(velocity: GridPoint, acceleration: GridPoint): number {
  const target = BODY_LEAN_PER_SPEED * getScreenDrift(velocity) + BODY_LEAN_PER_ACCEL * getScreenDrift(acceleration);
  return Math.max(-BODY_MAX_LEAN, Math.min(BODY_MAX_LEAN, target));
}

/**
 * Moves `lean` toward `target` for `ms` real milliseconds, along a damped spring
 * ({@link BODY_LEAN_STIFFNESS}, {@link BODY_LEAN_DAMPING}), in steps of at most 16 ms so a long
 * frame does not blow it up. Once it rests on a target of `0` it is exactly `0`. Nothing is created.
 */
export function stepBodyLean(lean: BodyLean, target: number, ms: number): void {
  let left = Math.max(0, ms);
  while (left > 0) {
    const dt = Math.min(left, LEAN_STEP_MS) / 1000;
    left -= LEAN_STEP_MS;
    const pull = BODY_LEAN_STIFFNESS ** 2 * (target - lean.angle);
    const drag = 2 * BODY_LEAN_DAMPING * BODY_LEAN_STIFFNESS * lean.speed;
    lean.speed += (pull - drag) * dt;
    lean.angle += lean.speed * dt;
  }
  if (target === 0 && Math.abs(lean.angle) < 1e-4 && Math.abs(lean.speed) < 1e-3) {
    lean.angle = 0;
    lean.speed = 0;
  }
}

/** What the body's shape answers to in a frame ({@link getBodyShape}). */
export type BodyShapeInput = {
  /** Its locomotion state. */
  readonly motion: PlayerMotionType;
  /** Its ground speed, in columns per tick. */
  readonly speed: number;
  /** Columns walked since it set off, and the columns of a walk cycle (two steps). */
  readonly walked: number;
  readonly stride: number;
  /** Its vertical speed in the air, in blocks per tick, if it is in the air. */
  readonly verticalSpeed: number | undefined;
  /** How far through a climb it is (`0`–`1`), if it climbs. */
  readonly climb: number | undefined;
};

/**
 * Scale of the body about its feet for its state, on top of a take-off's stretch and a landing's
 * squash: on the ground a footfall bob with its speed ({@link BODY_BOB_PER_SPEED}), twice per walk
 * cycle and starting from its own shape; in the air stretched with its vertical speed, rising or
 * falling, and its own shape at the apex; climbing, stretched as it pulls itself up. Standing still,
 * `{ x: 1, y: 1 }` (its idle sheet already breathes). Each stretch keeps its volume: as it grows
 * taller it grows thinner by half as much.
 */
export function getBodyShape(input: BodyShapeInput): GridPoint {
  let stretch = 0;
  if (input.climb !== undefined) stretch = BODY_CLIMB_STRETCH * Math.sin(Math.PI * input.climb);
  else if (input.motion === "jumping" || input.motion === "falling")
    stretch = Math.min(BODY_MAX_AIR_STRETCH, BODY_AIR_STRETCH_PER_SPEED * Math.abs(input.verticalSpeed ?? 0));
  else if (input.motion === "walking" && input.stride > 0)
    stretch = BODY_BOB_PER_SPEED * input.speed * Math.sin((4 * Math.PI * input.walked) / input.stride);
  return { x: 1 - stretch / 2, y: 1 + stretch };
}

/** The dance's part of a frame ({@link getIdleDance}): its lean (radians) and the body's scale. */
export type IdleDanceFrame = { readonly lean: number; readonly shape: GridPoint };

/**
 * Where the dance `dance` is after the player has stood still `ms` real milliseconds: nothing for
 * the first {@link DANCE_DELAY_MS}, then growing over {@link DANCE_FADE_MS}. It starts upright between
 * two beats, and its idle sheet's cycle (two beats) starts with it. Half a beat in, its weight lands
 * on the foot to the right of the screen, and a beat later on the left one: on each, the body leans
 * over that foot (`lean`, snapped by {@link DANCE_SNAP}) and dips (`bounce`, wider and shorter);
 * between beats it stands upright and stretched as much. Each dip and stretch keeps its volume, like
 * {@link getBodyShape}.
 */
export function getIdleDance(ms: number, dance: PlayerIdleDance): IdleDanceFrame {
  const since = ms - DANCE_DELAY_MS;
  if (since <= 0) return { lean: 0, shape: { x: 1, y: 1 } };
  const grown = Math.min(1, since / DANCE_FADE_MS);
  const size = grown * grown * (3 - 2 * grown);
  const beats = since / dance.beat;
  const side = Math.sin(Math.PI * beats);
  const lean = size * dance.lean * Math.sign(side) * Math.abs(side) ** DANCE_SNAP;
  const stretch = size * dance.bounce * Math.cos(2 * Math.PI * beats);
  return { lean, shape: { x: 1 - stretch / 2, y: 1 + stretch } };
}

/**
 * How much of a lean to its own sides shows as a lean across the screen for a player turned to
 * facing `facing` of `facings` (a turn of `360° / facings` each, the first to the right of the
 * screen): all of it facing the camera or away from it, about 70 % on a diagonal and none in
 * profile, where a sideways lean would read as a lean forward or back.
 */
export function getSideLeanShare(facing: number, facings: number): number {
  return Math.abs(Math.sin((2 * Math.PI * facing) / facings));
}
