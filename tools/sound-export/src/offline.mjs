// Offline rendering of Strudel patterns to raw PCM in Node.js, via
// node-web-audio-api (a Rust implementation of the Web Audio API).
// Adapted from wyote4094/rendel (MIT) — https://github.com/wyote4094/rendel —
// Copyright (c) 2026 wyote4094. Modifications copyright (c) 2026 Armada engine.
// Differences vs rendel: no AudioWorklet module is loaded (patterns that
// depend on worklet-based effects, e.g. `.lfo`/`.djf`/wavetable synths, fail
// with a clear error), no General MIDI soundfont registration (the game's
// sounds only use superdough's built-in synths), and the chunked renderer is
// exposed directly as `renderPattern` instead of a CLI-shaped helper.
import * as nwaa from 'node-web-audio-api';

const WEB_AUDIO_GLOBALS = [
  'AudioContext',
  'BaseAudioContext',
  'OfflineAudioContext',
  'AudioBuffer',
  'AudioNode',
  'AudioParam',
  'AudioWorkletNode',
  'AudioScheduledSourceNode',
  'GainNode',
  'OscillatorNode',
  'BiquadFilterNode',
  'ConvolverNode',
  'DelayNode',
  'DynamicsCompressorNode',
  'PannerNode',
  'StereoPannerNode',
  'ChannelMergerNode',
  'ChannelSplitterNode',
  'AnalyserNode',
  'WaveShaperNode',
  'AudioBufferSourceNode',
  'ConstantSourceNode',
  'PeriodicWave',
  'MediaStreamAudioDestinationNode',
  'AudioWorklet',
  'AudioListener',
];

for (const name of WEB_AUDIO_GLOBALS) {
  if (nwaa[name] !== undefined) {
    globalThis[name] = nwaa[name];
  }
}

// superdough references `window` and `document` without `typeof` guards.
// Recursive no-op proxies keep those references from throwing in Node.
if (typeof window === 'undefined') {
  const makeBrowserStub = () => {
    const stub = new Proxy(
      function noop() {
        return stub;
      },
      {
        get(target, key) {
          if (key === Symbol.toPrimitive) return () => 0;
          if (key === 'then') return undefined; // not a Promise
          if (key in target) return target[key];
          return stub;
        },
        set() {
          return true;
        },
        apply() {
          return stub;
        },
        construct() {
          return stub;
        },
      },
    );
    return stub;
  };

  globalThis.window = makeBrowserStub();
  globalThis.document = makeBrowserStub();
}

// superdough's reverb generation creates a nested OfflineAudioContext and
// passes AudioBuffers across context boundaries. node-web-audio-api (unlike
// browsers) enforces strict context ownership and throws "Attempting to
// connect nodes from different contexts". Intercept the `.buffer` setters and,
// on cross-context error, copy the channel data into a buffer owned by the
// receiving node's context.
function patchCrossContextBuffer(NodeClass) {
  const desc = Object.getOwnPropertyDescriptor(NodeClass.prototype, 'buffer');
  Object.defineProperty(NodeClass.prototype, 'buffer', {
    ...desc,
    set(value) {
      try {
        desc.set.call(this, value);
      } catch (err) {
        if (!err.message?.includes('Attempting to connect nodes from different contexts')) {
          throw err;
        }
        const ctx = this.context;
        const copy = ctx.createBuffer(value.numberOfChannels, value.length, value.sampleRate);
        for (let ch = 0; ch < value.numberOfChannels; ch++) {
          copy.copyToChannel(value.getChannelData(ch), ch);
        }
        desc.set.call(this, copy);
      }
    },
  });
}

patchCrossContextBuffer(nwaa.AudioBufferSourceNode);
patchCrossContextBuffer(nwaa.ConvolverNode);

// superdough's node pool retains WeakRefs to nodes from previous contexts.
// Between chunks, those stale refs would cause "nodes from different
// contexts" errors when reused, so track them and neuter the audio-related
// ones between chunks.
const trackedRefs = new Set();
const NativeWeakRef = globalThis.WeakRef;
class TrackingWeakRef extends NativeWeakRef {
  constructor(target) {
    super(target);
    trackedRefs.add(this);
  }
}
globalThis.WeakRef = TrackingWeakRef;

function isAudioRelated(target) {
  if (!target || typeof target !== 'object') return false;
  // AudioNode subclasses expose a `context` property.
  if ('context' in target) return true;
  // Voice-tracking entries are plain objects { node, stop, nodes }.
  if ('node' in target && 'stop' in target) return true;
  return false;
}

function invalidateAllRefs() {
  for (const ref of trackedRefs) {
    const target = NativeWeakRef.prototype.deref.call(ref);
    if (isAudioRelated(target)) {
      ref.deref = () => undefined;
    }
  }
  trackedRefs.clear();
}

// The Strudel modules are ESM singletons; load them once per process.
let modulesPromise;

