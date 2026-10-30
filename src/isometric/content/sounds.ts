import airJump from "./sounds/air-jump.strudel?raw";
import climb from "./sounds/climb.strudel?raw";
import dance from "./sounds/dance.strudel?raw";
import jump from "./sounds/jump.strudel?raw";
import land from "./sounds/land.strudel?raw";
import reject from "./sounds/reject.strudel?raw";
import run from "./sounds/run.strudel?raw";
import skid from "./sounds/skid.strudel?raw";
import walk from "./sounds/walk.strudel?raw";

/*
 * Game content: what the player sounds like, as Strudel patterns (https://strudel.cc), one
 * `.strudel` file each in `sounds/`. The game plays them with `createStrudelSounds()`
 * (`src/isometric/game/sound`), where one cycle lasts one second.
 */

/**
 * The player's sounds, by name. `shots` play once, from the start of their first cycle, when
 * something happens (a take-off, a landing, a skid); `loops` play over and over while the player
 * is in a state (walking, running, dancing).
 */
export const PLAYER_SOUND_PATTERNS = {
  shots: { jump, airJump, land, reject, skid, climb },
  loops: { walk, run, dance },
} as const;

/** A sound the player makes once. */
export type PlayerSoundShot = keyof typeof PLAYER_SOUND_PATTERNS.shots;

/** A sound the player makes over and over while in a state. */
export type PlayerSoundLoop = keyof typeof PLAYER_SOUND_PATTERNS.loops;
