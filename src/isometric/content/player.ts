import type { PlayerAppearance } from "../core/types";

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
 * The player character: a one-tile voxel-clay figure, static (no animations yet), drawn at
 * {@link PLAYER_SCALE} of its tile so it stands a little shorter than a one-block house.
 */
export const PLAYER_APPEARANCE: PlayerAppearance = {
  textureSource: "/assets/player/block.svg",
  height: 1,
  scale: PLAYER_SCALE,
};
