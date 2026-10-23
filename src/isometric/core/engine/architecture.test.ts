import { describe, expect, it } from "vitest";

/**
 * Guards the layering of the engine. Each module may only import the modules listed here
 * (through their barrel), so the dependency graph stays acyclic and domain code never
 * reaches Pixi or the browser:
 *
 * random → grid → terrain → entities → world (with player and time) → simulation (with events)
 * The simulation runs the game systems the app hands it (`WorldSystem`), e.g. `createPlayerSystem()`.
 * constants (view metrics) → lighting (shadow geometry)
 * projection → camera (view maths on the ground plane)
 * render (Pixi primitives) → scene (the compositor and the `SceneModule` contract)
 * scene → scene modules: terrain-view, entity-view, shadows, ambient-light, player-view, camera-view
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
  camera: ["projection"],
  random: [],
  events: [],
  time: [],
  projection: [],
  grid: [],
  lighting: ["constants"],
  terrain: ["grid", "random"],
  entities: ["grid", "random", "terrain"],
  player: ["grid", "time"],
  world: ["entities", "grid", "player", "random", "terrain", "time"],
  render: [],
  simulation: ["events", "time", "world"],
  scene: ["camera", "constants", "entities", "grid", "render", "terrain", "world"],
  "terrain-view": ["projection", "render", "scene", "terrain"],
  "entity-view": ["entities", "projection", "render", "scene"],
  shadows: ["lighting", "projection", "render", "scene", "time"],
  "ambient-light": ["render", "scene", "time"],
  "camera-view": ["camera", "scene"],
  "player-view": ["camera", "player", "projection", "render", "scene"],
};

/** Scene modules: drawn by the scene from the list the app gives it. */
const SCENE_MODULES = new Set([
  "terrain-view",
  "entity-view",
  "shadows",
  "ambient-light",
  "camera-view",
  "player-view",
]);

/** Modules allowed to import Pixi. Everything else is pure domain logic. */
const PIXI_MODULES = new Set(["render", "scene", ...SCENE_MODULES]);

const sources = import.meta.glob<string>(["./*/*.ts", "!./**/*.test.ts"], {
  eager: true,
  query: "?raw",
  import: "default",
});

const contentSources = import.meta.glob<string>(["../../content/*.ts", "!../../content/*.test.ts"], {
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

const contentFiles = Object.entries(contentSources).map(([path, source]) => ({
  path,
  imports: importsOf(source),
}));

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
