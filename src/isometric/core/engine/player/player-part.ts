import type { GridPoint, PlayerState, WorldPart } from "../../types";
import { createPlayer, findPlayerSpawn, PLAYER_PART, type PlayerGround } from "./player";

/**
 * What a player part needs from the world: the ground, where a new world starts, and loading the
 * chunks under the player. The world's part context satisfies it.
 */
export type PlayerSpawnGround = PlayerGround & {
  /** Where a new world starts: the player spawns near it. */
  readonly centre: GridPoint;
  readonly chunks: {
    /** Loads the chunks around the ground point `point`, so the player has ground to stand on. */
    loadAround(point: GridPoint): void;
  };
};

/** Saved player: the ground point it stands on (its walk is input and is not saved). */
export type SavedPlayer = GridPoint;

/**
 * The player as a world part (read it with `world.parts.get(PLAYER_PART)`). A new world puts it
 * on the walkable column nearest the world's centre (`findPlayerSpawn()`); a saved one, standing
 * where it was. Either way the chunks around it are loaded first.
 */
export function createPlayerPart(): WorldPart<PlayerState, SavedPlayer, PlayerSpawnGround> {
  return {
    id: PLAYER_PART.id,
    version: 1,
    create: (ground) => {
      ground.chunks.loadAround(ground.centre);
      const spawn = findPlayerSpawn(ground, ground.centre);
      ground.chunks.loadAround(spawn);
      return createPlayer(ground, spawn);
    },
    serialize: (player) => ({ x: player.x, y: player.y }),
    restore: (saved, ground) => {
      ground.chunks.loadAround(saved);
      return createPlayer(ground, saved);
    },
  };
}
