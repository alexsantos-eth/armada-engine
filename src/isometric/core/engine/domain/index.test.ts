import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(
  ["/src/isometric/core/engine/**/*.ts", "/src/isometric/core/types/*.ts", "!**/*.test.ts"],
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
);
const entry = "/src/isometric/core/engine/domain/index.ts";
const forbiddenPackage = /^(pixi\.js|preact|@strudel\/web)(\/|$)/;
const forbiddenDirectory =
  /(^|\/)(scene|render|[^/]+-view|shadows|water-reflections|ambient-light|cloud-shadows|foliage-wind)(\/|$)/;

const importsOf = (source: string) =>
  [...source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);

function resolveImport(file: string, specifier: string): string {
  const segments = file.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== ".") segments.push(segment);
  }
  const base = segments.join("/");
  return `${base}.ts` in sources ? `${base}.ts` : `${base}/index.ts`;
}

describe("domain entry", () => {
  it("does not reach rendering, UI, browser or sound dependencies", () => {
    const visited = new Set<string>();
    const pending = [entry];
    const violations: string[] = [];

    while (pending.length > 0) {
      const file = pending.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = sources[file];
      if (source === undefined) {
        violations.push(`${file}: missing source`);
        continue;
      }
      if (/\b(?:window|document)\s*\.|\bnew\s+Worker\s*\(/.test(source)) violations.push(`${file}: browser API`);
      for (const specifier of importsOf(source)) {
        if (forbiddenPackage.test(specifier)) violations.push(`${file}: ${specifier}`);
        if (!specifier.startsWith(".")) continue;
        const dependency = resolveImport(file, specifier);
        if (forbiddenDirectory.test(dependency)) violations.push(`${file}: ${dependency}`);
        pending.push(dependency);
      }
    }

    expect(violations).toEqual([]);
    expect(visited.size).toBeGreaterThan(1);
  });
});
