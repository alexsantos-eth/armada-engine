import type { GridPoint } from "./iso";

/** Where the player stands: a ground point and the elevation of the column under it. */
export type PlayerPosition = {
  /** Ground point in world columns, fractional; column `(x, y)` is centred on whole numbers. */
  readonly x: number;
  readonly y: number;
  /** Top elevation of the column under the player (the column nearest the ground point). */
  readonly elevation: number;
};

/**
 * The player character as domain state in the `World`. Only the simulation step moves it
 * (`stepPlayer()` inside `stepWorld()`); the scene only draws it.
 */
export type PlayerState = {
  /** Ground point in world columns, fractional; column `(x, y)` is centred on whole numbers. */
  x: number;
  y: number;
  /** Top elevation of the column under the player. */
  elevation: number;
  /** Where the player stood one tick earlier, so the render can interpolate. Not saved. */
  previous: PlayerPosition;
  /**
   * Direction the player walks in, in world columns per column moved (a unit vector, or
   * `(0, 0)` standing still). Input from the app (`setPlayerWalk()`), read by the next ticks.
   * Not saved.
   */
  walk: GridPoint;
};

/** Screen directions held by the player (keyboard): up is north (`+x +y`), right is east (`+x −y`). */
export type ScreenDirections = {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
};

/** How the scene draws the player (game content, like an entity definition). */
export type PlayerAppearance = {
  /** SVG of the character, one tile wide (e.g. `/assets/player/block.svg`). */
  readonly textureSource: string;
  /** Height in blocks. Defaults to `1`. */
  readonly height?: number;
  /**
   * Size the character is drawn at, relative to its tile (`0.5` is half as wide and half as tall),
   * scaled about its feet so it still stands on its column. Defaults to `1`.
   */
  readonly scale?: number;
};
