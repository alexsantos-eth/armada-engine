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

const wasmUrl = new URL("iso-core.wasm", document.baseURI);
if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  wasmUrl.searchParams.set("dev", Date.now().toString());
}
load(wasmUrl.href);
