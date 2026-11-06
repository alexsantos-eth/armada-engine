import { type Application, type Ticker, UPDATE_PRIORITY } from "pixi.js";
import type { SceneProfiler } from "../core/engine";

/** A texture on the GPU as the perf report counts it: the fields of Pixi's `TextureSource` it reads. */
export type PerfTexture = {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly autoGenerateMipmaps: boolean;
  /** `image` (a rasterized SVG), `buffer` (pixels from data, as the occlusion maps) or `unknown` (a render texture). */
  readonly uploadMethodId: string;
};

/** What the perf monitor reads besides time: the renderer, the browser and the scene. */
export type PerfProbe = {
  /** Draw calls since the last call. */
  readonly drawCalls: () => number;
  /** The textures uploaded to the GPU. */
  readonly textures: () => readonly PerfTexture[];
  /** Bytes of JS heap in use, when the browser tells (Chrome); otherwise `undefined`. */
  readonly heapBytes: () => number | undefined;
  /** Chunks the scene shows. */
  readonly shownChunks: () => number;
};

/** Milliseconds of frames each perf report covers. */
export const PERF_REPORT_MS = 5000;

/** Frames longer than this, in milliseconds, count as dropped (below 30 fps). */
export const PERF_SLOW_FRAME_MS = 33.4;

/** Options of {@link createPerfMonitor}. */
export type PerfMonitorOptions = {
  /** Current time, in milliseconds (`performance.now`). */
  readonly now: () => number;
  /** Where each report goes. */
  readonly log: (message: string) => void;
  readonly probe: PerfProbe;
  /** Milliseconds of frames per report. Defaults to {@link PERF_REPORT_MS}. */
  readonly reportMs?: number;
};

/** Measures frames and reports them (`?perf`): see {@link createPerfMonitor}. */
export type PerfMonitor = {
  /** Profiler to give the scene (`SceneOptions.profiler`): the time of each of its steps. */
  readonly profiler: SceneProfiler;
  /** Marks the start of a frame; `elapsedMs` is the time since the previous one. */
  readonly frameStart: (elapsedMs: number) => void;
  /** Marks the end of a frame, after it is rendered; reports once the frames cover the report time. */
  readonly frameEnd: () => void;
  /** Forgets the frames measured so far (those of the start, while the scene was built). */
  readonly reset: () => void;
};

type StepTimes = { total: number; max: number };

const MB = 1024 * 1024;
const TEXTURE_KIND: Readonly<Record<string, string>> = { image: "svg", buffer: "buffer", unknown: "render" };

/** The value below which `fraction` of `values` fall (nearest rank); `0` without values. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

/** Textures of one kind and size, as {@link measureTextures} groups them. */
export type TextureGroup = { readonly name: string; readonly count: number; readonly megabytes: number };

/** Groups {@link measureTextures} lists: those that take the most memory. */
export const PERF_TEXTURE_GROUPS = 3;

/**
 * Megabytes the textures take on the GPU (4 bytes a pixel, a third more with mipmaps), in all
 * and by kind (`svg`, `render`, `buffer` and `other`), and the {@link PERF_TEXTURE_GROUPS} groups of
 * one kind and size that take the most (`render 2048×512`: which textures to look at).
 */
export function measureTextures(textures: readonly PerfTexture[]): {
  total: number;
  byKind: Record<string, number>;
  largest: TextureGroup[];
} {
  const byKind: Record<string, number> = {};
  const groups = new Map<string, { count: number; megabytes: number }>();
  let total = 0;
  for (const texture of textures) {
    const megabytes = (texture.pixelWidth * texture.pixelHeight * 4 * (texture.autoGenerateMipmaps ? 4 / 3 : 1)) / MB;
    const kind = TEXTURE_KIND[texture.uploadMethodId] ?? "other";
    byKind[kind] = (byKind[kind] ?? 0) + megabytes;
    total += megabytes;
    const name = `${kind} ${texture.pixelWidth}×${texture.pixelHeight}`;
    const group = groups.get(name) ?? { count: 0, megabytes: 0 };
    group.count += 1;
    group.megabytes += megabytes;
    groups.set(name, group);
  }
  const largest = [...groups.entries()]
    .map(([name, group]) => ({ name, ...group }))
    .sort((a, b) => b.megabytes - a.megabytes)
    .slice(0, PERF_TEXTURE_GROUPS);
  return { total, byKind, largest };
}

