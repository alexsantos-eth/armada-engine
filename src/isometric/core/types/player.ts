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
  /** Current locomotion state, advanced only by the player simulation system. */
  motion: PlayerMotion;
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
  /** Last stable land position for deterministic recovery after falling into water or the void. */
  lastSafe: PlayerRenderPosition;
  /**
   * Whether a jump press is buffered (`jumpBufferTicks > 0`). Input, like `walk`. Not saved.
   */
  wantsJump: boolean;
  /** Simulation ticks for which the latest jump press remains valid. Not saved. */
  jumpBufferTicks: number;
  /** Simulation ticks after leaving land during which a jump may still start. Not saved. */
  coyoteTicks: number;
  /** Whether the jump key is held; releasing it cuts upward speed. Not saved. */
  jumpHeld: boolean;
  /** Whether the run key is held: it goes up to `PLAYER_RUN_STEP` per tick. Input, like `walk`. Not saved. */
  running: boolean;
  /** Jumps it can still take in the air before it lands (`PLAYER_AIR_JUMPS` on the ground). Not saved. */
  airJumps: number;
  /**
   * Whether it wears a jetpack: holding the jump key in the air, past a jump's apex, it flies
   * (`flying`). Equipment the app sets (`setPlayerJetpack()`); not saved yet.
   */
  jetpack: boolean;
  /** Horizontal velocity in world columns per tick. Derived from input; not saved. */
  velocity: GridPoint;
  /**
   * Climbing onto a higher top (`PlayerClimb`), its walk and jumps ignored until it stands there;
   * `undefined` otherwise. Not saved: a restored player stands where it was.
   */
  climb: PlayerClimb | undefined;
  /** Where the player stood one tick earlier, so the render can interpolate. Not saved. */
  previous: PlayerPosition;
  /** What it just did with its jumps, for poses, effects and sound (`PlayerFeedback`). Not saved. */
  feedback: PlayerFeedback;
  /**
   * Desired direction in world columns (a unit vector, or `(0, 0)` standing still).
   * Input from the app (`setPlayerWalk()`), accelerated toward by the next ticks.
   * Not saved.
   */
  walk: GridPoint;
};

/** Why a jump press did not make the player jump: in the air, climbing, or a ceiling right overhead. */
export type PlayerJumpRejection = "airborne" | "climbing" | "ceiling";

/**
 * What the player's jumps just did, kept by the simulation so the view and the app can answer each
 * action (poses, dust, sound) without inferring it: counters that grow by one per take-off, landing
 * and rejected press, and short timers in ticks. Transient, like the input: not saved.
 */
export type PlayerFeedback = {
  /** Take-offs so far. */
  jumps: number;
  /** Landings so far, after a jump or a fall. */
  landings: number;
  /** Jump presses rejected so far. */
  rejections: number;
  /** Why the last press was rejected; `undefined` before any. */
  rejected: PlayerJumpRejection | undefined;
  /** Ticks its feet have been in the air (`1` on the tick it takes off, `0` on the ground). */
  airTicks: number;
  /** Ticks left of the landing pose (`PLAYER_LANDING_TICKS` after it lands, `0` otherwise); the physics never waits for it. */
  landingTicks: number;
  /** Blocks per tick its feet were falling at the last landing. */
  impact: number;
  /** Whether its feet are in the air because it jumped (not because it walked off an edge). */
  leap: boolean;
  /** Whether its last take-off was a jump in the air (a double jump) rather than from the ground. */
  airJump: boolean;
};

/**
 * Part of a jump the player is in, for its pose (`getPlayerJumpPhase()`): on the ground, taking
 * off, rising, at the apex, falling, or landing (a few ticks on the ground after it lands).
 */
export type PlayerJumpPhase = "ground" | "takeoff" | "rise" | "apex" | "fall" | "landing";

/**
 * Discrete locomotion states used by the player simulation and its view. Every player behaviour is
 * one of these states (running included), never another boolean the view reads.
 */
