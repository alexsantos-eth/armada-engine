import { setup, transition } from "xstate";
import type { PlayerMotionType } from "../../types";

/** Events produced by the deterministic player step and consumed by its motion machine. */
export type PlayerMotionEvent =
  | { readonly type: "WALK" }
  | { readonly type: "RUN" }
  | { readonly type: "SKID" }
  | { readonly type: "STOP" }
  | { readonly type: "JUMP" }
  | { readonly type: "FALL" }
  | { readonly type: "LAND_IDLE" }
  | { readonly type: "LAND_WALKING" }
  | { readonly type: "LAND_RUNNING" }
  | { readonly type: "LAND_SKIDDING" }
  | { readonly type: "CLIMB" }
  | { readonly type: "CLIMB_TICK" }
  | { readonly type: "CLIMB_DONE_IDLE" }
  | { readonly type: "CLIMB_DONE_WALKING" };

/** Transitions out of every state on the ground: idle, walking, running and skidding. */
const GROUND = {
  WALK: "walking",
  RUN: "running",
  SKID: "skidding",
  STOP: "idle",
  JUMP: "jumping",
  FALL: "falling",
  CLIMB: "climbing",
} as const;

/** Transitions out of the air, jumping or falling. */
const AIR = {
  FALL: "falling",
  LAND_IDLE: "idle",
  LAND_WALKING: "walking",
  LAND_RUNNING: "running",
  LAND_SKIDDING: "skidding",
  CLIMB: "climbing",
} as const;

/** XState machine describing valid player locomotion transitions. */
export const playerMotionMachine = setup({
  types: {
    events: {} as PlayerMotionEvent,
  },
}).createMachine({
  id: "player-motion",
  initial: "idle",
  states: {
    idle: { on: GROUND },
    walking: { on: GROUND },
    running: { on: GROUND },
    skidding: { on: GROUND },
    jumping: { on: { JUMP: "jumping", ...AIR } },
    falling: { on: AIR },
    climbing: {
      on: { CLIMB_TICK: "climbing", CLIMB_DONE_IDLE: "idle", CLIMB_DONE_WALKING: "walking" },
    },
  },
});

/** Applies one event through XState's pure transition API and returns the resulting state key. */
export function transitionPlayerMotion(state: PlayerMotionType, event: PlayerMotionEvent): PlayerMotionType {
  const snapshot = playerMotionMachine.resolveState({ value: state });
  const [next] = transition(playerMotionMachine, snapshot, event);
  return next.value;
}
