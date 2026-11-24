const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(`${__dirname}/adapter.js`, "utf8");

function loadImports(navigator, document = {}) {
  const env = {};
  const href = "https://game.example/playground/";
  const location = new URL(href);
  runInNewContext(source, {
    TextDecoder,
    TextEncoder,
    URL,
    document: { baseURI: href, ...document },
    importObject: { env },
    load() {},
    location,
    navigator,
    window: {
      location,
      requestAnimationFrame() {},
      cancelAnimationFrame() {},
    },
  });
  return env;
}

test("browsers without the Vibration API leave the game's touch input alone", () => {
  const registeredEvents = [];
  const env = loadImports({}, {
    addEventListener(type) {
      registeredEvents.push(type);
    },
  });
  assert.equal(env.iso_vibrate(12), 0);
  assert.equal(env.iso_haptic(10), 0);
  assert.deepEqual(registeredEvents, []);
});

test("both imports forward pulses and report whether the browser accepted them", () => {
  const pulses = [];
  const navigator = {
    vibrate(duration) {
      assert.equal(this, navigator);
      pulses.push(duration);
      return duration === 12;
    },
  };
  const env = loadImports(navigator);
  assert.equal(env.iso_vibrate(12), 1);
  assert.equal(env.iso_haptic(8), 0);
  assert.deepEqual(pulses, [12, 8]);
});

test("a browser error does not escape the WASM import", () => {
  const env = loadImports({
    vibrate() {
      throw new Error("Vibration blocked");
    },
  });
  assert.equal(env.iso_vibrate(12), 0);
});
