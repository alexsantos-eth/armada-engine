import type { ScreenDirections, ScreenPoint } from "../core/types";

/** Share of the joystick's radius that does nothing: a resting thumb does not walk. */
export const JOYSTICK_DEAD_ZONE = 0.25;

/** Share of the joystick's radius from which the player runs: push the knob to the rim. */
export const JOYSTICK_RUN_ZONE = 0.85;

/** What the joystick asks for: the screen directions held, whether to run and where its knob is drawn. */
export type JoystickInput = {
  /** One of eight screen directions (two held for a diagonal), none inside the dead zone. */
  readonly directions: ScreenDirections;
  /** Whether the knob is pushed past {@link JOYSTICK_RUN_ZONE}. */
  readonly run: boolean;
  /** The knob's offset from the centre: the thumb's, kept inside the radius. */
  readonly knob: ScreenPoint;
};

const NO_DIRECTIONS: ScreenDirections = { up: false, down: false, left: false, right: false };

/**
 * The joystick input for a thumb at `offset` from the joystick's centre (screen pixels, `y` down),
 * for a joystick of `radius`. The direction snaps to the nearest of eight, as the arrow keys do,
 * so walking on a touch screen faces and moves like walking with the keyboard.
 */
export function getJoystickInput(offset: ScreenPoint, radius: number): JoystickInput {
  const distance = Math.hypot(offset.x, offset.y);
  const scale = distance > radius ? radius / distance : 1;
  const knob = { x: offset.x * scale, y: offset.y * scale };
  if (distance < radius * JOYSTICK_DEAD_ZONE) return { directions: NO_DIRECTIONS, run: false, knob };
  // Octants counter-clockwise from right, with up positive: 0 right, 2 up, 4 left, 6 down.
  const octant = (Math.round(Math.atan2(-offset.y, offset.x) / (Math.PI / 4)) + 8) % 8;
  return {
    directions: {
      right: octant === 7 || octant <= 1,
      up: octant >= 1 && octant <= 3,
      left: octant >= 3 && octant <= 5,
      down: octant >= 5,
    },
    run: distance >= radius * JOYSTICK_RUN_ZONE,
    knob,
  };
}

/** Where the touch controls go on a screen: joystick bottom left, jump button bottom right. */
export type TouchLayout = {
  readonly joystick: { readonly centre: ScreenPoint; readonly radius: number };
  readonly jump: { readonly centre: ScreenPoint; readonly radius: number };
};

/** Joystick radius as a share of the screen's shorter side, between the bounds below (CSS pixels). */
const JOYSTICK_SCREEN_SHARE = 0.14;
const JOYSTICK_MIN_RADIUS = 44;
const JOYSTICK_MAX_RADIUS = 72;

/**
 * Lays the touch controls out on a `width` × `height` screen (CSS pixels): the joystick in the
 * bottom-left corner for the left thumb, the jump button, smaller, in the bottom-right one for the
 * right thumb, both a little in from the edges, which phones curve and use for system gestures.
 */
export function getTouchLayout(width: number, height: number): TouchLayout {
  const radius = Math.min(
    JOYSTICK_MAX_RADIUS,
    Math.max(JOYSTICK_MIN_RADIUS, Math.min(width, height) * JOYSTICK_SCREEN_SHARE),
  );
  const margin = radius * 0.6;
  const jumpRadius = radius * 0.6;
  const y = height - margin - radius;
  return {
    joystick: { centre: { x: margin + radius, y }, radius },
    jump: { centre: { x: width - margin - jumpRadius * 1.5, y }, radius: jumpRadius },
  };
}
