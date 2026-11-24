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

// Haptic feedback for the web build. Safari does not implement navigator.vibrate, so a hidden
// checkbox with the `switch` attribute is toggled instead: Safari fires a haptic click when
// that control changes.
const hapticSwitch = (() => {
  try {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.setAttribute("aria-hidden", "true");
    Object.assign(input.style, {
      position: "fixed",
      top: "0",
      left: "0",
      opacity: "0",
      width: "1px",
      height: "1px",
      pointerEvents: "none",
    });
    document.body.appendChild(input);
    return input;
  } catch {
    return null;
  }
})();

const triggerHaptic = (durationMs) => {
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 10;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(duration);
      return 1;
    }
  } catch {}
  // Safari: a haptic only fires when the switch is toggled inside a user gesture, so a
  // programmatic click from the game loop does not vibrate. Toggle it from a touch listener
  // instead (see below); this call keeps the API working where it can.
  try {
    if (hapticSwitch) {
      hapticSwitch.checked = !hapticSwitch.checked;
      hapticSwitch.click();
      return 1;
    }
  } catch {}
  return 0;
};

// Safari only fires the switch haptic from within a real user gesture, so toggle it on every
// touch start: that is the gesture the game's interactions are made of.
try {
  document.addEventListener(
    "touchstart",
    () => {
      if (hapticSwitch) {
        hapticSwitch.checked = !hapticSwitch.checked;
        hapticSwitch.click();
      }
    },
    { capture: true, passive: true },
  );
} catch {}

importObject.env.iso_vibrate = (durationMs) => triggerHaptic(durationMs);
importObject.env.iso_haptic = (durationMs) => triggerHaptic(durationMs);

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

try {
  const onMaker = window.location.pathname.replace(/\/+$/, "") === "/maker";
  if (!onMaker && new URL(window.location.href).searchParams.has("fresh")) {
    window.localStorage.removeItem("saves/iso_save.json");
    const words = new Uint32Array(2);
    window.crypto.getRandomValues(words);
    const seed = (BigInt(words[0]) << 32n) | BigInt(words[1]);
    window.localStorage.setItem("saves/iso_fresh_seed", seed.toString());
  }
} catch {}

const wasmUrl = new URL("iso-core.wasm", document.baseURI);
if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  wasmUrl.searchParams.set("dev", Date.now().toString());
}
load(wasmUrl.href);
