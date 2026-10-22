import { describe, expect, it, vi } from "vitest";
import { getWheelZoomFactor } from "../camera";
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
});

/** Pixi reuses one `global` point per event: the controls must copy it. */
const pointer = (x: number, y: number, button = 0) => ({ button, global: { x, y } });

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
