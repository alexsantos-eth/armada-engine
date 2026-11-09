import type { PlayerSoundLoop, PlayerSoundShot } from "../../content";
import { DANCE_DELAY_MS, PLAYER_JUMP_SPEED } from "../../core/engine";
import type { EventBus, PlayerMotionType, SimulationEvents } from "../../core/types";
import type { SoundBank } from "./strudel";

/** The player's sounds (`PLAYER_SOUND_PATTERNS`). */
export type PlayerSounds = SoundBank<PlayerSoundShot, PlayerSoundLoop>;

/** Landings softer than this, in blocks per tick (a step down onto sand), make no sound. */
export const LAND_SOUND_MIN_IMPACT = 0.1;

/** The sound the player makes over and over in each motion state that has one. */
export const PLAYER_MOTION_LOOPS: Readonly<Partial<Record<PlayerMotionType, PlayerSoundLoop>>> = {
  walking: "walk",
  running: "run",
  flying: "jetpack",
};

/** The sound the player makes once as it enters each motion state that has one. */
export const PLAYER_MOTION_SHOTS: Readonly<Partial<Record<PlayerMotionType, PlayerSoundShot>>> = {
  skidding: "skid",
  climbing: "climb",
};

/** Real-time timers, to start the dance music once the player has stood still a while. */
export type SoundTimers = Pick<typeof globalThis, "setTimeout" | "clearTimeout">;

/**
 * Plays the player's sounds as the simulation announces them on `events`: a jump (higher in the
 * air), a landing (but the softest, louder the harder it lands) and a rejected press, once; as its
 * motion state changes, the state's shot ({@link PLAYER_MOTION_SHOTS}) and its loop
 * ({@link PLAYER_MOTION_LOOPS}), the loop before stopping. Standing still, it dances: the `dance`
 * loop starts {@link DANCE_DELAY_MS} after it stops, with the monkey's dance (real time, on
 * `timers`). Returns a function that stops listening and stops the loop.
 */
export function bindPlayerSounds(
  events: EventBus<SimulationEvents>,
  sounds: PlayerSounds,
  timers: SoundTimers,
): () => void {
  let dance: ReturnType<SoundTimers["setTimeout"]> | undefined;
  const stopDance = () => {
    if (dance !== undefined) timers.clearTimeout(dance);
    dance = undefined;
  };
  const unsubscribe = [
    events.on("playerJumped", ({ air }) => sounds.play(air ? "airJump" : "jump")),
    events.on("playerLanded", ({ impact }) => {
      if (impact >= LAND_SOUND_MIN_IMPACT) sounds.play("land", Math.min(1, impact / PLAYER_JUMP_SPEED));
    }),
    events.on("playerJumpRejected", () => sounds.play("reject")),
    events.on("playerMotionChanged", ({ to }) => {
      stopDance();
      const shot = PLAYER_MOTION_SHOTS[to];
      if (shot) sounds.play(shot);
      sounds.loop(PLAYER_MOTION_LOOPS[to]);
      if (to === "idle") dance = timers.setTimeout(() => sounds.loop("dance"), DANCE_DELAY_MS);
    }),
  ];
  return () => {
    unsubscribe.forEach((off) => off());
    stopDance();
    sounds.loop(undefined);
  };
}
