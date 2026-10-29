import { describe, expect, it, vi } from "vitest";
import { createEventBus, PLAYER_JUMP_SPEED } from "../core/engine";
import type { SimulationEvents } from "../core/types";
import {
  type AudioOutput,
  bindPlayerSounds,
  createAudioOutput,
  LAND_SOUND_MIN_IMPACT,
  PLAYER_SOUNDS,
  playTone,
} from "./sound";

/** An audio output that records the tones it is asked to play. */
const createOutput = (state: AudioContextState = "running") => {
  const played: Array<{ wave: string; from: number; to: number; gain: number; start: number; stop: number }> = [];
  const output = {
    currentTime: 2,
    destination: { node: "speakers" },
    state,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const tone = { wave: "", from: 0, to: 0, gain: 0, start: 0, stop: 0 };
      played.push(tone);
      return {
        set type(wave: OscillatorType) {
          tone.wave = wave;
        },
        frequency: {
          setValueAtTime: vi.fn((value: number) => (tone.from = value)),
          exponentialRampToValueAtTime: vi.fn((value: number) => (tone.to = value)),
        },
        connect: vi.fn(),
        start: vi.fn((at: number) => (tone.start = at)),
        stop: vi.fn((at: number) => (tone.stop = at)),
      };
    }),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn((value: number) => (played[played.length - 1].gain = value)),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  };
  return { output: output as unknown as AudioOutput, played, resume: output.resume };
};

describe("playTone", () => {
  it("glides an oscillator from one pitch to another while it fades, for the tone's length", () => {
    const { output, played, resume } = createOutput();
    playTone(output, PLAYER_SOUNDS.jump, 0.5);

    expect(played).toEqual([
      {
        wave: "triangle",
        from: PLAYER_SOUNDS.jump.from,
        to: PLAYER_SOUNDS.jump.to,
        gain: PLAYER_SOUNDS.jump.gain * 0.5,
        start: 2,
        stop: 2 + PLAYER_SOUNDS.jump.ms / 1000,
      },
    ]);
    expect(resume).not.toHaveBeenCalled();
  });

  it("wakes a suspended output", () => {
    const { output, resume } = createOutput("suspended");
    playTone(output, PLAYER_SOUNDS.reject);
    expect(resume).toHaveBeenCalled();
  });
});

describe("bindPlayerSounds", () => {
  it("chirps at a take-off, thuds at a landing by its impact and buzzes at a rejected press", () => {
    const events = createEventBus<SimulationEvents>();
    const { output, played } = createOutput();
    const unbind = bindPlayerSounds(events, () => output);

    events.emit("playerJumped", { x: 0, y: 0, feet: 0 });
    events.emit("playerLanded", { x: 0, y: 0, feet: 0, impact: PLAYER_JUMP_SPEED / 2 });
    events.emit("playerLanded", { x: 0, y: 0, feet: 0, impact: PLAYER_JUMP_SPEED * 2 });
    events.emit("playerLanded", { x: 0, y: 0, feet: 0, impact: LAND_SOUND_MIN_IMPACT / 2 });
    events.emit("playerJumpRejected", { reason: "airborne" });

    expect(played.map(({ wave }) => wave)).toEqual(["triangle", "sine", "sine", "square"]);
    expect(played[1].gain).toBeCloseTo(PLAYER_SOUNDS.land.gain / 2);
    expect(played[2].gain).toBeCloseTo(PLAYER_SOUNDS.land.gain);
    unbind();
    events.emit("playerJumped", { x: 0, y: 0, feet: 0 });
    expect(played).toHaveLength(4);
  });

  it("plays nothing without an output", () => {
    const events = createEventBus<SimulationEvents>();
    bindPlayerSounds(events, () => undefined);
    expect(() => events.emit("playerJumped", { x: 0, y: 0, feet: 0 })).not.toThrow();
  });
});

describe("createAudioOutput", () => {
  it("makes the browser's audio output the first time it is asked for, and only once", () => {
    const { output } = createOutput();
    const AudioContext = vi.fn(function () {
      return output;
    });
    const audio = createAudioOutput({ AudioContext });

    expect(AudioContext).not.toHaveBeenCalled();
    expect(audio()).toBe(output);
    expect(audio()).toBe(output);
    expect(AudioContext).toHaveBeenCalledTimes(1);
  });

  it("gives nothing when the browser has no audio", () => {
    expect(createAudioOutput({})()).toBeUndefined();
  });
});
