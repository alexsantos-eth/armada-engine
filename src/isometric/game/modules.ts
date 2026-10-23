import { PLAYER_APPEARANCE } from "../content";
import {
  createAmbientLight,
  createCameraView,
  createEntityView,
  createPlayerSystem,
  createPlayerView,
  createShadows,
  createTerrainView,
  type SceneModule,
  type World,
} from "../core/engine";
import type { WorldSystem } from "../core/types";

/**
 * The scene modules the game draws with, in order: each one may use the services of those
 * before it (shadows use the entities' views; the camera starts on the player), and every frame
 * they update in this order (the player moves before the camera glides after it). Any of them
 * can be left out (`disabled`, by id) and the rest keep working.
 */
export function createSceneModules(disabled: ReadonlySet<string> = new Set()): SceneModule[] {
  const modules = [
    createTerrainView(),
    createEntityView(),
    createShadows(),
    createAmbientLight(),
    createPlayerView(PLAYER_APPEARANCE),
    createCameraView(),
  ];
  return modules.filter(({ id }) => !disabled.has(id));
}

/** The game systems the simulation runs every tick, in order (`stepWorld()`), but the `disabled` ones. */
export function createWorldSystems(disabled: ReadonlySet<string> = new Set()): WorldSystem<World>[] {
  return [createPlayerSystem()].filter(({ id }) => !disabled.has(id));
}

/** The ids in `disabled` that name no scene module nor game system: a typo in `?modules=`. */
export function findUnknownModules(disabled: ReadonlySet<string>): string[] {
  const known = new Set([...createSceneModules(), ...createWorldSystems()].map(({ id }) => id));
  return [...disabled].filter((id) => !known.has(id));
}
