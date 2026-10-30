import { describe, expect, it, vi } from "vitest";
import { createEventBus, DANCE_DELAY_MS, PLAYER_JUMP_SPEED } from "../../core/engine";
import type { SimulationEvents } from "../../core/types";
import { bindPlayerSounds, LAND_SOUND_MIN_IMPACT, PLAYER_MOTION_LOOPS, PLAYER_MOTION_SHOTS } from "./player-sounds";

/** Sounds that record what they are asked to play, and timers run by hand. */
const setup = () => {
  const events = createEventBus<SimulationEvents>();
  const sounds = { play: vi.fn(), loop: vi.fn(), destroy: vi.fn() };
  const pending = new Map<number, () => void>();
  let next = 0;
  const timers = {
    setTimeout: vi.fn((run: () => void, ms: number) => {
      expect(ms).toBe(DANCE_DELAY_MS);
      pending.set((next += 1), run);
      return next;
    }),
    clearTimeout: vi.fn((id: number) => pending.delete(id)),
  };
  const unbind = bindPlayerSounds(events, sounds, timers as never);
  const elapse = () => {
    const runs = [...pending.values()];
    pending.clear();
    runs.forEach((run) => run());
  };
  const move = (from: SimulationEvents["playerMotionChanged"]["from"], to: typeof from) =>
    events.emit("playerMotionChanged", { from, to });
  return { events, sounds, timers, pending, elapse, move, unbind };
};

describe("bindPlayerSounds", () => {
  it("chirps as the player jumps, higher in the air, and buzzes when a jump is rejected", () => {
    const { events, sounds } = setup();
    events.emit("playerJumped", { x: 0, y: 0, feet: 0, air: false });
    events.emit("playerJumped", { x: 0, y: 0, feet: 1, air: true });
    events.emit("playerJumpRejected", { reason: "airborne" });
    expect(sounds.play.mock.calls).toEqual([["jump"], ["airJump"], ["reject"]]);
  });

  it("thuds as the player lands, louder the harder, but not on the softest landings", () => {
    const { events, sounds } = setup();
    const land = (impact: number) => events.emit("playerLanded", { x: 0, y: 0, feet: 0, impact });
    land(LAND_SOUND_MIN_IMPACT / 2);
    land(PLAYER_JUMP_SPEED / 2);
    land(PLAYER_JUMP_SPEED * 2);
    expect(sounds.play.mock.calls).toEqual([
      ["land", 0.5],
      ["land", 1],
    ]);
  });

  it("steps while the player walks or runs, and stops between states without a loop", () => {
    const { sounds, move } = setup();
    move("idle", "walking");
    move("walking", "running");
    move("running", "jumping");
    expect(sounds.loop.mock.calls).toEqual([["walk"], ["run"], [undefined]]);
    expect(PLAYER_MOTION_LOOPS).toEqual({ walking: "walk", running: "run" });
  });

  it("skids and climbs once, as the player starts to", () => {
    const { sounds, move } = setup();
    move("running", "skidding");
    move("skidding", "climbing");
    expect(sounds.play.mock.calls).toEqual([["skid"], ["climb"]]);
    expect(sounds.loop.mock.calls).toEqual([[undefined], [undefined]]);
    expect(PLAYER_MOTION_SHOTS).toEqual({ skidding: "skid", climbing: "climb" });
  });

  it("starts the dance music once the player has stood still as long as the monkey waits to dance", () => {
    const { sounds, move, elapse, pending } = setup();
    move("walking", "idle");
    expect(sounds.loop).toHaveBeenLastCalledWith(undefined);
    elapse();
    expect(sounds.loop).toHaveBeenLastCalledWith("dance");

    move("idle", "walking");
    move("walking", "idle");
    move("idle", "walking");
    expect(pending.size).toBe(0);
    expect(sounds.loop).toHaveBeenLastCalledWith("walk");
  });

  it("stops listening, the dance timer and the loop when unbound", () => {
    const { events, sounds, move, unbind, pending } = setup();
    move("walking", "idle");
    unbind();
    expect(pending.size).toBe(0);
    expect(sounds.loop).toHaveBeenLastCalledWith(undefined);
    events.emit("playerJumped", { x: 0, y: 0, feet: 0, air: false });
    move("idle", "walking");
    expect(sounds.play).not.toHaveBeenCalled();
    expect(events.has("playerMotionChanged")).toBe(false);
  });
});
