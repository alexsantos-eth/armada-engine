import type { Rgb, ShadowProjection } from "../../types";

/** Authored lighting stages, independent of the simulation clock. */
export type LightingPhase = "dawn" | "day" | "sunset" | "night";

/** Cheap presentation controls over the same baked light maps. */
export type PhaseLight = {
  readonly ambient: Rgb;
  readonly shadowStrength: number;
  readonly shadow: ShadowProjection;
};

/** Daylight baseline, light from the upper right. */
export const DAY_SHADOW_PROJECTION: ShadowProjection = {
  dirX: -0.25,
  dirY: Math.sqrt(0.9375),
  stretch: 1.15,
  alpha: 0.34,
};

/** Authored light positions per phase; no relation to the continuously advancing clock. */
export const LIGHTING_PHASES: Readonly<Record<LightingPhase, PhaseLight>> = {
  dawn: {
    ambient: { r: 1, g: 0.86, b: 0.78 },
    shadowStrength: 0.85,
    shadow: { dirX: -0.92, dirY: Math.sqrt(1 - 0.92 ** 2), stretch: 2.2, alpha: 0.34 },
  },
  day: { ambient: { r: 1, g: 1, b: 0.96 }, shadowStrength: 1, shadow: DAY_SHADOW_PROJECTION },
  sunset: {
    ambient: { r: 1, g: 0.73, b: 0.55 },
    shadowStrength: 0.85,
    shadow: { dirX: Math.sqrt(1 - 0.35 ** 2), dirY: -0.35, stretch: 2.2, alpha: 0.34 },
  },
  night: {
    ambient: { r: 0.36, g: 0.44, b: 0.67 },
    shadowStrength: 0.55,
    shadow: { dirX: 0.6, dirY: 0.8, stretch: 0.85, alpha: 0.2 },
  },
};

/** Shared presentation state; only the ambient module advances it, once per frame. */
export type PhaseLighting = {
  readonly current: PhaseLight;
  readonly transitioning: boolean;
  transitionTo(phase: LightingPhase, durationMs?: number): void;
  advance(elapsedMs: number): void;
};

/** Creates a stable day, with interruptible smoothstep transitions explicitly requested by the game. */
export function createPhaseLighting(
  initial: LightingPhase = "day",
  phases: Readonly<Record<LightingPhase, PhaseLight>> = LIGHTING_PHASES,
): PhaseLighting {
  let current = phases[initial];
  let transition: { from: PhaseLight; to: PhaseLight; elapsed: number; duration: number } | undefined;
  return {
    get current() {
      return current;
    },
    get transitioning() {
      return transition !== undefined;
    },
    transitionTo(phase, durationMs = 2000) {
      const to = phases[phase];
      if (to === current) {
        transition = undefined;
        return;
      }
      if (durationMs <= 0) {
        current = to;
        transition = undefined;
      } else transition = { from: current, to, elapsed: 0, duration: durationMs };
    },
    advance(elapsedMs) {
      if (!transition || elapsedMs <= 0) return;
      transition.elapsed = Math.min(transition.duration, transition.elapsed + Math.max(0, elapsedMs));
      const { from, to, elapsed, duration } = transition;
      if (elapsed === duration) {
        current = to;
        transition = undefined;
        return;
      }
      const t = elapsed / duration;
      const amount = t * t * (3 - 2 * t);
      const mix = (a: number, b: number) => a + (b - a) * amount;
      const fromAngle = Math.atan2(from.shadow.dirY, from.shadow.dirX);
      const toAngle = Math.atan2(to.shadow.dirY, to.shadow.dirX);
      const turn = Math.atan2(Math.sin(toAngle - fromAngle), Math.cos(toAngle - fromAngle));
      const angle = fromAngle + turn * amount;
      current = {
        ambient: {
          r: mix(from.ambient.r, to.ambient.r),
          g: mix(from.ambient.g, to.ambient.g),
          b: mix(from.ambient.b, to.ambient.b),
        },
        shadowStrength: mix(from.shadowStrength, to.shadowStrength),
        shadow: {
          dirX: Math.cos(angle),
          dirY: Math.sin(angle),
          stretch: mix(from.shadow.stretch, to.shadow.stretch),
          alpha: mix(from.shadow.alpha, to.shadow.alpha),
        },
      };
    },
  };
}
