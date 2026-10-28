import { setup, transition } from "xstate";
import type { PlayerMotionType } from "../../types";

/** Events produced by the deterministic player step and consumed by its motion machine. */
export type PlayerMotionEvent =
  | { readonly type: "WALK" }
  | { readonly type: "STOP" }
  | { readonly type: "JUMP" }
  | { readonly type: "FALL" }
  | { readonly type: "LAND_IDLE" }
  | { readonly type: "LAND_WALKING" }
  | { readonly type: "CLIMB" }
  | { readonly type: "CLIMB_TICK" }
  | { readonly type: "CLIMB_DONE_IDLE" }
  | { readonly type: "CLIMB_DONE_WALKING" };

/** XState machine describing valid player locomotion transitions. */
export const playerMotionMachine = setup({
  types: {
    events: {} as PlayerMotionEvent,
  },
}).createMachine({
  id: "player-motion",
  initial: "idle",
  states: {
    idle: {
      on: { WALK: "walking", JUMP: "jumping", FALL: "falling", CLIMB: "climbing" },
    },
    walking: {
      on: { WALK: "walking", STOP: "idle", JUMP: "jumping", FALL: "falling", CLIMB: "climbing" },
    },
    jumping: {
      on: { JUMP: "jumping", FALL: "falling", LAND_IDLE: "idle", LAND_WALKING: "walking", CLIMB: "climbing" },
    },
    falling: {
      on: { FALL: "falling", LAND_IDLE: "idle", LAND_WALKING: "walking", CLIMB: "climbing" },
    },
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
