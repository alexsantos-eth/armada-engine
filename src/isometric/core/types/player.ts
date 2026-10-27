import type { GridPoint } from "./iso";

/** Where the player stands: a ground point and the elevation of the column under it. */
export type PlayerPosition = {
  /** Ground point in world columns, fractional; column `(x, y)` is centred on whole numbers. */
  readonly x: number;
  readonly y: number;
  /** Top elevation of the column under the player (the column nearest the ground point). */
  readonly elevation: number;
  /** Blocks the top of that column sits below its elevation (sand's `topInset`); `0` or absent for none. */
  readonly inset?: number;
  /** Blocks its feet are above that sunken top while it jumps or falls; `0` or absent on the ground. */
  readonly height?: number;
};

/**
 * Where the player is drawn in a frame: its position with the inset of the top under it and the
 * height of its feet above that top (both `0` standing on a full block).
 */
export type PlayerRenderPosition = PlayerPosition & { readonly inset: number; readonly height: number };

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
  /** Blocks the top of that column sits below its elevation (sand's `topInset`), `0` for most. Not saved. */
  inset: number;
  /**
   * Blocks its feet are above that sunken top (`elevation - inset`): `0` on the ground, more while it
   * jumps or falls. Not saved.
   */
  height: number;
  /**
   * Blocks per tick its feet rise while in the air (negative falling), pulled down by gravity;
   * `undefined` on the ground. Not saved.
   */
  verticalSpeed: number | undefined;
  /**
   * The app asked it to jump (`jumpPlayer()`): the next tick takes off if it stands on the ground,
   * and clears it either way. Input, like `walk`. Not saved.
   */
  wantsJump: boolean;
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

/**
 * Screen direction the player faces, of eight: north is up on screen (`+x +y`), east right
 * (`+x −y`). Their order is `PLAYER_FACINGS` (`engine/player`), the rows of a walk sheet.
 */
export type PlayerFacing =
  "east" | "north-east" | "north" | "north-west" | "west" | "south-west" | "south" | "south-east";

/** A rectangle in an SVG's own units, from its top-left corner. */
export type SvgRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The player walking, drawn from one SVG sheet: one row per facing (in `PLAYER_FACINGS` order), one
 * column per pose: column `0` standing, then the {@link PlayerWalkSheet.frames} poses of one walk
 * cycle (two steps). Every cell shows the same window ({@link PlayerWalkSheet.cell}) of the
 * character's one-tile canvas, so its feet stay where the static SVG's are.
 */
export type PlayerWalkSheet = {
  /** SVG of the sheet (e.g. `/assets/player/walk.svg`). */
  readonly source: string;
  /** Size of the one-tile canvas a cell is cut from (the static SVG's, `1024 × 853` for one block). */
  readonly canvas: { readonly width: number; readonly height: number };
  /** Window of that canvas every cell shows, in its units from its top-left corner. */
  readonly cell: SvgRect;
  /** Units between two cells of the sheet, across and down. */
  readonly gap: number;
  /** Walk poses per cycle, after the standing one. */
  readonly frames: number;
  /** Columns the player walks in one cycle: how far it goes per two steps, so its feet do not slide. */
  readonly stride: number;
  /** Column of the sheet shown in the air, while it jumps. Defaults to `0`, standing. */
  readonly airPose?: number;
  /** Breathing and looking around while it stands still. Without it, it stands still on column `0`. */
  readonly idle?: PlayerIdleSheet;
};

/**
 * The player breathing and looking around while it stands still, drawn from a second SVG sheet laid
 * out like its walk sheet (the same canvas, cell and gap; one row per facing): one column per pose of
 * a cycle, column `0` the walk sheet's standing pose, so it starts from where it stopped.
 */
export type PlayerIdleSheet = {
  /** SVG of the sheet (e.g. `/assets/player/idle.svg`). */
  readonly source: string;
  /** Poses per cycle, standing included. */
  readonly frames: number;
  /** Real milliseconds a cycle lasts. */
  readonly period: number;
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
  /**
   * Walks with poses from a sheet, turned to where it walks (one of eight facings), instead of
   * drawing `textureSource` still. `textureSource` is still loaded if the sheet cannot be.
   */
  readonly walk?: PlayerWalkSheet;
};
