import { describe, expect, it } from "vitest";
import { getJoystickInput, getTouchLayout, JOYSTICK_DEAD_ZONE, JOYSTICK_RUN_ZONE } from "./touch";

const none = { up: false, down: false, left: false, right: false };

describe("getJoystickInput", () => {
  it("does nothing inside the dead zone, but still moves the knob", () => {
    const input = getJoystickInput({ x: 0, y: -(JOYSTICK_DEAD_ZONE * 100 - 1) }, 100);
    expect(input.directions).toEqual(none);
    expect(input.run).toBe(false);
    expect(input.knob).toEqual({ x: 0, y: -(JOYSTICK_DEAD_ZONE * 100 - 1) });
  });

  it("snaps to the nearest of eight screen directions, up being screen up", () => {
    const at = (degrees: number) => {
      const angle = (degrees * Math.PI) / 180;
      return getJoystickInput({ x: Math.cos(angle) * 50, y: -Math.sin(angle) * 50 }, 100).directions;
    };
    expect(at(0)).toEqual({ ...none, right: true });
    expect(at(20)).toEqual({ ...none, right: true });
    expect(at(45)).toEqual({ ...none, up: true, right: true });
    expect(at(90)).toEqual({ ...none, up: true });
    expect(at(135)).toEqual({ ...none, up: true, left: true });
    expect(at(180)).toEqual({ ...none, left: true });
    expect(at(225)).toEqual({ ...none, down: true, left: true });
    expect(at(270)).toEqual({ ...none, down: true });
    expect(at(315)).toEqual({ ...none, down: true, right: true });
    expect(at(-10)).toEqual({ ...none, right: true });
  });

  it("runs from the run zone and keeps the knob inside the rim", () => {
    expect(getJoystickInput({ x: JOYSTICK_RUN_ZONE * 100 - 1, y: 0 }, 100).run).toBe(false);
    const rim = getJoystickInput({ x: 300, y: 400 }, 100);
    expect(rim.run).toBe(true);
    expect(rim.knob.x).toBeCloseTo(60);
    expect(rim.knob.y).toBeCloseTo(80);
  });
});

describe("getTouchLayout", () => {
  it("puts the joystick bottom left and the smaller jump button bottom right, on one line", () => {
    const { joystick, jump } = getTouchLayout(390, 844);
    expect(joystick.radius).toBeCloseTo(390 * 0.14);
    expect(joystick.centre.x).toBeCloseTo(joystick.radius * 1.6);
    expect(joystick.centre.y).toBeCloseTo(844 - joystick.radius * 1.6);
    expect(jump.radius).toBeLessThan(joystick.radius);
    expect(jump.centre.y).toBe(joystick.centre.y);
    expect(jump.centre.x).toBeGreaterThan(390 / 2);
    expect(jump.centre.x + jump.radius).toBeLessThan(390);
  });

  it("keeps the controls a thumb's size on small and large screens", () => {
    expect(getTouchLayout(200, 200).joystick.radius).toBe(44);
    expect(getTouchLayout(2000, 1200).joystick.radius).toBe(72);
  });
});
