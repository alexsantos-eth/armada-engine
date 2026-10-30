import type * as Strudel from "@strudel/web";
import type { StrudelPattern, StrudelRepl } from "@strudel/web";

/** Strudel cycles per second the game's sounds play at: a cycle lasts one second. */
export const SOUND_CPS = 1;

/** Audio seconds ahead of now a sound is scheduled, so its first event is not late. */
export const SOUND_LATENCY = 0.02;

/** The parts of `@strudel/web` the sounds use. */
export type StrudelApi = Pick<
  typeof Strudel,
  "initStrudel" | "evaluate" | "initAudio" | "getAudioContext" | "superdough"
>;

/** Strudel code of each sound: `shots` play once, `loops` over and over. */
export type SoundPatterns<Shot extends string, Loop extends string> = {
  readonly shots: Readonly<Record<Shot, string>>;
  readonly loops: Readonly<Record<Loop, string>>;
};

/** Plays a set of sounds by name. */
export type SoundBank<Shot extends string, Loop extends string> = {
  /** Plays `shot` once, now, at `volume` (`0`–`1`) of its loudness. */
  play(shot: Shot, volume?: number): void;
  /** Plays `loop` over and over from now on, instead of the one before; `undefined` stops it. */
  loop(loop: Loop | undefined): void;
  /** Stops every sound; the bank plays nothing more. */
  destroy(): void;
};

/** Options of {@link createStrudelSounds}. */
export type StrudelSoundsOptions = {
  /** Loads Strudel. Defaults to importing `@strudel/web`, only when a sound first plays. */
  readonly load?: () => Promise<StrudelApi>;
  /** Where a failure to load Strudel or a pattern is reported. Defaults to `console`. */
  readonly log?: Pick<Console, "warn">;
};

type Loaded<Shot extends string, Loop extends string> = {
  readonly api: StrudelApi;
  readonly repl: StrudelRepl;
  readonly shots: ReadonlyMap<Shot, StrudelPattern>;
  readonly loops: ReadonlyMap<Loop, StrudelPattern>;
};

const loadStrudel = (): Promise<StrudelApi> => import("@strudel/web");

/**
 * The sounds of `patterns`, played with Strudel at {@link SOUND_CPS}. Strudel loads, starts and
 * evaluates every pattern the first time a sound is asked for (after a key press, as browsers
 * require to play audio): shots asked for before it is ready are skipped, and the last loop asked
 * for starts when it is. A pattern that does not evaluate is reported and stays silent.
 *
 * A shot plays the events that start in its first cycle, each through Strudel's `superdough`, its
 * `velocity` scaled by the volume; a loop is the pattern Strudel's scheduler plays.
 */
export function createStrudelSounds<Shot extends string, Loop extends string>(
  patterns: SoundPatterns<Shot, Loop>,
  options: StrudelSoundsOptions = {},
): SoundBank<Shot, Loop> {
  const { load = loadStrudel, log = console } = options;
  let loading: Promise<void> | undefined;
  let loaded: Loaded<Shot, Loop> | undefined;
  let wanted: Loop | undefined;
  let playing: Loop | undefined;
  let destroyed = false;

  const evaluate = async <Name extends string>(api: StrudelApi, sounds: Readonly<Record<Name, string>>) => {
    const evaluated = new Map<Name, StrudelPattern>();
    for (const [name, code] of Object.entries(sounds) as Array<[Name, string]>) {
      const pattern = await api.evaluate(code, false);
      if (pattern) evaluated.set(name, pattern);
      else log.warn(`Sound "${name}" did not evaluate; it stays silent.`);
    }
    return evaluated;
  };

  const applyLoop = () => {
    if (!loaded || wanted === playing) return;
    playing = wanted;
    const pattern = wanted === undefined ? undefined : loaded.loops.get(wanted);
    if (pattern) void loaded.repl.setPattern(pattern, true);
    else loaded.repl.stop();
  };

  const start = () => {
    loading ??= (async () => {
      const api = await load();
      const repl = await api.initStrudel();
      await api.initAudio();
      const shots = await evaluate(api, patterns.shots);
      const loops = await evaluate(api, patterns.loops);
      repl.stop();
      repl.setCps(SOUND_CPS);
      if (destroyed) return;
      loaded = { api, repl, shots, loops };
      applyLoop();
    })().catch((error: unknown) => log.warn("The game's sounds are off: Strudel did not start.", error));
  };

  return {
    play: (shot, volume = 1) => {
      if (destroyed) return;
      start();
      const pattern = loaded?.shots.get(shot);
      if (!loaded || !pattern) return;
      const { api } = loaded;
      const audio = api.getAudioContext();
      if (audio.state === "suspended") void audio.resume();
      const now = audio.currentTime + SOUND_LATENCY;
      for (const hap of pattern.queryArc(0, 1)) {
        if (!hap.hasOnset()) continue;
        const velocity = typeof hap.value.velocity === "number" ? hap.value.velocity : 1;
        api
          .superdough(
            { ...hap.value, velocity: velocity * volume },
            now + Number(hap.whole!.begin) / SOUND_CPS,
            Number(hap.duration) / SOUND_CPS,
            SOUND_CPS,
          )
          .catch((error: unknown) => log.warn(`Sound "${shot}" did not play.`, error));
      }
    },
    loop: (loop) => {
      if (destroyed) return;
      wanted = loop;
      if (loop !== undefined) start();
      applyLoop();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      loaded?.repl.stop();
    },
  };
}
