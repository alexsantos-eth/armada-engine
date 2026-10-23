import { describe, expect, it, vi } from "vitest";
import { getPinchGesture, getWheelZoomFactor } from "../camera";
import { bindCameraControls } from "./controls";

type Listener = (event: unknown) => void;

/** A stage that records its listeners, so a test can dispatch Pixi events by hand. */
const createStage = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    eventMode: "passive",
    hitArea: null as unknown,
    cursor: "default",
    on: vi.fn((type: string, fn: Listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(fn))),
    off: vi.fn((type: string, fn: Listener) => listeners.get(type)?.delete(fn)),
    emit: (type: string, event: unknown) => listeners.get(type)?.forEach((fn) => fn(event)),
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
};

const createCamera = () => ({
  state: { x: 0, y: 0, zoom: 1 },
  pan: vi.fn(),
  zoomAt: vi.fn(),
  resize: vi.fn(),
  follow: vi.fn(),
  update: vi.fn(),
  visibleChunks: vi.fn(() => []),
});

/** Pixi reuses one `global` point per event: the controls must copy it. The mouse is pointer 1. */
const pointer = (x: number, y: number, button = 0, pointerId = 1) => ({ button, pointerId, global: { x, y } });
/** A finger: a touch pointer with its own id, always on the main button. */
const finger = (pointerId: number, x: number, y: number) => pointer(x, y, 0, pointerId);

describe("bindCameraControls", () => {
  it("makes the whole screen answer pointer events", () => {
    const stage = createStage();
    const screen = { x: 0, y: 0, width: 800, height: 600 };

    bindCameraControls(stage as never, screen as never, createCamera());

    expect(stage.eventMode).toBe("static");
    expect(stage.hitArea).toBe(screen);
    expect(stage.cursor).toBe("grab");
  });

  it("pans by the pointer movement while the main button is held", () => {
    const stage = createStage();
    const camera = createCamera();
    bindCameraControls(stage as never, {} as never, camera);

    stage.emit("globalpointermove", pointer(5, 5));
    expect(camera.pan).not.toHaveBeenCalled();

    stage.emit("pointerdown", pointer(100, 100));
    expect(stage.cursor).toBe("grabbing");
    stage.emit("globalpointermove", pointer(110, 95));
    stage.emit("globalpointermove", pointer(130, 95));
    expect(camera.pan.mock.calls).toEqual([[{ x: 10, y: -5 }], [{ x: 20, y: 0 }]]);

    stage.emit("pointerupoutside", pointer(130, 95));
    expect(stage.cursor).toBe("grab");
    stage.emit("globalpointermove", pointer(200, 200));
    expect(camera.pan).toHaveBeenCalledTimes(2);

    stage.emit("pointerdown", pointer(0, 0));
    stage.emit("pointerup", pointer(0, 0));
    stage.emit("globalpointermove", pointer(50, 50));
    expect(camera.pan).toHaveBeenCalledTimes(2);
  });

  it("does not drag with other buttons", () => {
    const stage = createStage();
    const camera = createCamera();
    bindCameraControls(stage as never, {} as never, camera);

    stage.emit("pointerdown", pointer(100, 100, 2));
    stage.emit("globalpointermove", pointer(150, 100));
    expect(camera.pan).not.toHaveBeenCalled();
  });

  it("zooms at the cursor with the wheel", () => {
    const stage = createStage();
    const camera = createCamera();
    bindCameraControls(stage as never, {} as never, camera);

    stage.emit("wheel", { deltaY: -3, deltaMode: 1, global: { x: 300, y: 200 } });
    expect(camera.zoomAt).toHaveBeenCalledWith(getWheelZoomFactor(-3, 1), { x: 300, y: 200 });
  });

  it("pinches with two fingers: pans by their midpoint and zooms at it by their spread", () => {
    const stage = createStage();
    const camera = createCamera();
    bindCameraControls(stage as never, {} as never, camera);

    stage.emit("pointerdown", finger(7, 100, 100));
    stage.emit("pointerdown", finger(8, 200, 100));
    stage.emit("globalpointermove", finger(8, 250, 100));

    const gesture = getPinchGesture(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 100, y: 100 },
        { x: 250, y: 100 },
      ],
    );
    expect(camera.pan.mock.calls).toEqual([[gesture.pan]]);
    expect(camera.zoomAt.mock.calls).toEqual([[gesture.factor, gesture.anchor]]);
    // Pan first, then zoom at the new midpoint: the ground under the fingers stays under them.
    expect(camera.pan.mock.invocationCallOrder[0]).toBeLessThan(camera.zoomAt.mock.invocationCallOrder[0]);
  });

  it("keeps dragging with the finger left after a pinch, from where it is", () => {
    const stage = createStage();
    const camera = createCamera();
    bindCameraControls(stage as never, {} as never, camera);

    stage.emit("pointerdown", finger(7, 100, 100));
    stage.emit("pointerdown", finger(8, 200, 100));
    stage.emit("globalpointermove", finger(7, 120, 100));
    camera.pan.mockClear();
    camera.zoomAt.mockClear();

    stage.emit("pointerup", finger(8, 200, 100));
    expect(stage.cursor).toBe("grabbing");
    stage.emit("globalpointermove", finger(7, 130, 90));
    expect(camera.pan.mock.calls).toEqual([[{ x: 10, y: -10 }]]);
    expect(camera.zoomAt).not.toHaveBeenCalled();

    stage.emit("pointerupoutside", finger(7, 130, 90));
    expect(stage.cursor).toBe("grab");
  });

  it("pinches with the first two fingers only", () => {
    const stage = createStage();
    const camera = createCamera();
    bindCameraControls(stage as never, {} as never, camera);

    stage.emit("pointerdown", finger(7, 100, 100));
    stage.emit("pointerdown", finger(8, 200, 100));
    stage.emit("pointerdown", finger(9, 300, 300));
    stage.emit("globalpointermove", finger(9, 350, 300));
    expect(camera.pan).not.toHaveBeenCalled();
    expect(camera.zoomAt).not.toHaveBeenCalled();

    // Once one of the two lifts, the third finger joins the pinch from where it moved to.
    stage.emit("pointerup", finger(7, 100, 100));
    stage.emit("globalpointermove", finger(9, 350, 200));
    expect(camera.zoomAt).toHaveBeenCalledTimes(1);
    expect(camera.pan.mock.calls).toEqual([[{ x: 0, y: -50 }]]);
  });

  it("removes every listener and restores the stage", () => {
    const stage = createStage();
    const camera = createCamera();
    const unbind = bindCameraControls(stage as never, {} as never, camera);

    unbind();
    expect(stage.count()).toBe(0);
    expect(stage.eventMode).toBe("passive");
    expect(stage.hitArea).toBeNull();
    expect(stage.cursor).toBe("default");
    stage.emit("wheel", { deltaY: 100, deltaMode: 0, global: { x: 0, y: 0 } });
    expect(camera.zoomAt).not.toHaveBeenCalled();
  });
});
