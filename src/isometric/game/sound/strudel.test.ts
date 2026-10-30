import { afterEach, describe, expect, it, vi } from "vitest";
import { createStrudelSounds, SOUND_CPS, SOUND_LATENCY, type StrudelApi } from "./strudel";

/** An event of a fake pattern, starting `begin` cycles in and lasting `duration`. */
const hap = (value: Record<string, unknown>, begin: number | undefined, duration = 0.125) => ({
  value,
  whole: begin === undefined ? undefined : { begin: { valueOf: () => begin } },
  duration,
  hasOnset: () => begin !== undefined,
});

/** A fake pattern named after the code it was evaluated from. */
const pattern = (code: string) => ({
  code,
  queryArc: vi.fn((begin: number, end: number) => {
    expect([begin, end]).toEqual([0, 1]);
    return [hap({ s: code }, 0), hap({ s: code, velocity: 0.5 }, 0.5, 0.25), hap({ s: "held" }, undefined)];
  }),
});

const PATTERNS = { shots: { jump: "jump-code", broken: "broken-code" }, loops: { walk: "walk-code", run: "run-code" } };

/** A fake Strudel that records what it is asked to do; `ready()` lets it finish starting. */
const createApi = (state: AudioContextState = "running") => {
  const repl = { setPattern: vi.fn(() => Promise.resolve()), setCps: vi.fn(), stop: vi.fn() };
  const audio = { currentTime: 3, state, resume: vi.fn(() => Promise.resolve()) };
  const api = {
    initStrudel: vi.fn(() => Promise.resolve(repl)),
    evaluate: vi.fn((code: string, autoplay?: boolean) => {
      expect(autoplay).toBe(false);
      return Promise.resolve(code.startsWith("broken") ? undefined : pattern(code));
    }),
    initAudio: vi.fn(() => Promise.resolve()),
    getAudioContext: vi.fn(() => audio),
    superdough: vi.fn(() => Promise.resolve()),
  };
  return { api, repl, audio };
};

const create = (api: object, log = { warn: vi.fn() }) => ({
  log,
  sounds: createStrudelSounds(PATTERNS, { load: () => Promise.resolve(api as unknown as StrudelApi), log }),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createStrudelSounds", () => {
  it("starts Strudel at the first sound, evaluating every pattern once, and skips shots until it is ready", async () => {
    const { api, repl } = createApi();
    const { sounds, log } = create(api);
    expect(api.initStrudel).not.toHaveBeenCalled();

    sounds.play("jump");
    sounds.play("jump");
    await settle();
    expect(api.initStrudel).toHaveBeenCalledTimes(1);
    expect(api.initAudio).toHaveBeenCalledTimes(1);
    expect(api.evaluate.mock.calls.map(([code]) => code)).toEqual([
      "jump-code",
      "broken-code",
      "walk-code",
      "run-code",
    ]);
    expect(log.warn).toHaveBeenCalledWith('Sound "broken" did not evaluate; it stays silent.');
    expect(repl.setCps).toHaveBeenCalledWith(SOUND_CPS);
    expect(repl.stop).toHaveBeenCalledTimes(1);
    expect(api.superdough).not.toHaveBeenCalled();

    sounds.play("jump");
    expect(api.superdough).toHaveBeenCalledTimes(2);
    expect(api.getAudioContext().resume).not.toHaveBeenCalled();
  });

  it("plays a shot's events that start in its first cycle, scaled by the volume", async () => {
    const { api } = createApi("suspended");
    const { sounds, log } = create(api);
    sounds.play("jump");
    await settle();

    sounds.play("jump", 0.5);
    const now = 3 + SOUND_LATENCY;
    expect(api.superdough.mock.calls).toEqual([
      [{ s: "jump-code", velocity: 0.5 }, now, 0.125 / SOUND_CPS, SOUND_CPS],
      [{ s: "jump-code", velocity: 0.25 }, now + 0.5 / SOUND_CPS, 0.25 / SOUND_CPS, SOUND_CPS],
    ]);
    expect(api.getAudioContext().resume).toHaveBeenCalled();

    sounds.play("broken");
    expect(api.superdough).toHaveBeenCalledTimes(2);

    api.superdough.mockImplementationOnce(() => Promise.reject(new Error("no voice")));
    sounds.play("jump");
    await settle();
    expect(log.warn).toHaveBeenCalledWith('Sound "jump" did not play.', expect.any(Error));
  });

  it("plays the last loop asked for, from when Strudel is ready, and stops it", async () => {
    const { api, repl } = createApi();
    const { sounds } = create(api);
    sounds.loop(undefined);
    expect(api.initStrudel).not.toHaveBeenCalled();
    sounds.loop("walk");
    sounds.loop("run");
    await settle();
    expect(repl.setPattern).toHaveBeenCalledTimes(1);
    expect(repl.setPattern).toHaveBeenCalledWith(expect.objectContaining({ code: "run-code" }), true);

    sounds.loop("run");
    expect(repl.setPattern).toHaveBeenCalledTimes(1);
    sounds.loop(undefined);
    expect(repl.stop).toHaveBeenCalledTimes(2);
  });

  it("stops every sound when destroyed, and plays nothing more", async () => {
    const { api, repl } = createApi();
    const { sounds } = create(api);
    sounds.loop("walk");
    await settle();
    sounds.destroy();
    sounds.destroy();
    expect(repl.stop).toHaveBeenCalledTimes(2);
    sounds.play("jump");
    sounds.loop("run");
    expect(api.superdough).not.toHaveBeenCalled();
    expect(repl.setPattern).toHaveBeenCalledTimes(1);
  });

  it("plays nothing if destroyed while Strudel starts", async () => {
    const { api, repl } = createApi();
    const { sounds } = create(api);
    sounds.loop("walk");
    sounds.destroy();
    await settle();
    expect(repl.setPattern).not.toHaveBeenCalled();
    sounds.play("jump");
    expect(api.superdough).not.toHaveBeenCalled();
  });

  it("turns the sounds off, once, if Strudel does not start", async () => {
    const log = { warn: vi.fn() };
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    const sounds = createStrudelSounds(PATTERNS, { load, log });
    sounds.play("jump");
    sounds.loop("walk");
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("The game's sounds are off: Strudel did not start.", expect.any(Error));
    sounds.destroy();
  });
});

describe("createStrudelSounds by default", () => {
  afterEach(() => {
    vi.doUnmock("@strudel/web");
    vi.restoreAllMocks();
  });

  it("imports @strudel/web and reports to the console", async () => {
    const { api } = createApi();
    vi.doMock("@strudel/web", () => api);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sounds = createStrudelSounds(PATTERNS);
    sounds.play("jump");
    await vi.waitFor(() => expect(api.initStrudel).toHaveBeenCalled());
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Sound "broken" did not evaluate; it stays silent.'));
  });
});
