import type { ScreenDirections } from "../core/types";

/** Keys that walk the player, by the screen direction they hold (`KeyboardEvent.code`). */
export const WALK_KEYS: Readonly<Record<keyof ScreenDirections, readonly string[]>> = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
};

/** Zoom factor of one press of `+` (`−` divides by it). */
export const KEYBOARD_ZOOM_STEP = 1.25;

/** Keys that zoom, by the factor of one press. */
const ZOOM_KEYS = new Map<string, number>([
  ["Equal", KEYBOARD_ZOOM_STEP],
  ["NumpadAdd", KEYBOARD_ZOOM_STEP],
  ["Minus", 1 / KEYBOARD_ZOOM_STEP],
  ["NumpadSubtract", 1 / KEYBOARD_ZOOM_STEP],
]);

/**
 * What a set of keys does (`KeyboardEvent.code`): a `"press"` binding acts once per key press; a
 * `"hold"` binding is told which of its keys are held every time that changes (and with none
 * when the window loses focus). A new action is a new binding, not a change to the keyboard.
 */
export type KeyBinding =
  | { readonly kind: "press"; readonly keys: readonly string[]; readonly press: (code: string) => void }
  | { readonly kind: "hold"; readonly keys: readonly string[]; readonly hold: (held: ReadonlySet<string>) => void };

/** Walking: arrows/WASD held, combined into the screen directions held now (`WALK_KEYS`). */
export function walkBinding(walk: (directions: ScreenDirections) => void): KeyBinding {
  return {
    kind: "hold",
    keys: Object.values(WALK_KEYS).flat(),
    hold: (held) => {
      const holds = (codes: readonly string[]) => codes.some((code) => held.has(code));
      walk({
        up: holds(WALK_KEYS.up),
        down: holds(WALK_KEYS.down),
        left: holds(WALK_KEYS.left),
        right: holds(WALK_KEYS.right),
      });
    },
  };
}

/** Zoom: `+` multiplies the zoom by {@link KEYBOARD_ZOOM_STEP}, `−` divides by it (main and numeric keypads). */
export function zoomBinding(zoom: (factor: number) => void): KeyBinding {
  return { kind: "press", keys: [...ZOOM_KEYS.keys()], press: (code) => zoom(ZOOM_KEYS.get(code) as number) };
}

/** What the keyboard drives: the player's walk and the camera's zoom. */
export type KeyboardControls = {
  /** The screen directions held now; called on every change, all `false` when none is. */
  readonly walk: (directions: ScreenDirections) => void;
  /** One zoom step by `factor` (the app picks the anchor, e.g. the centre of the view). */
  readonly zoom: (factor: number) => void;
};

/** Where the keys are read: the window, in the app. */
export type KeyboardTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * Reads the keyboard on `target` for `bindings`: each key goes to the first binding that lists it
 * (and its default action is prevented); other keys and those with Alt, Ctrl or Meta stay browser
 * shortcuts. Every held key is released when the window loses focus, so nothing stays held. The
 * core never reads the keyboard: this is the app's side. Returns a function that unbinds it.
 */
export function bindKeyboard(target: KeyboardTarget, bindings: readonly KeyBinding[]): () => void {
  const bindingOf = new Map<string, KeyBinding>();
  bindings.forEach((binding) => binding.keys.forEach((code) => bindingOf.has(code) || bindingOf.set(code, binding)));
  const held = new Set<string>();
  const report = (binding: KeyBinding) => {
    if (binding.kind === "hold") binding.hold(new Set(binding.keys.filter((code) => held.has(code))));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const binding = bindingOf.get(event.code);
    if (binding === undefined) return;
    if (binding.kind === "press") {
      binding.press(event.code);
    } else {
      held.add(event.code);
      report(binding);
    }
    event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const binding = bindingOf.get(event.code);
    if (binding && held.delete(event.code)) report(binding);
  };
  const release = () => {
    held.clear();
    bindings.forEach(report);
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", release);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", release);
  };
}

/**
 * Reads the keyboard on `target` for the game: arrows/WASD walk (held keys, combined), `+`/`−`
 * zoom (main and numeric keypads), with {@link bindKeyboard}. Returns a function that unbinds it.
 */
export function bindKeyboardControls(target: KeyboardTarget, controls: KeyboardControls): () => void {
  return bindKeyboard(target, [walkBinding(controls.walk), zoomBinding(controls.zoom)]);
}
