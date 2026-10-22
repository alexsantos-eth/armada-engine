import { describe, expect, it } from "vitest";

/**
 * Guards the layering of the engine. Each module may only import the modules listed here
 * (through their barrel), so the dependency graph stays acyclic and domain code never
 * reaches Pixi or the browser:
 *
 * constants, random → grid → terrain → entities → world → scene ← projection, render
 * time → world (the world holds the game clock) → simulation (fixed-step loop)
 * constants → lighting (shadow geometry) → scene
 *
 * Outside the engine, a module may only reach the shared types (`../../types`): the engine
 * never imports game content. Content (`src/isometric/content`) is plain data and only
 * imports core types; the app wires both together.
 */
const ALLOWED_DEPENDENCIES: Record<string, readonly string[]> = {
  constants: [],
  random: [],
  time: [],
  projection: [],
  grid: ["constants"],
  lighting: ["constants"],
  terrain: ["constants", "grid", "random"],
  entities: ["grid", "random", "terrain"],
  world: ["constants", "entities", "grid", "random", "terrain", "time"],
  render: [],
  simulation: ["time", "world"],
  scene: ["constants", "entities", "grid", "lighting", "projection", "render", "terrain", "time", "world"],
};

/** Modules allowed to import Pixi. Everything else is pure domain logic. */
const PIXI_MODULES = new Set(["render", "scene"]);

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

  it.each(files)("$path uses Pixi only in render and scene", ({ module, imports }) => {
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
