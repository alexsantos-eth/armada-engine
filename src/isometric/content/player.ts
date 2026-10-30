import type { PlayerAppearance, PlayerIdleDance, PlayerWalkSheet } from "../core/types";

/*
 * Game content: how the player character looks. The engine receives it through
 * `createIsometricScene(app, world, { player: PLAYER_APPEARANCE })`.
 */

/**
 * Size the player is drawn at against its tile. The figure fills its tile; a one-block house fills
 * it with its walls and puts its roof on top, so at this size the player reaches about its eaves.
 */
export const PLAYER_SCALE = 0.75;

/**
 * The player walking: `walk.svg`, made by `artifacts/player_walk.py` from `monkey.py`'s voxel
 * clay monkey (its `data-cell`, `data-gap` and `data-frames` are the numbers below). Eight poses per
 * cycle and a cycle every 1.4 columns: at `PLAYER_SPEED` (3 columns per second) about two cycles,
 * four steps, a second.
 */
export const PLAYER_WALK: PlayerWalkSheet = {
  source: "/assets/player/walk.svg",
  canvas: { width: 1024, height: 853 },
  cell: { x: 313, y: 271, width: 398, height: 399 },
  gap: 48,
  frames: 8,
  stride: 1.4,
  // In the air without the jump sheet: the pose with the legs furthest apart, a leap.
  airPose: 3,
  // Standing still: `idle.svg`, made by `artifacts/player_idle.py` in this sheet's window: the monkey
  // dancing, a cycle every two beats of `PLAYER_DANCE` (keep `period` at twice its `beat`). Its weight
  // lands on one foot and then the other; the free foot taps up and the arm on its side pumps up.
  idle: { source: "/assets/player/idle.svg", frames: 8, period: 900 },
  // Climbing onto a higher top: `climb.svg`, made by `artifacts/player_climb.py` in this sheet's
  // window (9 columns, the most under 4 096 px). It grabs the edge with one hand and swings on it like a
  // pendulum, back and then forward, wider each time; then pushes down on that hand and stands up.
  climb: { source: "/assets/player/climb.svg", frames: 9 },
  // Jumping: `jump.svg`, made by `artifacts/player_jump.py` in this sheet's window. Crouched and arms
  // back to take off, stretched up rising, legs tucked at the apex, arms up falling, crouched landing;
  // the body squashes and stretches with it.
  jump: { source: "/assets/player/jump.svg", poses: { takeoff: 0, rise: 1, apex: 2, fall: 3, landing: 4 } },
};

/**
 * The monkey dancing while it stands still, on top of its idle sheet (`PLAYER_WALK.idle`, a cycle
 * every two beats): a beat every 450 ms (about 133 per minute), its weight landing on one foot and
 * then the other, leaning about 5° over it and dipping 7 % on each beat.
 */
export const PLAYER_DANCE: PlayerIdleDance = { beat: 450, lean: 0.09, bounce: 0.07 };

/**
 * The player character: a one-tile voxel-clay monkey (brown fur, big toon eyes, a red scarf) drawn
 * at {@link PLAYER_SCALE} of its tile so it stands a little shorter than a one-block house, walking with {@link PLAYER_WALK}'s poses in
 * eight facings and dancing with {@link PLAYER_DANCE} while it stands still; `block.svg` is the still
 * figure, drawn if the sheet cannot be loaded.
 */
export const PLAYER_APPEARANCE: PlayerAppearance = {
  textureSource: "/assets/player/block.svg",
  height: 1,
  scale: PLAYER_SCALE,
  walk: PLAYER_WALK,
  dance: PLAYER_DANCE,
};
