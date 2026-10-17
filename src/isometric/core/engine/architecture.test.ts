import { describe, expect, it } from "vitest";

/**
 * Guards the layering of the engine. Each module may only import the modules listed here
 * (through their barrel), so the dependency graph stays acyclic and domain code never
 * reaches Pixi or the browser:
 *
 * constants, random → terrain → entities → world → scene ← projection, culling, render
 */
const ALLOWED_DEPENDENCIES: Record<string, readonly string[]> = {
  constants: [],
  random: [],
  projection: [],
  culling: ["constants"],
  terrain: ["constants", "random"],
  entities: ["random", "terrain"],
  world: ["constants", "entities", "random", "terrain"],
  render: [],
  scene: ["constants", "culling", "entities", "projection", "render", "terrain", "world"],
};

/** Modules allowed to import Pixi. Everything else is pure domain logic. */
const PIXI_MODULES = new Set(["render", "scene"]);

const sources = import.meta.glob<string>(["./*/*.ts", "!./**/*.test.ts"], {
  eager: true,
  query: "?raw",
  import: "default",
});

const files = Object.entries(sources).map(([path, source]) => ({
  path,
  module: path.split("/")[1],
  source,
  // `… from "x"`, side-effect `import "x"` and dynamic `import("x")`.
  imports: [...source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]),
}));

describe("engine architecture", () => {
  it("covers every engine module", () => {
    expect(new Set(files.map(({ module }) => module))).toEqual(
      new Set(Object.keys(ALLOWED_DEPENDENCIES)),
    );
  });

  it.each(files)("$path only depends on its allowed modules, through their barrels", ({ module, imports }) => {
    const engineImports = imports.filter((target) => target.startsWith("../") && !target.startsWith("../../"));

    engineImports.forEach((target) => {
      const [, dependency, ...rest] = target.split("/");
      expect(rest, `${target} must import the "../${dependency}" barrel`).toEqual([]);
      expect(ALLOWED_DEPENDENCIES[module], `${module} must not import ${dependency}`).toContain(dependency);
    });
  });

  it.each(files)("$path uses Pixi only in render and scene", ({ module, imports }) => {
    if (PIXI_MODULES.has(module)) return;
    expect(imports).not.toContain("pixi.js");
  });

  it.each(files)("$path does not read browser globals", ({ source }) => {
    expect(source).not.toMatch(/\b(window|document|localStorage)\s*\./);
  });
});
