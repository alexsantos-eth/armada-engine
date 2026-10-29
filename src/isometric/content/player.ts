import type { PlayerAppearance, PlayerWalkSheet } from "../core/types";

/*
 * Game content: how the player character looks. The engine receives it through
 * `createIsometricScene(app, world, { player: PLAYER_APPEARANCE })`.
 */

/**
 * Size the player is drawn at against its tile. The figure fills its tile; a one-block house fills
 * it with its walls and puts its roof on top, so at this size the player reaches about its eaves.
 */
export const PLAYER_SCALE = 0.6;

/**
 * The player walking: `walk.svg`, made by `Claude outputs/player_walk.py` from `player.py`'s figure
 * (its `data-cell`, `data-gap` and `data-frames` are the numbers below). Eight poses per cycle and
 * a cycle every 1.4 columns: at `PLAYER_SPEED` (3 columns per second) about two cycles, four steps,
 * a second.
 */
export const PLAYER_WALK: PlayerWalkSheet = {
  source: "/assets/player/walk.svg",
  canvas: { width: 1024, height: 853 },
  cell: { x: 312, y: 186, width: 400, height: 462 },
  gap: 48,
  frames: 8,
  stride: 1.4,
  // In the air without the jump sheet: the pose with the legs furthest apart, a leap.
  airPose: 3,
  // Standing still: `idle.svg`, made by `Claude outputs/player_idle.py` in this sheet's window. Every
  // 3.2 s it breathes twice (the chest growing, the head and arms rising) and looks to one side and
  // then the other, leaning a little that way.
  idle: { source: "/assets/player/idle.svg", frames: 8, period: 3200 },
  // Climbing onto a higher top: `climb.svg`, made by `Claude outputs/player_climb.py` in this sheet's
  // window. It reaches up, pulls itself up, puts a knee on the top, pushes on its hands and stands.
  climb: { source: "/assets/player/climb.svg", frames: 6 },
  // Jumping: `jump.svg`, made by `artifacts/player_jump.py` in this sheet's window. Crouched and arms
  // back to take off, stretched up rising, legs tucked at the apex, arms up falling, crouched landing.
  jump: { source: "/assets/player/jump.svg", poses: { takeoff: 0, rise: 1, apex: 2, fall: 3, landing: 4 } },
};

/**
 * The player character: a one-tile voxel-clay figure drawn at {@link PLAYER_SCALE} of its tile so
 * it stands a little shorter than a one-block house, walking with {@link PLAYER_WALK}'s poses in
 * eight facings; `block.svg` is the still figure, drawn if the sheet cannot be loaded.
 */
export const PLAYER_APPEARANCE: PlayerAppearance = {
  textureSource: "/assets/player/block.svg",
  height: 1,
  scale: PLAYER_SCALE,
  walk: PLAYER_WALK,
};
