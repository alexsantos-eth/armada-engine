/**
 * The parts of `@strudel/web` (which ships no types) the game's sounds use. One cycle of a pattern
 * lasts `1 / cps` seconds.
 */
declare module "@strudel/web" {
  /** An event of a pattern: what it plays (`value`), from when (`whole`) and for how long, in cycles. */
  export type StrudelHap = {
    readonly value: Readonly<Record<string, unknown>>;
    readonly whole?: { readonly begin: number | { valueOf(): number } };
    readonly duration: number | { valueOf(): number };
    hasOnset(): boolean;
  };

  /** A Strudel pattern, queried for its events between two cycles. */
  export type StrudelPattern = { queryArc(begin: number, end: number): readonly StrudelHap[] };

  /** The scheduler that plays one pattern over and over. */
  export type StrudelRepl = {
    setPattern(pattern: StrudelPattern, autostart?: boolean): Promise<unknown>;
    setCps(cps: number): void;
    stop(): void;
  };

  /** Starts Strudel (its scheduler and its synths); settles with the scheduler. */
  export function initStrudel(options?: object): Promise<StrudelRepl>;
  /** Evaluates Strudel code into its pattern (`undefined` if it fails), playing it if `autoplay`. */
  export function evaluate(code: string, autoplay?: boolean): Promise<StrudelPattern | undefined>;
  /** Readies the audio output and its effects. */
  export function initAudio(): Promise<void>;
  /** The audio context Strudel plays on. */
  export function getAudioContext(): Pick<AudioContext, "currentTime" | "state" | "resume">;
  /** Plays one event's `value` at `time` (audio seconds) for `duration` seconds. */
  export function superdough(value: object, time: number, duration: number, cps?: number): Promise<void>;
}
