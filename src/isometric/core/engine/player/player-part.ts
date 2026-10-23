import type { GridPoint, PlayerState, WorldPart } from "../../types";
import { createPlayer, findPlayerSpawn, PLAYER_PART, type PlayerGround } from "./player";

/** What a new player needs from the world: the ground, and the world's size to find its centre. */
export type PlayerSpawnGround = PlayerGround & {
  /** Columns along `x`. */
  readonly width: number;
  /** Columns along `y`. */
  readonly height: number;
};

/** Saved player: the ground point it stands on (its walk is input and is not saved). */
export type SavedPlayer = GridPoint;

/**
 * The player as a world part (read it with `world.parts.get(PLAYER_PART)`). A new world puts it
 * on the walkable column nearest the centre (`findPlayerSpawn()`); a saved one, standing where it
 * was.
 */
export function createPlayerPart(): WorldPart<PlayerState, SavedPlayer, PlayerSpawnGround> {
  return {
    id: PLAYER_PART.id,
    version: 1,
    create: (ground) =>
      createPlayer(ground, findPlayerSpawn(ground, { x: (ground.width - 1) / 2, y: (ground.height - 1) / 2 })),
    serialize: (player) => ({ x: player.x, y: player.y }),
    restore: (saved, ground) => createPlayer(ground, saved),
  };
}
