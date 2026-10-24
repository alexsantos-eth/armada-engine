import type { Container, FederatedPointerEvent, FederatedWheelEvent, Rectangle } from "pixi.js";
import { getPinchGesture, getWheelZoomFactor } from "../camera";
import type { SceneCamera, ScreenPoint } from "../../types";

/** What tells the controls that the system cancelled a touch: the canvas (`app.canvas`). */
export type PointerCancelSource = {
  addEventListener(type: "pointercancel", listener: (event: { readonly pointerId: number }) => void): void;
  removeEventListener(type: "pointercancel", listener: (event: { readonly pointerId: number }) => void): void;
};

/**
 * Lets the player move `camera` with the pointer, through Pixi's event system on `stage`:
 * drag with the main button (or a finger) to pan, the wheel to zoom at the cursor, and two
 * fingers to pinch (pan with their midpoint and zoom at it, `getPinchGesture()`). Further
 * fingers wait until one of the first two lifts; a finger left after a pinch keeps dragging.
 * Pixi already sets `touch-action: none` on the canvas, so the browser does not scroll or zoom
 * the page under the gesture. `screen`
 * (the renderer's screen) is the stage's hit area, so the whole canvas answers even where no
 * view is. Pixi 8.22 does not forward `pointercancel`: given `canvas`, a touch the system cancels
 * (a gesture of the OS, an incoming call) lifts there too, or it would stay held and the next
 * finger would pinch against it. Returns a function that removes the controls.
 *
 * Only the stage listens: the scene's world container has `eventMode = "none"`, so a pointer
 * move never hit-tests its thousands of views.
 */
export function bindCameraControls(
  stage: Container,
  screen: Rectangle,
  camera: SceneCamera,
  canvas?: PointerCancelSource,
): () => void {
  // Pointers held down on the stage, by id, in the order they went down, at their last point.
  const held = new Map<number, ScreenPoint>();

  const onDown = (event: FederatedPointerEvent) => {
    if (event.button !== 0) return;
    // Pixi reuses `event.global`: copy it.
    held.set(event.pointerId, { x: event.global.x, y: event.global.y });
    stage.cursor = "grabbing";
  };
  const onMove = (event: FederatedPointerEvent) => {
    const from = held.get(event.pointerId);
    if (!from) return;
    const at = { x: event.global.x, y: event.global.y };
    const [first, second] = held.keys();
    if (second === undefined) {
      camera.pan({ x: at.x - from.x, y: at.y - from.y });
    } else if (event.pointerId === first || event.pointerId === second) {
      const before = [held.get(first)!, held.get(second)!] as const;
      const after = event.pointerId === first ? ([at, before[1]] as const) : ([before[0], at] as const);
      const { pan, factor, anchor } = getPinchGesture(before, after);
      camera.pan(pan);
      camera.zoomAt(factor, anchor);
    }
    held.set(event.pointerId, at);
  };
  const onUp = (event: { readonly pointerId: number }) => {
    held.delete(event.pointerId);
    if (held.size === 0) stage.cursor = "grab";
  };
  const onWheel = (event: FederatedWheelEvent) => {
    camera.zoomAt(getWheelZoomFactor(event.deltaY, event.deltaMode), { x: event.global.x, y: event.global.y });
  };

  stage.eventMode = "static";
  stage.hitArea = screen;
  stage.cursor = "grab";
  stage.on("pointerdown", onDown);
  stage.on("globalpointermove", onMove);
  stage.on("pointerup", onUp);
  stage.on("pointerupoutside", onUp);
  stage.on("wheel", onWheel);
  canvas?.addEventListener("pointercancel", onUp);

  return () => {
    canvas?.removeEventListener("pointercancel", onUp);
    stage.off("pointerdown", onDown);
    stage.off("globalpointermove", onMove);
    stage.off("pointerup", onUp);
    stage.off("pointerupoutside", onUp);
    stage.off("wheel", onWheel);
    stage.cursor = "default";
    stage.hitArea = null;
    stage.eventMode = "passive";
  };
}
