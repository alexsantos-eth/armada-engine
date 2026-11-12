# sound-export

Static renderer for the game's sounds. It takes the `.strudel` files (written
and tuned at <https://strudel.cc>) from **`lib/music/`** — the single source of
truth, also played directly by the archived web client (`web_deprecated/`) —
renders them offline with **superdough** (the same audio engine that powers the
Strudel REPL), and writes committed WAV files to `lib/content/sounds/`, which
the Rust/Macroquad client loads with `macroquad::audio`. No browser, no live
Strudel at runtime, and the game ships only plain WAVs.

## Usage

```sh
cd tools/sound-export
npm ci          # installs deps and applies the local patches (patch-package)
npm run render  # re-renders every sound into lib/content/sounds/
```

Nothing is fetched from the network at render time: every sound uses
superdough's built-in synths (`sine`/`triangle`/`square`/`sawtooth`/noise) and
no external sample banks. Expect **different** output bytes each run — the
white/brown noise in the walk/run/skid/jetpack/… patterns is (by design) not
seeded, so re-exporting re-rolls the noise. Audition the result before
committing.

## What gets rendered, and why

| File           | Kind   | Cycles @ CPS 1 | Why |
|----------------|--------|----------------|-----|
| `jump`, `air-jump`, `land`, `skid`, `climb` | one-shot | 1 | The engine plays events whose onset is inside the first cycle; everything sounds in the first octave. |
| `walk`, `run`, `jetpack` | loop | 1 | Exactly one cycle, so Macroquad can loop the file seamlessly (`looped: true`). |

Sample rate is 48000 Hz, stereo 16-bit PCM. A render fails loudly (non-zero
exit) if a pattern does not evaluate or comes out quieter than −60 dBFS peak,
so a broken `.strudel` can never ship silent.

## Failure modes worth knowing

- **Worklet-based effects are not available offline.** `.lfo()`, `.djf()`,
  wavetable synths and any effect implemented as an AudioWorklet will fail;
  built-in synths, envelopes (`attack`/`decay`/`sustain`/`release`), filters
  (`lpf`/`hpf`) and plain-node effects render fine. This game's sounds only
  use the latter set.
- superdough's `stop()`-after-`stop()` edge case is patched (see
  `patches/superdough+1.3.0.patch`), as are node-web-audio-api on Windows and
  `@kabelsalat/web`'s missing ESM `exports` field — without it, Node cannot
  import `@strudel/core` (`SalatRepl`). The first two patches are vendored
  from [`wyote4094/rendel`](https://github.com/wyote4094/rendel) (MIT,
  Copyright (c) 2026 wyote4094), from which the offline renderer in
  `src/offline.mjs` is adapted; `@kabelsalat/web+0.4.1.patch` is our own.
- `patch-package` must run after `npm ci`/`npm install`; that is what the
  `postinstall` script does. If your npm blocks it
  (`npm warn install-scripts`), run `npx patch-package` by hand once.

## Legal note

Strudel and superdough are AGPL-3.0. This tool only *generates* WAV files; the
game ships and plays the WAVs, not Strudel. Rendering a `.strudel` file does
not make the game a derivative work of Strudel any more than any other offline
audio renderer does. This note is informational, not legal advice.
