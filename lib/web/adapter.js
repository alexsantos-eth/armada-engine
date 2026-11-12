const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();

importObject.env.iso_storage_get = (keyPtr, keyLength, outputPtr, outputCapacity) => {
  try {
    const key = utf8Decoder.decode(
      new Uint8Array(wasm_memory.buffer, keyPtr, keyLength),
    );
    const value = window.localStorage.getItem(key);
    if (value === null) {
      return -1;
    }
    const encoded = utf8Encoder.encode(value);
    if (encoded.length > outputCapacity) {
      return -2;
    }
    new Uint8Array(wasm_memory.buffer, outputPtr, encoded.length).set(encoded);
    return encoded.length;
  } catch {
    return -1;
  }
};

importObject.env.iso_pointer_coarse = () => {
  try {
    const coarse =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0;
    return coarse ? 1 : 0;
  } catch {
    return 0;
  }
};

importObject.env.iso_route_path = (outputPtr, outputCapacity) => {
  try {
    const encoded = utf8Encoder.encode(window.location.pathname);
    if (encoded.length > outputCapacity) {
      return -2;
    }
    new Uint8Array(wasm_memory.buffer, outputPtr, encoded.length).set(encoded);
    return encoded.length;
  } catch {
    return -1;
  }
};

importObject.env.iso_storage_set = (keyPtr, keyLength, valuePtr, valueLength) => {
  try {
    const key = utf8Decoder.decode(
      new Uint8Array(wasm_memory.buffer, keyPtr, keyLength),
    );
    const value = utf8Decoder.decode(
      new Uint8Array(wasm_memory.buffer, valuePtr, valueLength),
    );
    window.localStorage.setItem(key, value);
    return 1;
  } catch {
    return 0;
  }
};

const FRAME_PACING_DEFAULT_FPS = 60;
const DISPLAY_SAMPLE_COUNT = 8;
const MIN_DISPLAY_GAP_MS = 0.5;
const MAX_DISPLAY_GAP_MS = 40;

const framePacingFps = (() => {
  try {
    const requested = new URL(window.location.href).searchParams.get("fps");
    if (requested === null) {
      return FRAME_PACING_DEFAULT_FPS;
    }
    const parsed = Number.parseFloat(requested);
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : FRAME_PACING_DEFAULT_FPS;
  } catch {
    return FRAME_PACING_DEFAULT_FPS;
  }
})();
const targetFrameMs = framePacingFps > 0 ? 1000 / framePacingFps : 0;

let frameTimestampSeconds = 0;
let lastRawMs = null;
let lastDeliveredMs = null;
let displayFrameMs = targetFrameMs;
const displayGaps = [];

const observeDisplay = (timestampMs) => {
  if (lastRawMs !== null) {
    const gap = timestampMs - lastRawMs;
    if (gap > MIN_DISPLAY_GAP_MS && gap < MAX_DISPLAY_GAP_MS) {
      displayGaps.push(gap);
      if (displayGaps.length > DISPLAY_SAMPLE_COUNT) {
        displayGaps.shift();
      }
      displayFrameMs = Math.min(...displayGaps);
    }
  }
  lastRawMs = timestampMs;
};

const PACING_HEADROOM = 0.6;

const tooEarly = (timestampMs) => {
  if (targetFrameMs <= 0 || lastDeliveredMs === null) {
    return false;
  }
  if (displayFrameMs > targetFrameMs * PACING_HEADROOM) {
    return false;
  }
  return timestampMs - lastDeliveredMs < targetFrameMs - displayFrameMs / 2;
};

const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const liveFrames = new Map();
let nextFrameHandle = 1;

window.requestAnimationFrame = (callback) => {
  const handle = nextFrameHandle;
  nextFrameHandle += 1;
  const step = (timestampMs) => {
    observeDisplay(timestampMs);
    if (tooEarly(timestampMs)) {
      liveFrames.set(handle, nativeRequestAnimationFrame(step));
      return;
    }
    liveFrames.delete(handle);
    lastDeliveredMs = timestampMs;
    frameTimestampSeconds = timestampMs / 1000;
    callback(timestampMs);
  };
  liveFrames.set(handle, nativeRequestAnimationFrame(step));
  return handle;
};

window.cancelAnimationFrame = (handle) => {
  const native = liveFrames.get(handle);
  if (native === undefined) {
    return;
  }
  liveFrames.delete(handle);
  nativeCancelAnimationFrame(native);
};

importObject.env.iso_frame_timestamp = () => frameTimestampSeconds;

const wasmUrl = new URL("iso-core.wasm", document.baseURI);
if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  wasmUrl.searchParams.set("dev", Date.now().toString());
}
load(wasmUrl.href);
