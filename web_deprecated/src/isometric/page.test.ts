import { describe, expect, it } from "vitest";
import page from "./page.tsx?raw";

/** `… from "x"`, side-effect `import "x"` and dynamic `import("x")`. */
const imports = [...page.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);

describe("page", () => {
  it("stays declarative: only Preact's hooks and the game layer, never Pixi or the core", () => {
    expect(imports.sort()).toEqual(["./game", "preact/hooks"]);
  });

  it("mounts the game from a single effect and returns its teardown", () => {
    expect(page.match(/useEffect\(/g)).toHaveLength(1);
    expect(page).toMatch(/useEffect\(\(\) => mountGame\([^]*?\)\.destroy, \[\]\)/);
  });
});