async function loadModules() {
  const [
    { evalScope },
    transpilerModule,
    strudelCore,
    strudelMini,
    strudelWebaudio,
    strudelTonal,
    dough,
    doughContext,
    { SuperdoughAudioController },
  ] = await Promise.all([
    import('@strudel/core/evaluate.mjs'),
    import('@strudel/transpiler'),
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/webaudio'),
    import('@strudel/tonal'),
    import('superdough'),
    import('superdough/audioContext.mjs'),
    import('superdough/superdoughoutput.mjs'),
  ]);
  const { transpiler, evaluate } = transpilerModule;
  const { superdough, setAudioContext, setSuperdoughAudioController, initAudio, registerSynthSounds, errorLogger } = dough;
  const { setAudioContext: setAudioContextUnbundled } = doughContext;

  const { setCpsFunc } = strudelCore;
  const extras = {
    setcps: (cps) => setCpsFunc(() => cps),
  };

  await evalScope(
    Promise.resolve(strudelCore),
    Promise.resolve(strudelMini),
    Promise.resolve(strudelWebaudio),
    Promise.resolve(strudelTonal),
    Promise.resolve(extras),
  );
  registerSynthSounds();

  return {
    transpiler,
    evaluate,
    superdough,
    setAudioContext,
    setAudioContextUnbundled,
    setSuperdoughAudioController,
    SuperdoughAudioController,
    initAudio,
    errorLogger,
  };
}

/**
 * Evaluates `code` (a Strudel pattern expression) and renders `duration`
 * seconds of it at `sampleRate` Hz and `cps` cycles per second.
 * Returns { left, right, sampleRate } as interleaved-ready Float32Arrays.
 */
export async function renderPattern(code, { duration, cps, sampleRate, onHapError } = {}) {
  modulesPromise ??= loadModules();
  const {
    transpiler,
    evaluate,
    superdough,
    setAudioContext,
    setAudioContextUnbundled,
    setSuperdoughAudioController,
    SuperdoughAudioController,
    initAudio,
    errorLogger,
  } = await modulesPromise;

  const { pattern } = await evaluate(code, transpiler);
  if (!pattern || typeof pattern.queryArc !== 'function') {
    throw new Error('the file did not evaluate to a Strudel pattern; is its last expression a pattern?');
  }

  const chunkDur = 3;
  const minTail = 2; // let reverb/delay tails ring past the chunk's last onset
  const totalFrames = Math.ceil(duration * sampleRate);
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);

  const numChunks = Math.ceil(duration / chunkDur);
  for (let i = 0; i < numChunks; i++) {
    const tSec = i * chunkDur;
    const thisChunkDur = Math.min(chunkDur, duration - tSec);
    const beginCyc = tSec * cps;
    const endCyc = (tSec + thisChunkDur) * cps;

    const haps = pattern
      .queryArc(beginCyc, endCyc, { _cps: cps })
      .filter((h) => h.hasOnset())
      .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf());

    let latestEndSec = thisChunkDur + minTail;
    for (const hap of haps) {
      const onsetSec = (hap.whole.begin.valueOf() - beginCyc) / cps;
      const hapDurSec = hap.duration.valueOf() / cps;
      latestEndSec = Math.max(latestEndSec, onsetSec + hapDurSec + minTail);
    }
    const renderDur = Math.min(latestEndSec, duration - tSec);
    const frameCount = Math.ceil(renderDur * sampleRate);

    const ctx = new OfflineAudioContext(2, frameCount, sampleRate);
    setAudioContext(ctx);
    setAudioContextUnbundled(ctx);
    setSuperdoughAudioController(new SuperdoughAudioController(ctx));
    // No AudioWorklet modules are loaded: `.lfo`/`.djf`-style effects are not
    // available offline. Built-in synths, envelopes, filters and effects that
    // are plain AudioNodes (as used by this game's sounds) render fine.
    await initAudio({ maxPolyphony: 100000, disableWorklets: true });

    const hap2value = (hap) => {
      hap.ensureObjectValue();
      return hap.value;
    };

    for (const hap of haps) {
      // Clamp onset to 0: floating-point imprecision can produce tiny negative
      // values when a hap onset coincides with beginCyc, which superdough
      // rejects as "in the past".
      const onsetSec = Math.max(0, (hap.whole.begin.valueOf() - beginCyc) / cps);
      try {
        await superdough(hap2value(hap), onsetSec, hap.duration.valueOf() / cps, cps, onsetSec);
      } catch (err) {
        if (onHapError) onHapError(err);
        errorLogger(err, 'armada-sound-export');
      }
    }

    const rendered = await ctx.startRendering();
    const renderL = rendered.getChannelData(0);
    const renderR = rendered.getChannelData(1);
    const offset = Math.round(tSec * sampleRate);
    const n = Math.min(renderL.length, totalFrames - offset);
    for (let j = 0; j < n; j++) {
      left[offset + j] += renderL[j];
      right[offset + j] += renderR[j];
    }

    setAudioContext(null);
    setAudioContextUnbundled(null);
    setSuperdoughAudioController(null);
    invalidateAllRefs();
  }

  return { left, right, sampleRate };
}
