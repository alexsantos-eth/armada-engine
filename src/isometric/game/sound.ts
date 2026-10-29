import type { EventBus, SimulationEvents } from "../core/types";
import { PLAYER_JUMP_SPEED } from "../core/engine";

/** A short synthesized sound: an oscillator gliding from one pitch to another while it fades. */
export type Tone = {
  /** Wave of the oscillator. */
  readonly wave: OscillatorType;
  /** Pitch it starts at and glides to, in hertz. */
  readonly from: number;
  readonly to: number;
  /** Real milliseconds it lasts. */
  readonly ms: number;
  /** Loudness at its start, `0`–`1`. */
  readonly gain: number;
};

/**
 * What the player sounds like, without audio files: a rising chirp as it takes off, a low thud as it
 * lands (louder the harder it lands) and a short low buzz when a jump press is rejected.
 */
export const PLAYER_SOUNDS: Readonly<Record<"jump" | "land" | "reject", Tone>> = {
  jump: { wave: "triangle", from: 300, to: 620, ms: 110, gain: 0.12 },
  land: { wave: "sine", from: 170, to: 60, ms: 100, gain: 0.22 },
  reject: { wave: "square", from: 150, to: 120, ms: 120, gain: 0.05 },
};

/** Landings softer than this, in blocks per tick (a step down onto sand), make no sound. */
export const LAND_SOUND_MIN_IMPACT = 0.1;

/** The parts of the Web Audio `AudioContext` the game's sounds use. */
export type AudioOutput = Pick<
  AudioContext,
  "currentTime" | "destination" | "state" | "resume" | "createOscillator" | "createGain"
>;

/** Plays `tone` on `audio` now, at `volume` (`0`–`1`) of its gain. */
export function playTone(audio: AudioOutput, tone: Tone, volume = 1): void {
  if (audio.state === "suspended") void audio.resume();
  const start = audio.currentTime;
  const end = start + tone.ms / 1000;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = tone.wave;
  oscillator.frequency.setValueAtTime(tone.from, start);
  oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
  gain.gain.setValueAtTime(tone.gain * volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

/**
 * Plays the player's sounds ({@link PLAYER_SOUNDS}) as the simulation announces its take-offs,
 * landings (but the softest) and rejected presses on `events`. `audio` gives the output the first time a sound plays
 * (after a key press, as browsers require) or `undefined` without sound. Returns a function that
 * stops listening.
 */
export function bindPlayerSounds(events: EventBus<SimulationEvents>, audio: () => AudioOutput | undefined): () => void {
  const play = (tone: Tone, volume?: number) => {
    const output = audio();
    if (output) playTone(output, tone, volume);
  };
  const unsubscribe = [
    events.on("playerJumped", () => play(PLAYER_SOUNDS.jump)),
    events.on("playerLanded", ({ impact }) => {
      if (impact >= LAND_SOUND_MIN_IMPACT) play(PLAYER_SOUNDS.land, Math.min(1, impact / PLAYER_JUMP_SPEED));
    }),
    events.on("playerJumpRejected", () => play(PLAYER_SOUNDS.reject)),
  ];
  return () => unsubscribe.forEach((off) => off());
}

/**
 * The browser's audio output for `window`, made the first time it is asked for (an `AudioContext`
 * made before any key press stays muted); `undefined` when the browser has none.
 */
export function createAudioOutput(window: {
  readonly AudioContext?: new () => AudioOutput;
}): () => AudioOutput | undefined {
  let output: AudioOutput | undefined;
  return () => {
    if (!output && window.AudioContext) output = new window.AudioContext();
    return output;
  };
}
