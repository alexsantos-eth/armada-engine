import { describe, expect, it, vi } from "vitest";
import { bindKeyboard, bindKeyboardControls, KEYBOARD_ZOOM_STEP, type KeyBinding } from "./keyboard";

type Listener = (event: unknown) => void;

/** A window that records its listeners, so a test can dispatch keyboard events by hand. */
const createTarget = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((type: string, fn: Listener) =>
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
    ),
    removeEventListener: vi.fn((type: string, fn: Listener) => listeners.get(type)?.delete(fn)),
    emit: (type: string, event: unknown = {}) => listeners.get(type)?.forEach((fn) => fn(event)),
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
};

const key = (code: string, modifiers: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => ({
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...modifiers,
  preventDefault: vi.fn(),
});

const setup = () => {
  const target = createTarget();
  const controls = { walk: vi.fn(), zoom: vi.fn() };
  const unbind = bindKeyboardControls(target as never, controls);
  return { target, controls, unbind };
};

const still = { up: false, down: false, left: false, right: false };

describe("bindKeyboardControls", () => {
  it("walks while arrows or WASD are held, combining directions", () => {
    const { target, controls } = setup();

    const up = key("KeyW");
    target.emit("keydown", up);
    expect(controls.walk).toHaveBeenLastCalledWith({ ...still, up: true });
    expect(up.preventDefault).toHaveBeenCalled();

    target.emit("keydown", key("ArrowRight"));
    expect(controls.walk).toHaveBeenLastCalledWith({ ...still, up: true, right: true });

    target.emit("keyup", key("KeyW"));
    expect(controls.walk).toHaveBeenLastCalledWith({ ...still, right: true });
    target.emit("keyup", key("ArrowRight"));
    expect(controls.walk).toHaveBeenLastCalledWith(still);
  });

  it("maps every walking key to its screen direction", () => {
    const { target, controls } = setup();
    const directions = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
    } as const;

    for (const [code, direction] of Object.entries(directions)) {
      target.emit("keydown", key(code));
      expect(controls.walk).toHaveBeenLastCalledWith({ ...still, [direction]: true });
      target.emit("keyup", key(code));
    }
  });

  it("keeps walking while another key of the same direction is held", () => {
    const { target, controls } = setup();

    target.emit("keydown", key("KeyA"));
    target.emit("keydown", key("ArrowLeft"));
    target.emit("keyup", key("KeyA"));
    expect(controls.walk).toHaveBeenLastCalledWith({ ...still, left: true });
  });

  it("zooms in with + and out with −, on the main and numeric keypads", () => {
    const { target, controls } = setup();

    for (const code of ["Equal", "NumpadAdd"]) target.emit("keydown", key(code));
    for (const code of ["Minus", "NumpadSubtract"]) target.emit("keydown", key(code));

    expect(controls.zoom.mock.calls).toEqual([
      [KEYBOARD_ZOOM_STEP],
      [KEYBOARD_ZOOM_STEP],
      [1 / KEYBOARD_ZOOM_STEP],
      [1 / KEYBOARD_ZOOM_STEP],
    ]);
    expect(controls.walk).not.toHaveBeenCalled();
  });

  it("leaves other keys and browser shortcuts alone", () => {
    const { target, controls } = setup();

    const other = key("KeyQ");
    const shortcut = key("Equal", { metaKey: true });
    target.emit("keydown", other);
    target.emit("keydown", shortcut);
    target.emit("keydown", key("KeyW", { ctrlKey: true }));
    target.emit("keydown", key("KeyW", { altKey: true }));
    target.emit("keyup", key("KeyQ"));

    expect(controls.walk).not.toHaveBeenCalled();
    expect(controls.zoom).not.toHaveBeenCalled();
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(shortcut.preventDefault).not.toHaveBeenCalled();
  });

  it("stops walking when the window loses focus", () => {
    const { target, controls } = setup();

    target.emit("keydown", key("KeyD"));
    target.emit("blur");
    expect(controls.walk).toHaveBeenLastCalledWith(still);

    // The key released elsewhere no longer counts.
    controls.walk.mockClear();
    target.emit("keyup", key("KeyD"));
    expect(controls.walk).not.toHaveBeenCalled();
  });

  it("removes every listener", () => {
    const { target, controls, unbind } = setup();

    unbind();
    expect(target.count()).toBe(0);
    target.emit("keydown", key("KeyW"));
    expect(controls.walk).not.toHaveBeenCalled();
  });
});

describe("bindKeyboard", () => {
  it("sends each key to the first binding that lists it, held keys with the rest held of their binding", () => {
    const target = createTarget();
    const first = { kind: "press", keys: ["KeyE"], press: vi.fn() } satisfies KeyBinding;
    const shadowed = { kind: "press", keys: ["KeyE", "KeyR"], press: vi.fn() } satisfies KeyBinding;
    const crouch = {
      kind: "hold",
      keys: ["ShiftLeft", "KeyC"],
      hold: vi.fn<(held: ReadonlySet<string>) => void>(),
    } satisfies KeyBinding;
    bindKeyboard(target as never, [first, shadowed, crouch]);

    const press = key("KeyE");
    target.emit("keydown", press);
    target.emit("keydown", key("KeyR"));
    target.emit("keydown", key("KeyC"));
    target.emit("keydown", key("ShiftLeft"));
    target.emit("keyup", key("KeyC"));
    target.emit("keyup", key("KeyE"));

    expect(first.press).toHaveBeenCalledExactlyOnceWith("KeyE");
    expect(shadowed.press).toHaveBeenCalledExactlyOnceWith("KeyR");
    expect(press.preventDefault).toHaveBeenCalled();
    expect(crouch.hold.mock.calls.map(([held]) => [...held])).toEqual([["KeyC"], ["ShiftLeft", "KeyC"], ["ShiftLeft"]]);
  });

  it("releases every hold binding when the window loses focus", () => {
    const target = createTarget();
    const crouch = {
      kind: "hold",
      keys: ["KeyC"],
      hold: vi.fn<(held: ReadonlySet<string>) => void>(),
    } satisfies KeyBinding;
    const zoom = { kind: "press", keys: ["Equal"], press: vi.fn() } satisfies KeyBinding;
    bindKeyboard(target as never, [crouch, zoom]);

    target.emit("keydown", key("KeyC"));
    target.emit("blur");

    expect([...crouch.hold.mock.lastCall![0]]).toEqual([]);
    expect(zoom.press).not.toHaveBeenCalled();
  });
});
