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

const WALKING_KEYS = new Set(Object.values(WALK_KEYS).flat());

/** What the keyboard drives: the player's walk and the camera's zoom. */
export type KeyboardControls = {
  /** The screen directions held now; called on every change, all `false` when none is. */
  walk(directions: ScreenDirections): void;
  /** One zoom step by `factor` (the app picks the anchor, e.g. the centre of the view). */
  zoom(factor: number): void;
};

/** Where the keys are read: the window, in the app. */
export type KeyboardTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * Reads the keyboard on `target` for the game: arrows/WASD walk (held keys, combined), `+`/`−`
 * zoom (main and numeric keypads). Keys with Alt, Ctrl or Meta stay browser shortcuts, and
 * every held key is released when the window loses focus, so the player never walks on alone.
 * The core never reads the keyboard: this is the app's side. Returns a function that unbinds it.
 */
export function bindKeyboardControls(target: KeyboardTarget, controls: KeyboardControls): () => void {
  const held = new Set<string>();
  const holds = (codes: readonly string[]) => codes.some((code) => held.has(code));
  const walk = () =>
    controls.walk({
      up: holds(WALK_KEYS.up),
      down: holds(WALK_KEYS.down),
      left: holds(WALK_KEYS.left),
      right: holds(WALK_KEYS.right),
    });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const zoom = ZOOM_KEYS.get(event.code);
    if (zoom !== undefined) {
      controls.zoom(zoom);
    } else if (WALKING_KEYS.has(event.code)) {
      held.add(event.code);
      walk();
    } else {
      return;
    }
    event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (held.delete(event.code)) walk();
  };
  const release = () => {
    held.clear();
    walk();
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
