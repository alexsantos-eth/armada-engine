import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { EventBus } from "../../types";
import { createEventBus } from "./bus";

type TestEvents = {
  ping: { readonly value: number };
  pong: { readonly label: string };
};

describe("createEventBus", () => {
  it("delivers the payload to the listeners of that type only", () => {
    const bus = createEventBus<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on("ping", ping);
    bus.on("pong", pong);

    bus.emit("ping", { value: 3 });

    expect(ping).toHaveBeenCalledExactlyOnceWith({ value: 3 });
    expect(pong).not.toHaveBeenCalled();
  });

  it("does nothing when a type has no listeners", () => {
    const bus = createEventBus<TestEvents>();

    expect(() => bus.emit("ping", { value: 1 })).not.toThrow();
    expect(bus.has("ping")).toBe(false);
  });

  it("calls listeners in subscription order and registers a function once per type", () => {
    const bus = createEventBus<TestEvents>();
    const calls: string[] = [];
    const first = () => calls.push("first");
    bus.on("ping", first);
    bus.on("ping", () => calls.push("second"));
    bus.on("ping", first);

    bus.emit("ping", { value: 0 });

    expect(calls).toEqual(["first", "second"]);
  });

  it("unsubscribes with the returned function or with off, and ignores unknown listeners", () => {
    const bus = createEventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = bus.on("ping", a);
    bus.on("ping", b);

    stopA();
    stopA();
    bus.off("ping", vi.fn());
    bus.off("pong", vi.fn());
    bus.emit("ping", { value: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();

    bus.off("ping", b);
    expect(bus.has("ping")).toBe(false);
  });

  it("applies (un)subscriptions made during an emit to the next emit", () => {
    const bus = createEventBus<TestEvents>();
    const late = vi.fn();
    const removed = vi.fn();
    bus.on("ping", () => {
      bus.on("ping", late);
      bus.off("ping", removed);
    });
    bus.on("ping", removed);

    bus.emit("ping", { value: 1 });
    expect(late).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledOnce();

    bus.emit("ping", { value: 2 });
    expect(late).toHaveBeenCalledExactlyOnceWith({ value: 2 });
    expect(removed).toHaveBeenCalledOnce();
  });

  it("handles events emitted from a listener synchronously, depth first", () => {
    const bus = createEventBus<TestEvents>();
    const calls: string[] = [];
    bus.on("ping", ({ value }) => {
      calls.push(`ping ${String(value)}`);
      bus.emit("pong", { label: "nested" });
      calls.push("ping done");
    });
    bus.on("pong", ({ label }) => calls.push(`pong ${label}`));

    bus.emit("ping", { value: 1 });

    expect(calls).toEqual(["ping 1", "pong nested", "ping done"]);
  });

  it("propagates a listener error to the emitter and skips the remaining listeners", () => {
    const bus = createEventBus<TestEvents>();
    const after = vi.fn();
    bus.on("ping", () => {
      throw new Error("boom");
    });
    bus.on("ping", after);

    expect(() => bus.emit("ping", { value: 1 })).toThrow("boom");
    expect(after).not.toHaveBeenCalled();
  });

  it("clears one type or every type", () => {
    const bus = createEventBus<TestEvents>();
    bus.on("ping", vi.fn());
    bus.on("pong", vi.fn());

    bus.clear("ping");
    expect(bus.has("ping")).toBe(false);
    expect(bus.has("pong")).toBe(true);

    bus.clear();
    expect(bus.has("pong")).toBe(false);
  });

  it("types listeners and payloads by event name", () => {
    const bus = createEventBus<TestEvents>();
    expectTypeOf(bus).toEqualTypeOf<EventBus<TestEvents>>();
    expectTypeOf(bus.emit<"ping">)
      .parameter(1)
      .toEqualTypeOf<{ readonly value: number }>();
    // @ts-expect-error unknown event names are rejected.
    bus.emit("unknown", { value: 1 });
    // @ts-expect-error payloads must match their event.
    bus.emit("ping", { label: "x" });
  });
});
