import { describe, expect, it } from "vitest";
import { PLAYER_DANCE } from "./player";
import { PLAYER_SOUND_PATTERNS } from "./sounds";

const patterns = Object.entries({ ...PLAYER_SOUND_PATTERNS.shots, ...PLAYER_SOUND_PATTERNS.loops });

describe("PLAYER_SOUND_PATTERNS", () => {
  it("names the player's shots and loops", () => {
    expect(Object.keys(PLAYER_SOUND_PATTERNS.shots)).toEqual(["jump", "airJump", "land", "reject", "skid", "climb"]);
    expect(Object.keys(PLAYER_SOUND_PATTERNS.loops)).toEqual(["walk", "run", "dance"]);
  });

  it.each(patterns)("loads %s from its .strudel file, explained and with an output", (_, code) => {
    expect(code.trimStart()).toMatch(/^\/\/ /);
    expect(code).toMatch(/\.s\(|\bs\(/);
    expect(code).toMatch(/\.gain\(/);
  });

  it("dances to the beat of the dancing monkey, a bar of four beats", () => {
    const slow = /\.slow\(([\d.]+)\)\s*$/.exec(PLAYER_SOUND_PATTERNS.loops.dance);
    expect(Number(slow?.[1])).toBeCloseTo((4 * PLAYER_DANCE.beat) / 1000);
  });
});
