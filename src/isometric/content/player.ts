import type { PlayerAppearance } from "../core/types";

/*
 * Game content: how the player character looks. The engine receives it through
 * `createIsometricScene(app, world, { player: PLAYER_APPEARANCE })`.
 */

/** The player character: a one-tile voxel-clay figure, static (no animations yet). */
export const PLAYER_APPEARANCE: PlayerAppearance = {
  textureSource: "/assets/player/block.svg",
  height: 1,
};
