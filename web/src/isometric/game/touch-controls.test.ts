import { afterEach, describe, expect, it, vi } from "vitest";
import { getTouchLayout } from "../input";
import { bindTouchControls } from "./touch-controls";

type Listener = (event: unknown) => void;

vi.mock("pixi.js", () => {
  /** A display object that records its listeners, so a test can dispatch Pixi events by hand. */
  class Container {
    label: string;
    children: Container[] = [];
    position = { x: 0, y: 0, set: (x: number, y: number) => Object.assign(this.position, { x, y }) };
    eventMode = "passive";
    hitArea: unknown = null;
    alpha = 1;
    destroyed = false;
    listeners = new Map<string, Set<Listener>>();
    constructor(options: { label?: string } = {}) {
      this.label = options.label ?? "";
    }
    addChild(...children: Container[]) {
      this.children.push(...children);
    }
    removeChild(child: Container) {
      this.children = this.children.filter((other) => other !== child);
    }
    destroy() {
      this.destroyed = true;
    }
    on(type: string, fn: Listener) {
      this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(fn));
    }
    emit(type: string, event: unknown) {
      this.listeners.get(type)?.forEach((fn) => fn(event));
    }
  }
  /** Graphics whose drawing calls chain and are counted. */
  class Graphics extends Container {
    draws = 0;
    clear() {
      this.draws += 1;
      return this;
    }
    circle() {
      return this;
    }
    poly() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
  }
  class Circle {
    readonly radius: number;
    constructor(_x: number, _y: number, radius: number) {
      this.radius = radius;
    }
  }
  return { Container, Graphics, Circle };
});

type MockObject = {
  label: string;
  children: MockObject[];
  position: { x: number; y: number };
  eventMode: string;
  hitArea: { radius: number } | null;
  alpha: number;
  destroyed: boolean;
  draws?: number;
  listeners: Map<string, Set<Listener>>;
  emit(type: string, event: unknown): void;
};

