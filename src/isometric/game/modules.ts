import { PLAYER_APPEARANCE, TERRAIN_APPEARANCE } from "../content";
import {
  createAmbientLight,
  createCameraView,
  createClockPart,
  createCloudShadows,
  createEntityView,
  createFoliageWind,
  createPlayerPart,
  createPlayerSystem,
  createPlayerView,
  createPhaseLighting,
  type PlayerViewOptions,
  type PhaseLighting,
  createShadows,
  createTerrainView,
  createWaterReflections,
  type PlayerTopInset,
  type SceneModule,
  type World,
  type WorldPartOf,
} from "../core/engine";
import type { WorldSystem } from "../core/types";

/**
 * The scene modules the game draws with, in order: each one may use the services of those
 * before it (the wind, the water's reflections and the shadows use the entities' views, and the
 * reflections and the shadows the player's; the camera starts on the
 * player), and every frame they update in this order (the canopies lean before their shadows
 * follow them; the player moves before its shadow and the camera follow it). Any of them can be
 * left out (`disabled`, by id) and the rest keep working. With `cull: false` the camera draws
 * every view of the shown chunks (`?cull=off`, to measure what culling saves). `player` sets how the
 * player's view answers its actions (its effects).
 */
export function createSceneModules(
  disabled: ReadonlySet<string> = new Set(),
  options: { readonly lighting?: PhaseLighting; readonly cull?: boolean; readonly player?: PlayerViewOptions } = {},
): SceneModule[] {
  const lighting = options.lighting ?? createPhaseLighting();
  const modules = [
    createTerrainView(),
    createEntityView(),
    createFoliageWind(),
    createPlayerView(PLAYER_APPEARANCE, options.player),
    createWaterReflections(),
    createAmbientLight(lighting),
    createShadows(lighting),
    createCameraView({ cull: options.cull }),
    createCloudShadows(),
  ];
  return modules.filter(({ id }) => !disabled.has(id));
}

/**
 * The parts of world state the game's systems own, in order: the clock (starting a new world at
 * `startTick`) and the player. Pass the same list to `generateWorld()` and `restoreWorld()`. They
 * are not left out with `?modules=`: a system that is off keeps its state, so saving loses
 * nothing.
 */
export function createWorldParts(startTick?: number): WorldPartOf[] {
  return [createClockPart(startTick), createPlayerPart()];
}

/**
 * The game systems the simulation runs every tick, in order (`stepWorld()`), but the `disabled` ones.
 * The player falls onto the sunken tops of the terrain content (`topInset`, sand) as they are drawn.
 */
export function createWorldSystems(disabled: ReadonlySet<string> = new Set()): WorldSystem<World>[] {
  const topInset: PlayerTopInset = (type) => TERRAIN_APPEARANCE[type].topInset ?? 0;
  return [createPlayerSystem({ topInset })].filter(({ id }) => !disabled.has(id));
}

/** The ids in `disabled` that name no scene module nor game system: a typo in `?modules=`. */
export function findUnknownModules(disabled: ReadonlySet<string>): string[] {
  const known = new Set([...createSceneModules(), ...createWorldSystems()].map(({ id }) => id));
  return [...disabled].filter((id) => !known.has(id));
}
