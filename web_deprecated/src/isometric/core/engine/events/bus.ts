import type { EventBus, EventListener, EventMap } from "../../types";

type AnyListener = EventListener<never>;

/**
 * Creates a typed event bus, the channel game systems use to talk to each other without
 * importing each other. It holds listeners only (functions, never game state), so it is not
 * part of a save: the world is restored from its snapshot and systems subscribe again.
 *
 * @example
 * const events = createEventBus<SimulationEvents>();
 * const stop = events.on("dayChanged", ({ day }) => log(`Day ${day}`));
 * events.emit("dayChanged", { tick: 24000, day: 1 });
 * stop();
 */
export function createEventBus<TEvents extends EventMap>(): EventBus<TEvents> {
  const listeners = new Map<keyof TEvents, AnyListener[]>();

  const off: EventBus<TEvents>["off"] = (type, listener) => {
    const current = listeners.get(type);
    if (current === undefined) return;
    const next = current.filter((registered) => registered !== listener);
    if (next.length > 0) listeners.set(type, next);
    else listeners.delete(type);
  };

  return {
    on(type, listener) {
      const current = listeners.get(type) ?? [];
      if (!current.includes(listener)) listeners.set(type, [...current, listener]);
      return () => off(type, listener);
    },
    off,
    emit(type, payload) {
      // Arrays are replaced, never mutated, so this snapshot is stable during the emit.
      const current = listeners.get(type) as EventListener<TEvents[typeof type]>[] | undefined;
      current?.forEach((listener) => listener(payload));
    },
    has(type) {
      return listeners.has(type);
    },
    clear(type) {
      if (type === undefined) listeners.clear();
      else listeners.delete(type);
    },
  };
}
