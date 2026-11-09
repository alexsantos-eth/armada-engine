import { describe, expect, it, vi } from "vitest";

vi.mock("pixi.js", () => ({ UPDATE_PRIORITY: { INTERACTION: 50, UTILITY: -50 } }));

import {
  countDrawCalls,
  createPerfMonitor,
  measureTextures,
  PERF_REPORT_MS,
  PERF_SLOW_FRAME_MS,
  type PerfProbe,
  percentile,
  startPerfMonitor,
} from "./perf";

const texture = (size: number, uploadMethodId: string, autoGenerateMipmaps = false) => ({
  pixelWidth: size,
  pixelHeight: size,
  autoGenerateMipmaps,
  uploadMethodId,
});

describe("percentile", () => {
  it("is the nearest-rank value, whatever the order, and 0 without values", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0.95)).toBe(5);
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("measureTextures", () => {
  it("counts 4 bytes a pixel, a third more with mipmaps, by kind", () => {
    const { total, byKind } = measureTextures([
      texture(1024, "image", true),
      texture(512, "unknown"),
      texture(512, "unknown"),
      texture(256, "buffer"),
      texture(256, "video"),
    ]);

    expect(byKind).toEqual({ svg: 16 / 3, render: 2, buffer: 0.25, other: 0.25 });
    expect(total).toBeCloseTo(16 / 3 + 2.5);
    expect(measureTextures([])).toEqual({ total: 0, byKind: {}, largest: [] });
  });

  it("lists the groups of one kind and size that take the most", () => {
    const { largest } = measureTextures([
      texture(512, "unknown"),
      texture(256, "buffer"),
      texture(512, "unknown"),
      texture(1024, "image"),
      texture(128, "image"),
    ]);

    expect(largest).toEqual([
      { name: "svg 1024×1024", count: 1, megabytes: 4 },
      { name: "render 512×512", count: 2, megabytes: 2 },
      { name: "buffer 256×256", count: 1, megabytes: 0.25 },
    ]);
  });
});

describe("createPerfMonitor", () => {
  const probe = (overrides: Partial<PerfProbe> = {}): PerfProbe => ({
    drawCalls: () => 40,
    textures: () => [texture(512, "unknown"), texture(1024, "image", true)],
    heapBytes: () => 64 * 1024 * 1024,
    shownChunks: () => 9,
    ...overrides,
  });

  /** A monitor on a clock the test moves by hand. */
  const monitor = (overrides: Partial<PerfProbe> = {}, reportMs = 100) => {
    const clock = { now: 0 };
    const log = vi.fn();
    const perf = createPerfMonitor({ now: () => clock.now, log, probe: probe(overrides), reportMs });
    /** A frame of `elapsedMs` whose CPU part takes `cpuMs`. */
    const frame = (elapsedMs: number, cpuMs: number, during?: () => void) => {
      perf.frameStart(elapsedMs);
      during?.();
      clock.now += cpuMs;
      perf.frameEnd();
    };
    return { clock, log, perf, frame };
  };

  it("reports frames, CPU, draw calls, textures, heap, chunks and steps once the frames cover the report time", () => {
    const { log, perf, frame, clock } = monitor();
    // A scene step: part of its frame's CPU time.
    const step = (label: string, ms: number) => {
      const start = perf.profiler.now();
      clock.now += ms;
      perf.profiler.record(label, perf.profiler.now() - start);
    };

    frame(20, 4, () => step("update:shadows", 3));
    frame(20, 2, () => step("update:shadows", 1));
    frame(50, 30, () => step("show:terrain", 25));
    expect(log).not.toHaveBeenCalled();
    frame(10, 2);

    expect(log).toHaveBeenCalledTimes(1);
    expect((log.mock.calls[0] as [string])[0].split("\n")).toEqual([
      "Armada perf · 0.1 s · 4 frames · 40.0 fps · chunks 9",
      `frame ms p50 20.0 · p95 50.0 · max 50.0 · over ${PERF_SLOW_FRAME_MS} ms: 1`,
      "cpu ms p50 3.0 · p95 55.0 · max 55.0 · draw calls avg 40 · max 40",
      "textures 6.3 MB (svg 5.3 · render 1.0) in 2 · js heap 64.0 MB",
      "largest textures: svg 1024×1024 ×1 = 5.3 MB · render 512×512 ×1 = 1.0 MB",
      "steps ms avg/max per frame: show:terrain 6.25/25.00 · update:shadows 1.00/3.00",
    ]);
  });

  it("starts over after each report", () => {
    const { log, frame } = monitor({ heapBytes: () => undefined, textures: () => [] });

    frame(100, 1);
    frame(100, 1);

    expect(log).toHaveBeenCalledTimes(2);
    expect((log.mock.calls[1] as [string])[0].split("\n")).toEqual([
      "Armada perf · 0.1 s · 1 frames · 10.0 fps · chunks 9",
      `frame ms p50 100.0 · p95 100.0 · max 100.0 · over ${PERF_SLOW_FRAME_MS} ms: 1`,
      "cpu ms p50 1.0 · p95 1.0 · max 1.0 · draw calls avg 40 · max 40",
      "textures 0.0 MB () in 0 · js heap n/a",
      "largest textures: none",
      "steps ms avg/max per frame: none",
    ]);
  });

  it("forgets the frames measured before a reset", () => {
    const { log, perf, frame } = monitor();

    frame(90, 1);
    perf.reset();
    frame(90, 1);
    expect(log).not.toHaveBeenCalled();
    frame(10, 1);
    expect((log.mock.calls[0] as [string])[0]).toContain("2 frames");
  });

  it("ignores a frame end with no frame started, and reports every five seconds by default", () => {
    const log = vi.fn();
    const perf = createPerfMonitor({ now: () => 0, log, probe: probe() });

    perf.frameEnd();
    perf.frameStart(PERF_REPORT_MS - 1);
    perf.frameEnd();
    expect(log).not.toHaveBeenCalled();
    perf.frameStart(1);
    perf.frameEnd();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("countDrawCalls", () => {
  it("counts the draw calls made since the last take, and puts the methods back", () => {
    class Context {
      calls: string[] = [];
      drawElements(mode: number) {
        this.calls.push(`elements ${mode}`);
      }
      drawArrays(mode: number) {
        this.calls.push(`arrays ${mode}`);
      }
    }
    const gl = new Context();
    const instanced = vi.fn();
    Object.assign(gl, { drawArraysInstanced: instanced });
    const counter = countDrawCalls(gl);

    gl.drawElements(4);
    gl.drawArrays(5);
    (gl as unknown as { drawArraysInstanced: (mode: number) => void }).drawArraysInstanced(6);
    expect(counter.take()).toBe(3);
    expect(counter.take()).toBe(0);
    expect(gl.calls).toEqual(["elements 4", "arrays 5"]);
    expect(instanced).toHaveBeenCalledWith(6);

    counter.restore();
    expect(Object.hasOwn(gl, "drawElements")).toBe(false);
    expect((gl as unknown as { drawArraysInstanced: unknown }).drawArraysInstanced).toBe(instanced);
    gl.drawElements(4);
    expect(counter.take()).toBe(0);
  });
});

describe("startPerfMonitor", () => {
  const app = (renderer: object) => {
    const listeners: Array<{ fn: (ticker: { elapsedMS: number }) => void; priority: number }> = [];
    return {
      renderer,
      listeners,
      ticker: {
        add: vi.fn((fn: (ticker: { elapsedMS: number }) => void, _context: unknown, priority: number) =>
          listeners.push({ fn, priority }),
        ),
        remove: vi.fn(),
      },
      /** Runs one frame of `elapsedMs` through the listeners, highest priority first. */
      frame(elapsedMs: number) {
        [...listeners].sort((a, b) => b.priority - a.priority).forEach(({ fn }) => fn({ elapsedMS: elapsedMs }));
      },
    };
  };

  it("measures from the first ticker listener to after the render, with the renderer's draw calls and textures", () => {
    const gl = { drawElements: vi.fn() };
    // Pixi leaves `null` where it unloaded a texture.
    const textures = [texture(512, "unknown"), null];
    const fake = app({ gl, texture: { managedTextures: textures } });
    const log = vi.fn();
    let now = 0;
    const perf = startPerfMonitor(fake as never, {
      now: () => (now += 1),
      log,
      heapBytes: () => undefined,
    });
    // The frames before the scene is watched are forgotten.
    fake.frame(PERF_REPORT_MS - 1);
    perf.watch({ shownChunks: () => ["a", "b", "c"] });
    fake.frame(1);
    expect(log).not.toHaveBeenCalled();

    expect(fake.listeners.map(({ priority }) => priority)).toEqual([50, -50]);
    expect(typeof perf.profiler.record).toBe("function");
    gl.drawElements();
    fake.frame(PERF_REPORT_MS);
    const lines = (log.mock.calls[0] as [string])[0].split("\n");
    expect(lines[0]).toContain("chunks 3");
    expect(lines[2]).toContain("draw calls avg 1");
    expect(lines[3]).toBe("textures 1.0 MB (render 1.0) in 1 · js heap n/a");

    perf.destroy();
    expect(fake.ticker.remove).toHaveBeenCalledTimes(2);
    expect(Object.hasOwn(gl, "drawElements")).toBe(true);
  });

  it("works without a WebGL context or texture list", () => {
    const fake = app({});
    const log = vi.fn();
    const perf = startPerfMonitor(fake as never, {
      now: () => 0,
      log,
      heapBytes: () => 1024 * 1024,
    });

    // No scene watched yet: no chunks shown.
    fake.frame(PERF_REPORT_MS);
    const lines = (log.mock.calls[0] as [string])[0].split("\n");
    expect(lines[0]).toContain("chunks 0");
    expect(lines[2]).toContain("draw calls avg 0");
    expect(lines[3]).toBe("textures 0.0 MB () in 0 · js heap 1.0 MB");
    perf.destroy();
  });
});