const createRenderer = (width = 400, height = 800) => {
  const listeners = new Set<() => void>();
  return {
    screen: { x: 0, y: 0, width, height },
    on: vi.fn((_: "resize", fn: () => void) => listeners.add(fn)),
    off: vi.fn((_: "resize", fn: () => void) => listeners.delete(fn)),
    resize(w: number, h: number) {
      Object.assign(this.screen, { width: w, height: h });
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
};

const createCanvas = () => {
  const listeners = new Set<(event: { pointerId: number }) => void>();
  return {
    addEventListener: vi.fn((_: "pointercancel", fn: (event: { pointerId: number }) => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: "pointercancel", fn: (event: { pointerId: number }) => void) =>
      listeners.delete(fn),
    ),
    cancel: (pointerId: number) => listeners.forEach((fn) => fn({ pointerId })),
    listeners,
  };
};

const createControls = () => ({ walk: vi.fn(), run: vi.fn(), jump: vi.fn(), jumpHeld: vi.fn() });

/** A pointer event at screen point (`x`, `y`) for finger `pointerId`. */
const finger = (pointerId: number, x: number, y: number) => ({
  pointerId,
  global: { x, y },
  stopPropagation: vi.fn(),
});

const none = { up: false, down: false, left: false, right: false };

const bind = (width?: number, height?: number) => {
  const stage = { children: [] as MockObject[], addChild: vi.fn(), removeChild: vi.fn() };
  stage.addChild.mockImplementation((child: MockObject) => stage.children.push(child));
  const renderer = createRenderer(width, height);
  const canvas = createCanvas();
  const controls = createControls();
  const unbind = bindTouchControls(stage as never, renderer as never, controls, canvas);
  const root = stage.children[0];
  const [joystick, jump] = root.children;
  const knob = joystick.children[1];
  return { stage, renderer, canvas, controls, unbind, root, joystick, jump, knob };
};

afterEach(() => vi.clearAllMocks());

describe("bindTouchControls", () => {
  it("lays a joystick and a jump button over the stage, where getTouchLayout() puts them", () => {
    const { root, joystick, jump } = bind(400, 800);
    const layout = getTouchLayout(400, 800);

    expect(root.label).toBe("touch-controls");
    expect(joystick.position).toMatchObject(layout.joystick.centre);
    expect(jump.position).toMatchObject(layout.jump.centre);
    expect(joystick.eventMode).toBe("static");
    expect(jump.eventMode).toBe("static");
    expect(joystick.hitArea!.radius).toBeGreaterThan(layout.joystick.radius);
    expect(jump.hitArea!.radius).toBeGreaterThan(layout.jump.radius);
  });

  it("walks and runs with the joystick, only on changes, and lets go on lift", () => {
    const { joystick, knob, controls } = bind();
    const { x, y } = joystick.position;
    const down = finger(1, x, y - 30);

    joystick.emit("pointerdown", down);
    expect(down.stopPropagation).toHaveBeenCalled();
    expect(controls.walk).toHaveBeenLastCalledWith({ ...none, up: true });
    expect(controls.run).toHaveBeenLastCalledWith(false);
    expect(knob.position).toMatchObject({ x: 0, y: -30 });

    joystick.emit("globalpointermove", finger(1, x, y - 32));
    expect(controls.walk).toHaveBeenCalledTimes(1);
    expect(controls.run).toHaveBeenCalledTimes(1);

    joystick.emit("globalpointermove", finger(1, x + 500, y));
    expect(controls.walk).toHaveBeenLastCalledWith({ ...none, right: true });
    expect(controls.run).toHaveBeenLastCalledWith(true);

    // Another finger moving elsewhere (a camera drag) does not steer.
    joystick.emit("globalpointermove", finger(2, x - 500, y));
    expect(controls.walk).toHaveBeenCalledTimes(2);

    joystick.emit("pointerupoutside", finger(1, x + 500, y));
    expect(controls.walk).toHaveBeenLastCalledWith(none);
    expect(controls.run).toHaveBeenLastCalledWith(false);
    expect(knob.position).toMatchObject({ x: 0, y: 0 });
  });

  it("keeps the first finger on the joystick and ignores a second one", () => {
    const { joystick, controls } = bind();
    const { x, y } = joystick.position;
    joystick.emit("pointerdown", finger(1, x, y - 30));
    const second = finger(2, x, y + 30);
    joystick.emit("pointerdown", second);
    expect(second.stopPropagation).toHaveBeenCalled();
    expect(controls.walk).toHaveBeenCalledTimes(1);
    joystick.emit("pointerup", finger(2, x, y + 30));
    expect(controls.walk).toHaveBeenCalledTimes(1);
  });

  it("lets go without walking when the finger never left the dead zone… and walks none when it lifts", () => {
    const { joystick, controls } = bind();
    const { x, y } = joystick.position;
    joystick.emit("pointerdown", finger(1, x, y));
    expect(controls.walk).toHaveBeenLastCalledWith(none);
    joystick.emit("pointerup", finger(1, x, y));
    expect(controls.walk).toHaveBeenCalledTimes(2);
    expect(controls.run).toHaveBeenCalledTimes(1);
  });

  it("jumps on press, reports the button held and released, and shows it pressed", () => {
    const { jump, controls } = bind();
    const press = finger(3, jump.position.x, jump.position.y);
    const rest = jump.alpha;

    jump.emit("pointerdown", press);
    expect(press.stopPropagation).toHaveBeenCalled();
    expect(controls.jumpHeld).toHaveBeenLastCalledWith(true);
    expect(controls.jump).toHaveBeenCalledTimes(1);
    expect(jump.alpha).toBeGreaterThan(rest);

    jump.emit("pointerdown", finger(4, jump.position.x, jump.position.y));
    expect(controls.jump).toHaveBeenCalledTimes(1);

    jump.emit("pointerup", finger(3, 0, 0));
    expect(controls.jumpHeld).toHaveBeenLastCalledWith(false);
    expect(jump.alpha).toBe(rest);

    jump.emit("pointerdown", press);
    jump.emit("pointerupoutside", finger(3, 0, 0));
    expect(controls.jump).toHaveBeenCalledTimes(2);
    expect(controls.jumpHeld).toHaveBeenCalledTimes(4);
  });

  it("walks and jumps with two thumbs at once", () => {
    const { joystick, jump, controls } = bind();
    joystick.emit("pointerdown", finger(1, joystick.position.x - 40, joystick.position.y));
    jump.emit("pointerdown", finger(2, jump.position.x, jump.position.y));
    jump.emit("pointerup", finger(2, 0, 0));
    expect(controls.walk).toHaveBeenLastCalledWith({ ...none, left: true });
    expect(controls.jump).toHaveBeenCalledTimes(1);
    joystick.emit("globalpointermove", finger(1, joystick.position.x, joystick.position.y + 40));
    expect(controls.walk).toHaveBeenLastCalledWith({ ...none, down: true });
  });

  it("lets go of what a touch the system cancels held", () => {
    const { joystick, jump, canvas, controls } = bind();
    joystick.emit("pointerdown", finger(1, joystick.position.x + 40, joystick.position.y));
    jump.emit("pointerdown", finger(2, jump.position.x, jump.position.y));
    canvas.cancel(1);
    canvas.cancel(2);
    expect(controls.walk).toHaveBeenLastCalledWith(none);
    expect(controls.jumpHeld).toHaveBeenLastCalledWith(false);
  });

  it("lays itself out again when the renderer resizes, keeping a held button pressed", () => {
    const { renderer, joystick, jump, knob } = bind(400, 800);
    jump.emit("pointerdown", finger(2, jump.position.x, jump.position.y));
    const alpha = jump.alpha;
    const draws = knob.draws!;
    renderer.resize(800, 400);
    const layout = getTouchLayout(800, 400);
    expect(joystick.position).toMatchObject(layout.joystick.centre);
    expect(jump.position).toMatchObject(layout.jump.centre);
    expect(knob.draws).toBe(draws + 1);
    expect(jump.alpha).toBe(alpha);
  });

  it("removes itself, lets go of what it held and stops listening when unbound", () => {
    const { stage, root, renderer, canvas, joystick, jump, controls, unbind } = bind();
    joystick.emit("pointerdown", finger(1, joystick.position.x + 500, joystick.position.y));
    jump.emit("pointerdown", finger(2, jump.position.x, jump.position.y));

    unbind();

    expect(controls.walk).toHaveBeenLastCalledWith(none);
    expect(controls.run).toHaveBeenLastCalledWith(false);
    expect(controls.jumpHeld).toHaveBeenLastCalledWith(false);
    expect(stage.removeChild).toHaveBeenCalledWith(root);
    expect(root.destroyed).toBe(true);
    expect(renderer.listeners.size).toBe(0);
    expect(canvas.listeners.size).toBe(0);
  });

  it("lets go of nothing when unbound idle", () => {
    const { controls, unbind } = bind();
    unbind();
    expect(controls.walk).not.toHaveBeenCalled();
    expect(controls.jumpHeld).not.toHaveBeenCalled();
  });
});
