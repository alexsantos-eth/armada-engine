import type { PlayerJumpRejection, PlayerMotionType } from "./player";

/**
 * Typed communication between game systems. A system announces what happened on an event
 * bus; other systems subscribe to it instead of calling or reading each other directly.
 */

/** Map from event name to the payload it carries. Payloads are plain, read-only data. */
export type EventMap = Record<string, object>;

/** Function called with the payload of one event. */
export type EventListener<TPayload> = (payload: TPayload) => void;

/** Removes the listener it was returned for. Calling it more than once does nothing. */
export type Unsubscribe = () => void;

/**
 * Synchronous, typed publish/subscribe channel (`createEventBus`). Pure domain object: no
 * timers and no queues, so an event is handled inside the simulation step that emits it and
 * the same steps always produce the same calls in the same order.
 */
export type EventBus<TEvents extends EventMap> = {
  /**
   * Subscribes `listener` to `type`. Listeners run in subscription order. Subscribing the same
   * function twice to the same type registers it once.
   */
  on<TType extends keyof TEvents>(type: TType, listener: EventListener<TEvents[TType]>): Unsubscribe;
  /** Removes `listener` from `type`; unknown listeners are ignored. */
  off<TType extends keyof TEvents>(type: TType, listener: EventListener<TEvents[TType]>): void;
  /**
   * Calls every listener of `type`, in subscription order, with `payload`. The listeners are
   * the ones subscribed when the emit starts: (un)subscribing during an emit applies to the
   * next one. A listener that throws stops the emit and the error propagates to the emitter.
   */
  emit<TType extends keyof TEvents>(type: TType, payload: TEvents[TType]): void;
  /** Whether `type` has at least one listener; lets emitters skip building unused payloads. */
  has(type: keyof TEvents): boolean;
  /** Removes every listener of `type`, or of every type when `type` is omitted. */
  clear(type?: keyof TEvents): void;
};

/** Events the simulation emits while it advances the world, one simulation tick at a time. */
export type SimulationEvents = {
  /** A simulation tick finished; `tick` is the world tick after it. */
  tick: { readonly tick: number };
  /** The world clock entered a new hour (minute `0`). */
  hourChanged: { readonly tick: number; readonly day: number; readonly hour: number };
  /** The world clock entered a new day (00:00). Emitted after `hourChanged` of hour `0`. */
  dayChanged: { readonly tick: number; readonly day: number };
  /**
   * The player took off; `feet` is the world height of its feet as it jumped, and `air` whether it
   * jumped in the air (a double jump) rather than from the ground.
   */
  playerJumped: { readonly x: number; readonly y: number; readonly feet: number; readonly air: boolean };
  /** The player landed after a jump or a fall, its feet falling `impact` blocks per tick. */
  playerLanded: { readonly x: number; readonly y: number; readonly feet: number; readonly impact: number };
  /** A jump press did not make the player jump, and why. */
  playerJumpRejected: { readonly reason: PlayerJumpRejection };
  /**
   * The player's locomotion state (its motion machine) changed on this tick, `from` one state `to`
   * another: it started walking, running, skidding, climbing, or stood still.
   */
  playerMotionChanged: { readonly from: PlayerMotionType; readonly to: PlayerMotionType };
};
