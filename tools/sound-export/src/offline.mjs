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
  if ('context' in target) return true;
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
    await initAudio({ maxPolyphony: 100000, disableWorklets: true });

    const hap2value = (hap) => {
      hap.ensureObjectValue();
      return hap.value;
    };

    for (const hap of haps) {
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
