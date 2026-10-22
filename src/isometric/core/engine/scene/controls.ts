import type { Container, FederatedPointerEvent, FederatedWheelEvent, Rectangle } from "pixi.js";
import { getWheelZoomFactor } from "../camera";
import type { ScreenPoint } from "../../types";
import type { SceneCamera } from "./camera";

/**
 * Lets the player move `camera` with the pointer, through Pixi's event system on `stage`:
 * drag with the main button (or a finger) to pan, and the wheel to zoom at the cursor. `screen`
 * (the renderer's screen) is the stage's hit area, so the whole canvas answers even where no
 * view is. Returns a function that removes the controls.
 *
 * Only the stage listens: the scene's world container has `eventMode = "none"`, so a pointer
 * move never hit-tests its thousands of views.
 */
export function bindCameraControls(stage: Container, screen: Rectangle, camera: SceneCamera): () => void {
  let dragFrom: ScreenPoint | undefined;

  const onDown = (event: FederatedPointerEvent) => {
    if (event.button !== 0) return;
    dragFrom = { x: event.global.x, y: event.global.y };
    stage.cursor = "grabbing";
  };
  const onMove = (event: FederatedPointerEvent) => {
    if (!dragFrom) return;
    // Pixi reuses `event.global`: copy it.
    const at = { x: event.global.x, y: event.global.y };
    camera.pan({ x: at.x - dragFrom.x, y: at.y - dragFrom.y });
    dragFrom = at;
  };
  const onUp = () => {
    dragFrom = undefined;
    stage.cursor = "grab";
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

  return () => {
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
