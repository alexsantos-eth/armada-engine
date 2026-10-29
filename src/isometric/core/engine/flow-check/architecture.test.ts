import { describe, expect, it } from "vitest";

/**
 * Guards the layering of the engine. Each module may only import the modules listed here
 * (through their barrel), so the dependency graph stays acyclic and domain code never
 * reaches Pixi or the browser:
 *
 * random → grid → terrain → entities → world → simulation (with events); the world is made of chunks
 * (`WorldChunks`) generated from the seed and loaded around the camera and the player.
 * parts (the `WorldParts` container) → world; time and player own their world parts (`CLOCK_PART`,
 * `PLAYER_PART`), so the world never names them: the app registers them (`generateWorld({ parts })`).
 * player uses XState's pure transition API for deterministic locomotion ticks.
 * The simulation runs the game systems the app hands it (`WorldSystem`), e.g. `createPlayerSystem()`.
 * grid → paths (A* and path networks, connection masks) → world (the settlements' paths) and terrain-view
 * constants (view metrics) → lighting (shadow geometry)
 * projection, grid → camera (view maths on the ground plane, and the chunks in view)
 * render (Pixi primitives) → scene (the compositor and the `SceneModule` contract)
 * random → wind (how swaying entities lean, from their sway and the time)
 * waves (how bands of light drift across the terrain, from their bands and the time)
 * scene → scene modules: surface-bands, terrain-view, entity-view, foliage-wind, shadows, ambient-light,
 * player-view, camera-view
 *
 * The scene draws nothing itself: the app hands it a list of scene modules. A scene module never
 * imports another one (they share services through the scene), and the scene never imports them.
 *
 * Outside the engine, a module may only reach the shared types (`../../types`): the engine
 * never imports game content. Content (`src/isometric/content`) is plain data and only
 * imports core types; the app wires both together.
 */
const ALLOWED_DEPENDENCIES: Record<string, readonly string[]> = {
  constants: [],
  camera: ["grid", "projection"],
  random: [],
  events: [],
  parts: [],
  time: [],
  projection: [],
  grid: [],
  lighting: ["constants"],
  terrain: ["grid", "random"],
  entities: ["grid", "random", "terrain"],
  player: ["grid", "time", "xstate"],
  paths: ["grid"],
  world: ["entities", "grid", "parts", "paths", "random", "terrain"],
  render: [],
  simulation: ["events", "time", "world"],
  scene: ["camera", "constants", "entities", "grid", "render", "terrain", "time", "world"],
  "terrain-view": ["paths", "projection", "render", "scene", "terrain"],
  "entity-view": ["entities", "projection", "render", "scene"],
  shadows: ["camera", "lighting", "projection", "render", "scene", "terrain", "world"],
  wind: ["random"],
  "foliage-wind": ["scene", "wind"],
  waves: [],
  "surface-bands": ["scene", "waves"],
  "ambient-light": ["lighting", "render", "scene"],
  "camera-view": ["camera", "scene"],
  "cloud-shadows": ["constants", "scene"],
  "player-view": ["camera", "player", "projection", "render", "scene"],
};

/** Scene modules: drawn by the scene from the list the app gives it. */
const SCENE_MODULES = new Set([
  "surface-bands",
  "terrain-view",
  "entity-view",
  "foliage-wind",
  "shadows",
  "ambient-light",
  "camera-view",
  "cloud-shadows",
  "player-view",
]);

/** Modules allowed to import Pixi. Everything else is pure domain logic. */
const PIXI_MODULES = new Set(["render", "scene", ...SCENE_MODULES]);

// Every engine module but `flow-check`, which holds the checks and their test support.
const sources = import.meta.glob<string>(["../*/*.ts", "!../**/*.test.ts", "!../flow-check/**"], {
  eager: true,
  query: "?raw",
  import: "default",
});

const contentSources = import.meta.glob<string>(["../../../content/*.ts", "!../../../content/*.test.ts"], {
  eager: true,
  query: "?raw",
  import: "default",
});

/** `… from "x"`, side-effect `import "x"` and dynamic `import("x")`. */
const importsOf = (source: string) =>
  [...source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);