const fixed = (value: number, digits = 1) => value.toFixed(digits);

/**
 * Measures the game's frames for `?perf` and logs a report every {@link PERF_REPORT_MS} of frames:
 * frames per second and the frame time (median, 95th percentile, worst, and how many dropped
 * below 30 fps), the CPU time of a frame from its first ticker listener to the end of its render,
 * draw calls, the GPU memory of the textures by kind, the JS heap and the chunks shown, and the
 * time of each step of the scene (`update:shadows`, `show:terrain`…), average and worst per frame.
 * GPU time is not measured here: browsers hide it (see the Performance panel of the dev tools).
 */
export function createPerfMonitor(options: PerfMonitorOptions): PerfMonitor {
  const { now, log, probe, reportMs = PERF_REPORT_MS } = options;
  const intervals: number[] = [];
  const cpu: number[] = [];
  const draws: number[] = [];
  const steps = new Map<string, StepTimes>();
  let covered = 0;
  let frameStartedAt: number | undefined;

  const reset = () => {
    intervals.length = 0;
    cpu.length = 0;
    draws.length = 0;
    steps.clear();
    covered = 0;
  };

  const report = () => {
    const frames = intervals.length;
    const fps = (frames * 1000) / covered;
    const slow = intervals.filter((ms) => ms > PERF_SLOW_FRAME_MS).length;
    const textures = probe.textures();
    const memory = measureTextures(textures);
    const kinds = Object.entries(memory.byKind)
      .sort(([, a], [, b]) => b - a)
      .map(([kind, megabytes]) => `${kind} ${fixed(megabytes)}`)
      .join(" · ");
    const heap = probe.heapBytes();
    const averageDraws = draws.reduce((sum, count) => sum + count, 0) / frames;
    const stepList = [...steps.entries()]
      .sort(([, a], [, b]) => b.max - a.max)
      .map(([label, { total, max }]) => `${label} ${fixed(total / frames, 2)}/${fixed(max, 2)}`)
      .join(" · ");
    log(
      [
        `Armada perf · ${fixed(covered / 1000)} s · ${frames} frames · ${fixed(fps)} fps · chunks ${probe.shownChunks()}`,
        `frame ms p50 ${fixed(percentile(intervals, 0.5))} · p95 ${fixed(percentile(intervals, 0.95))} · max ${fixed(Math.max(...intervals))} · over ${PERF_SLOW_FRAME_MS} ms: ${slow}`,
        `cpu ms p50 ${fixed(percentile(cpu, 0.5))} · p95 ${fixed(percentile(cpu, 0.95))} · max ${fixed(Math.max(0, ...cpu))} · draw calls avg ${fixed(averageDraws, 0)} · max ${Math.max(0, ...draws)}`,
        `textures ${fixed(memory.total)} MB (${kinds}) in ${textures.length} · js heap ${heap === undefined ? "n/a" : `${fixed(heap / MB)} MB`}`,
        `largest textures: ${memory.largest.map(({ name, count, megabytes }) => `${name} ×${count} = ${fixed(megabytes)} MB`).join(" · ") || "none"}`,
        `steps ms avg/max per frame: ${stepList || "none"}`,
      ].join("\n"),
    );
    reset();
  };

  return {
    profiler: {
      now,
      record: (label, ms) => {
        const times = steps.get(label);
        if (times === undefined) {
          steps.set(label, { total: ms, max: ms });
          return;
        }
        times.total += ms;
        times.max = Math.max(times.max, ms);
      },
    },
    frameStart: (elapsedMs) => {
      frameStartedAt = now();
      intervals.push(elapsedMs);
      covered += elapsedMs;
    },
    frameEnd: () => {
      if (frameStartedAt === undefined) return;
      cpu.push(now() - frameStartedAt);
      draws.push(probe.drawCalls());
      frameStartedAt = undefined;
      if (covered >= reportMs) report();
    },
    reset,
  };
}

