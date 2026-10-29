import type { ScreenDirections } from "../core/types";

/** Keys that walk the player, by the screen direction they hold (`KeyboardEvent.code`). */
export const WALK_KEYS: Readonly<Record<keyof ScreenDirections, readonly string[]>> = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
};

/** Keys that make the player jump (`KeyboardEvent.code`). */
export const JUMP_KEYS: readonly string[] = ["Space"];

/**
 * Which keys do what (`KeyboardEvent.code`): walking by screen direction and jumping. The game's
 * defaults are {@link WALK_KEYS} and {@link JUMP_KEYS}; `bindKeyboardControls()` takes another map,
 * whole or in part, so the controls can be configured.
 */
export type KeyMap = Readonly<Record<keyof ScreenDirections | "jump", readonly string[]>>;

/** The default {@link KeyMap}: arrows or WASD walk, the space bar jumps. */
export const DEFAULT_KEY_MAP: KeyMap = { ...WALK_KEYS, jump: JUMP_KEYS };

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
export type KeyBinding = (
  | { readonly kind: "press"; readonly keys: readonly string[]; readonly press: (code: string) => void }
  | { readonly kind: "hold"; readonly keys: readonly string[]; readonly hold: (held: ReadonlySet<string>) => void }
) & { readonly blur?: () => void };

/** Walking: the keys of `keys` held (arrows/WASD by default), combined into the screen directions held now. */
export function walkBinding(
  walk: (directions: ScreenDirections) => void,
  keys: Readonly<Record<keyof ScreenDirections, readonly string[]>> = WALK_KEYS,
): KeyBinding {
  return {
    kind: "hold",
    keys: [...keys.up, ...keys.down, ...keys.left, ...keys.right],
    hold: (held) => {
      const holds = (codes: readonly string[]) => codes.some((code) => held.has(code));
      walk({ up: holds(keys.up), down: holds(keys.down), left: holds(keys.left), right: holds(keys.right) });
    },
  };
}

/** Reports a new jump press and held/released transitions without treating key repeat as another press. */
export function jumpBinding(
  jump: () => void,
  jumpHeld?: (held: boolean) => void,
  cancelJump?: () => void,
  keys: readonly string[] = JUMP_KEYS,
): KeyBinding {
  let wasHeld = false;
  return {
    kind: "hold",
    keys,
    hold: (held) => {
      const isHeld = keys.some((code) => held.has(code));
      if (isHeld === wasHeld) return;
      wasHeld = isHeld;
      jumpHeld?.(isHeld);
      if (isHeld) jump();
    },
    blur: cancelJump,
  };
}

/** Zoom: `+` multiplies the zoom by {@link KEYBOARD_ZOOM_STEP}, `−` divides by it (main and numeric keypads). */
export function zoomBinding(zoom: (factor: number) => void): KeyBinding {
  return { kind: "press", keys: [...ZOOM_KEYS.keys()], press: (code) => zoom(ZOOM_KEYS.get(code) as number) };
}

/** What the keyboard drives: the player's walk and jumps and the camera's zoom. */
export type KeyboardControls = {
  /** The screen directions held now; called on every change, all `false` when none is. */
  readonly walk: (directions: ScreenDirections) => void;
  /** One jump, on each press of the space bar. */
  readonly jump: () => void;
  /** Held state changes, including release on blur. */
  readonly jumpHeld?: (held: boolean) => void;
  /** Clears a queued jump when the window loses focus. */
  readonly cancelJump?: () => void;
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
      if (!event.repeat && !held.has(event.code)) {
        held.add(event.code);
        binding.press(event.code);
      }
    } else {
      if (!event.repeat && !held.has(event.code)) {
        held.add(event.code);
        report(binding);
      }
    }
    event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const binding = bindingOf.get(event.code);
    if (binding && held.delete(event.code)) report(binding);
  };
  const release = () => {
    held.clear();
    bindings.forEach((binding) => {
      report(binding);
      binding.blur?.();
    });
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
 * Reads the keyboard on `target` for the game: the walk keys of `keys` walk (held keys, combined),
 * its jump keys jump, `+`/`−` zoom (main and numeric keypads), with {@link bindKeyboard}. `keys`
 * replaces any entry of {@link DEFAULT_KEY_MAP} (arrows/WASD and the space bar). Returns a function
 * that unbinds it.
 */
export function bindKeyboardControls(
  target: KeyboardTarget,
  controls: KeyboardControls,
  keys: Partial<KeyMap> = {},
): () => void {
  const map = { ...DEFAULT_KEY_MAP, ...keys };
  return bindKeyboard(target, [
    walkBinding(controls.walk, map),
    jumpBinding(controls.jump, controls.jumpHeld, controls.cancelJump, map.jump),
    zoomBinding(controls.zoom),
  ]);
}
