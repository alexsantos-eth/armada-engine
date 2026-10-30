import { Circle, Container, type FederatedPointerEvent, Graphics, type Rectangle } from "pixi.js";
import type { PointerCancelSource } from "../core/engine";
import type { ScreenDirections } from "../core/types";
import { getJoystickInput, getTouchLayout } from "../input";

/** What the touch controls drive: the player's walk, run and jumps (as the keyboard does). */
export type TouchControls = {
  /** The screen directions the joystick holds, on every change; all `false` when it is let go. */
  readonly walk: (directions: ScreenDirections) => void;
  /** Whether the joystick is pushed to its rim, on every change. */
  readonly run: (held: boolean) => void;
  /** One jump, on each press of the jump button. */
  readonly jump: () => void;
  /** Whether the jump button is held (a held jump flies with a jetpack). */
  readonly jumpHeld: (held: boolean) => void;
};

/** The renderer the controls are laid out on: its screen, and its `resize` event. */
export type TouchRenderer = {
  readonly screen: Rectangle;
  on(event: "resize", listener: () => void): unknown;
  off(event: "resize", listener: () => void): unknown;
};

/** The joystick's hit area, as a multiple of its radius: a thumb that lands a little off still takes it. */
const JOYSTICK_HIT_SCALE = 1.5;
/** The jump button's hit area, as a multiple of its radius. */
const JUMP_HIT_SCALE = 1.3;

const BASE_STYLE = { color: 0x000000, alpha: 0.28 } as const;
const RIM_STYLE = { width: 2, color: 0xffffff, alpha: 0.45 } as const;
const KNOB_STYLE = { color: 0xffffff, alpha: 0.7 } as const;
/** The jump button's alpha at rest and while held. */
const JUMP_ALPHA = { rest: 0.75, held: 1 } as const;

/**
 * Puts a virtual joystick and a jump button over the game, for phones and tablets: drawn with
 * Pixi `Graphics` on a container on top of `stage` and driven by Pixi's federated pointer events,
 * which tell each finger by its `pointerId`, so the left thumb walks while the right one jumps.
 * A finger that starts on a control stops there (`stopPropagation()`): the stage never sees it
 * and the camera does not pan under the thumb; other fingers still drag and pinch the camera.
 *
 * The joystick snaps to eight directions (`getJoystickInput()`) and runs past its run zone; the
 * jump button jumps on press and reports held/released, so a held press flies with a jetpack.
 * The controls are laid out by `getTouchLayout()` and again on every renderer `resize`. Pixi 8.22
 * does not forward `pointercancel`: given `canvas`, a touch the system cancels lets go too.
 * Returns a function that removes them and lets go of whatever they held.
 */
export function bindTouchControls(
  stage: Container,
  renderer: TouchRenderer,
  controls: TouchControls,
  canvas?: PointerCancelSource,
): () => void {
  const root = new Container({ label: "touch-controls" });
  const joystick = new Container({ label: "joystick" });
  const base = new Graphics();
  const knob = new Graphics();
  const jump = new Graphics({ label: "jump" });
  joystick.addChild(base, knob);
  root.addChild(joystick, jump);
  joystick.eventMode = "static";
  jump.eventMode = "static";

  let radius = 0;
  let stick: number | undefined;
  let jumper: number | undefined;
  let held: { directions: ScreenDirections; run: boolean } | undefined;

  const layout = () => {
    const { width, height } = renderer.screen;
    const at = getTouchLayout(width, height);
    radius = at.joystick.radius;
    joystick.position.set(at.joystick.centre.x, at.joystick.centre.y);
    joystick.hitArea = new Circle(0, 0, radius * JOYSTICK_HIT_SCALE);
    base.clear().circle(0, 0, radius).fill(BASE_STYLE).stroke(RIM_STYLE);
    knob
      .clear()
      .circle(0, 0, radius * 0.45)
      .fill(KNOB_STYLE);
    const r = at.jump.radius;
    jump.position.set(at.jump.centre.x, at.jump.centre.y);
    jump.hitArea = new Circle(0, 0, r * JUMP_HIT_SCALE);
    jump
      .clear()
      .circle(0, 0, r)
      .fill(BASE_STYLE)
      .stroke(RIM_STYLE)
      .poly([0, -r * 0.45, r * 0.4, r * 0.15, -r * 0.4, r * 0.15])
      .fill(KNOB_STYLE);
    jump.alpha = jumper === undefined ? JUMP_ALPHA.rest : JUMP_ALPHA.held;
  };

  const steer = (event: FederatedPointerEvent) => {
    const input = getJoystickInput(
      { x: event.global.x - joystick.position.x, y: event.global.y - joystick.position.y },
      radius,
    );
    knob.position.set(input.knob.x, input.knob.y);
    const { directions, run } = input;
    const was = held?.directions;
    if (
      !was ||
      was.up !== directions.up ||
      was.down !== directions.down ||
      was.left !== directions.left ||
      was.right !== directions.right
    ) {
      controls.walk(directions);
    }
    if (held?.run !== run) controls.run(run);
    held = { directions, run };
  };
  const releaseStick = () => {
    stick = undefined;
    knob.position.set(0, 0);
    // A finger on the joystick has always steered once (on its way down).
    controls.walk({ up: false, down: false, left: false, right: false });
    if (held?.run) controls.run(false);
    held = undefined;
  };
  const releaseJump = () => {
    jumper = undefined;
    jump.alpha = JUMP_ALPHA.rest;
    controls.jumpHeld(false);
  };

  const onStickDown = (event: FederatedPointerEvent) => {
    event.stopPropagation();
    if (stick !== undefined) return;
    stick = event.pointerId;
    steer(event);
  };
  const onStickMove = (event: FederatedPointerEvent) => {
    if (event.pointerId === stick) steer(event);
  };
  const onJumpDown = (event: FederatedPointerEvent) => {
    event.stopPropagation();
    if (jumper !== undefined) return;
    jumper = event.pointerId;
    jump.alpha = JUMP_ALPHA.held;
    controls.jumpHeld(true);
    controls.jump();
  };
  const onUp = (event: { readonly pointerId: number }) => {
    if (event.pointerId === stick) releaseStick();
    if (event.pointerId === jumper) releaseJump();
  };

  layout();
  stage.addChild(root);
  renderer.on("resize", layout);
  joystick.on("pointerdown", onStickDown);
  joystick.on("globalpointermove", onStickMove);
  joystick.on("pointerup", onUp);
  joystick.on("pointerupoutside", onUp);
  jump.on("pointerdown", onJumpDown);
  jump.on("pointerup", onUp);
  jump.on("pointerupoutside", onUp);
  canvas?.addEventListener("pointercancel", onUp);

  return () => {
    canvas?.removeEventListener("pointercancel", onUp);
    renderer.off("resize", layout);
    if (stick !== undefined) releaseStick();
    if (jumper !== undefined) releaseJump();
    stage.removeChild(root);
    root.destroy({ children: true });
  };
}