/** The draw calls of a WebGL context, as {@link countDrawCalls} wraps them. */
const DRAW_METHODS = ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"] as const;

/** A WebGL context, as far as {@link countDrawCalls} needs it. */
export type DrawCallContext = Partial<Record<(typeof DRAW_METHODS)[number], (...args: never[]) => unknown>>;

/**
 * Counts the draw calls made on `gl` by wrapping its draw methods: `take()` returns the count since
 * the last call, `restore()` puts the methods back.
 */
export function countDrawCalls(gl: DrawCallContext): { take: () => number; restore: () => void } {
  let count = 0;
  const wrapped = DRAW_METHODS.flatMap((name) => {
    const original = gl[name];
    if (original === undefined) return [];
    const own = Object.hasOwn(gl, name);
    gl[name] = function (this: unknown, ...args: never[]) {
      count += 1;
      return original.apply(this, args);
    };
    return [{ name, original, own }];
  });
  return {
    take: () => {
      const taken = count;
      count = 0;
      return taken;
    },
    restore: () =>
      wrapped.forEach(({ name, original, own }) => {
        if (own) gl[name] = original;
        else delete gl[name];
      }),
  };
}

/** Options of {@link startPerfMonitor}. */
export type StartPerfOptions = {
  readonly now: () => number;
  readonly log: (message: string) => void;
  /** Bytes of JS heap in use, when the browser tells. */
  readonly heapBytes: () => number | undefined;
};

/** A running {@link startPerfMonitor}. */
export type RunningPerfMonitor = {
  /** Profiler to give the scene (`SceneOptions.profiler`). */
  readonly profiler: SceneProfiler;
  /**
   * Reports how many chunks `scene` shows, once it is built (until then, `0`), and starts the
   * measures over: the frames of the start, while the scene was built, would hide the rest.
   */
  readonly watch: (scene: { shownChunks: () => readonly unknown[] }) => void;
  /** Stops measuring and puts the renderer's draw calls back. */
  readonly destroy: () => void;
};

/**
 * Starts measuring `app`'s frames (`?perf`): a {@link createPerfMonitor} whose frames start at the
 * first ticker listener (`UPDATE_PRIORITY.INTERACTION`) and end after the render
 * (`UPDATE_PRIORITY.UTILITY`), counting the draw calls of the WebGL renderer and its textures.
 */
export function startPerfMonitor(app: Application, options: StartPerfOptions): RunningPerfMonitor {
  const renderer = app.renderer as unknown as {
    gl?: DrawCallContext;
    // Pixi leaves `null` where it unloaded a texture (its GC, or a destroyed one).
    texture?: { managedTextures?: ReadonlyArray<PerfTexture | null> };
  };
  const drawCalls = renderer.gl ? countDrawCalls(renderer.gl) : undefined;
  let watched: { shownChunks: () => readonly unknown[] } | undefined;
  const monitor = createPerfMonitor({
    now: options.now,
    log: options.log,
    probe: {
      drawCalls: () => drawCalls?.take() ?? 0,
      textures: () => (renderer.texture?.managedTextures ?? []).filter((texture) => texture !== null),
      heapBytes: options.heapBytes,
      shownChunks: () => watched?.shownChunks().length ?? 0,
    },
  });
  const onStart = (ticker: Ticker) => monitor.frameStart(ticker.elapsedMS);
  const onEnd = () => monitor.frameEnd();
  app.ticker.add(onStart, undefined, UPDATE_PRIORITY.INTERACTION);
  app.ticker.add(onEnd, undefined, UPDATE_PRIORITY.UTILITY);
  return {
    profiler: monitor.profiler,
    watch: (scene) => {
      watched = scene;
      monitor.reset();
    },
    destroy: () => {
      app.ticker.remove(onStart);
      app.ticker.remove(onEnd);
      drawCalls?.restore();
    },
  };
}