export type PlayerMotion =
  | { readonly type: "idle" }
  | { readonly type: "walking" }
  | { readonly type: "running" }
  | { readonly type: "skidding" }
  | { readonly type: "jumping" }
  | { readonly type: "falling" }
  | { readonly type: "flying" }
  | { readonly type: "climbing" };

/** State keys recognized by the player's XState motion machine. */
export type PlayerMotionType = PlayerMotion["type"];

/**
 * The player climbing onto a top higher than its feet: for {@link PlayerClimb.ticks} ticks its feet
 * rise from where they were at the foot of it, at `from`, to that top, and then it steps onto it, to `to`.
 */
export type PlayerClimb = {
  /** Ground point it climbs from, at the foot of the higher top. */
  readonly from: GridPoint;
  /** Ground point it stands on at the end, on the higher top. */
  readonly to: GridPoint;
  /** Unit world direction it climbs in (`to − from`), the way it faces. */
  readonly direction: GridPoint;
  /** Height of its feet in the world when it set off (`elevation − inset + height`). */
  readonly feet: number;
  /** Blocks its feet rise: from `feet` to the higher top. */
  readonly rise: number;
  /** Ticks the climb lasts. */
  readonly ticks: number;
  /** Ticks of it done, from `0` to `ticks`. */
  tick: number;
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
  /** Column of the sheet shown in the air, while it jumps, when there is no `jump` sheet. Defaults to `0`, standing. */
  readonly airPose?: number;
  /** Taking off, rising, at the apex, falling and landing. Without it, `airPose` in the air. */
  readonly jump?: PlayerJumpSheet;
  /** Breathing and looking around while it stands still. Without it, it stands still on column `0`. */
  readonly idle?: PlayerIdleSheet;
  /** Climbing onto a higher top. Without it, it climbs in its standing pose. */
  readonly climb?: PlayerClimbSheet;
  /** The jetpack it wears on its back, drawn over the body. Without it, no jetpack shows. */
  readonly jetpack?: PlayerJetpackSheet;
};

/**
 * The jetpack on the player's back, drawn from another SVG sheet laid out like its walk sheet (the
 * same canvas, cell and gap; one row per facing) with one column: only the jetpack, already cut
 * where the standing body hides it, so it is drawn over every pose.
 */
export type PlayerJetpackSheet = {
  /** SVG of the sheet (e.g. `/assets/player/jetpack.svg`). */
  readonly source: string;
};

/**
 * The player climbing onto a higher top, drawn from another SVG sheet laid out like its walk sheet
 * (the same canvas, cell and gap; one row per facing): one column per pose of a climb, in order,
 * from reaching up to standing on the top. Its feet stay where the walk sheet's are: the engine
 * raises them.
 */
export type PlayerClimbSheet = {
  /** SVG of the sheet (e.g. `/assets/player/climb.svg`). */
  readonly source: string;
  /** Poses of a climb. */
  readonly frames: number;
};

/**
 * The player jumping, drawn from another SVG sheet laid out like its walk sheet (the same canvas,
 * cell and gap; one row per facing): one column per part of a jump. Its feet stay where the walk
 * sheet's are: the engine lifts them.
 */
export type PlayerJumpSheet = {
  /** SVG of the sheet (e.g. `/assets/player/jump.svg`). */
  readonly source: string;
  /** Column of each part of a jump (`getPlayerJumpPhase()`, but `"ground"`). */
  readonly poses: Readonly<Record<Exclude<PlayerJumpPhase, "ground">, number>>;
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

/**
 * How the player dances while it stands still: only transforms of its sprite, on top of its idle
 * sheet. On every beat its weight lands on one foot and then the other: the body leans that way
 * about its feet and dips, and rises again between beats.
 */
export type PlayerIdleDance = {
  /** Real milliseconds between two beats: the weight changes foot on each one. */
  readonly beat: number;
  /** How far the body leans over the foot its weight is on, in radians. */
  readonly lean: number;
  /** How much it dips as its weight lands, as a share of its height (it rises as much between). */
  readonly bounce: number;
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
  /** Dances while it stands still on the ground. Without it, it stands upright. */
  readonly dance?: PlayerIdleDance;
};