const files = Object.entries(sources).map(([path, source]) => ({
  path,
  module: path.split("/")[1],
  source,
  imports: importsOf(source),
}));

/**
 * Every source file of the app, to check that each one has its test beside it (`foo.ts` next to
 * `foo.test.ts`). Only `flow-check` holds tests and test support of no single file.
 */
const appFiles = Object.keys(import.meta.glob(["/src/**/*.{ts,tsx}", "!/src/**/*.d.ts"])).map((path) => path.slice(1));

/** Files that need no test of their own: barrels, shared type declarations and the entry point. */
const isExempt = (path: string) =>
  path.endsWith("/index.ts") || path.startsWith("src/isometric/core/types/") || path === "src/main.tsx";

const inFlowCheck = (path: string) => path.startsWith("src/isometric/core/engine/flow-check/");

const contentFiles = Object.entries(contentSources).map(([path, source]) => ({
  path,
  imports: importsOf(source),
}));

describe("test layout", () => {
  const tests = new Set(appFiles.filter((path) => /\.test\.tsx?$/.test(path)));
  const sourcesOf = (path: string) => [path.replace(/\.test\.tsx?$/, ".ts"), path.replace(/\.test\.tsx?$/, ".tsx")];
  const testsOf = (path: string) => [path.replace(/\.tsx?$/, ".test.ts"), path.replace(/\.tsx?$/, ".test.tsx")];

  it("finds the app files", () => {
    expect(appFiles).toContain("src/isometric/page.tsx");
  });

  it.each([...tests].filter((path) => !inFlowCheck(path)))("%s sits beside the file it tests", (path) => {
    expect(sourcesOf(path).some((source) => appFiles.includes(source))).toBe(true);
  });

  it.each(appFiles.filter((path) => !tests.has(path) && !isExempt(path) && !inFlowCheck(path)))(
    "%s has its test beside it",
    (path) => {
      expect(testsOf(path).some((test) => tests.has(test))).toBe(true);
    },
  );
});

describe("engine architecture", () => {
  it("covers every engine module", () => {
    expect(new Set(files.map(({ module }) => module))).toEqual(new Set(Object.keys(ALLOWED_DEPENDENCIES)));
  });

  it.each(files)("$path only depends on its allowed modules, through their barrels", ({ module, imports }) => {
    const engineImports = imports.filter((target) => target.startsWith("../") && !target.startsWith("../../"));

    engineImports.forEach((target) => {
      const [, dependency, ...rest] = target.split("/");
      expect(rest, `${target} must import the "../${dependency}" barrel`).toEqual([]);
      expect(ALLOWED_DEPENDENCIES[module], `${module} must not import ${dependency}`).toContain(dependency);
    });
  });

  it("keeps scene modules independent: none depends on another, and the scene on none", () => {
    Object.entries(ALLOWED_DEPENDENCIES).forEach(([module, dependencies]) => {
      if (module !== "scene" && !SCENE_MODULES.has(module)) return;
      dependencies.forEach((dependency) =>
        expect(SCENE_MODULES.has(dependency), `${module} → ${dependency}`).toBe(false),
      );
    });
  });

  it.each(files)("$path only leaves the engine to reach the shared types", ({ imports }) => {
    const outside = imports.filter((target) => target.startsWith("../../"));
    outside.forEach((target) => expect(target).toBe("../../types"));
  });

  it("finds the content modules", () => {
    expect(contentFiles.length).toBeGreaterThan(0);
  });

  it.each(contentFiles)("content $path only imports core types", ({ imports }) => {
    imports.forEach((target) => expect(target).toMatch(/^(\.\/|\.\.\/core\/types$)/));
  });

  it.each(files)("$path uses Pixi only in render, the scene and scene modules", ({ module, imports }) => {
    if (PIXI_MODULES.has(module)) return;
    expect(imports).not.toContain("pixi.js");
  });

  it.each(files)('$path uses numeric cell keys instead of "x:y" strings', ({ source }) => {
    expect(source).not.toMatch(/`\$\{[^}]+\}:\$\{[^}]+\}`/);
  });

  it.each(files)("$path does not read browser globals", ({ source }) => {
    expect(source).not.toMatch(/\b(window|document|localStorage)\s*\./);
  });
});
