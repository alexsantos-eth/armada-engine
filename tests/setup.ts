Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { innerWidth: 1000 },
});