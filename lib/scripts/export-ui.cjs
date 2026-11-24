#!/usr/bin/env node
/*
 * Exports the HTML UI kit (web/ui/) for the native client: every [data-piece] of web/ui/export.html
 * becomes a transparent PNG drawn by the real CSS, and content/ui/ui.json records each piece's size,
 * the room around its shape and its nine-slice border, plus the kit's colour tokens. The item icons
 * are copied alongside. Macroquad draws the HUD from these (src/ui/), so the CSS stays the one
 * source of the look; run this again after changing armada-ui.css or the icons, and commit content/ui/.
 *
 * Needs Node and Playwright with Chromium (npx playwright install chromium).
 * Run from anywhere: node lib/scripts/export-ui.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const SCALE = 2;
const TOKENS = ["ink", "paper", "paper-shade", "cream", "umber", "gold", "red", "leaf", "sky", "text", "text-muted"];

const lib = path.resolve(__dirname, "..");
const page = pathToFileURL(path.join(lib, "web/ui/export.html")).href;
const out = path.join(lib, "content/ui");

(async () => {
  fs.mkdirSync(path.join(out, "items"), { recursive: true });
  const browser = await chromium.launch();
  const tab = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { width: 1200, height: 900 } });
  await tab.goto(page);
  await tab.waitForSelector("html[data-ready]");
  const pieces = {};
  for (const handle of await tab.$$("[data-piece]")) {
    const { name, slice, pad } = await handle.evaluate((node) => ({
      name: node.dataset.piece,
      slice: Number(node.dataset.slice || 0),
      pad: parseFloat(getComputedStyle(node).paddingLeft),
    }));
    const file = `${name}.png`;
    await handle.screenshot({ path: path.join(out, file), omitBackground: true });
    const box = await handle.boundingBox();
    pieces[name] = {
      file: `ui/${file}`,
      width: Math.round(box.width * SCALE),
      height: Math.round(box.height * SCALE),
      pad: Math.round(pad * SCALE),
      slice: Math.round(slice * SCALE),
    };
  }
  const colors = await tab.evaluate((names) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name.replace(/-/g, "_"), style.getPropertyValue(`--ac-${name}`).trim()]));
  }, TOKENS);
  await browser.close();
  for (const icon of fs.readdirSync(path.join(lib, "web/ui/items"))) {
    fs.copyFileSync(path.join(lib, "web/ui/items", icon), path.join(out, "items", icon));
  }
  const manifest = { schemaVersion: 1, scale: SCALE, items: "ui/items", colors, pieces };
  fs.writeFileSync(path.join(out, "ui.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`exported ${Object.keys(pieces).length} pieces to ${path.relative(process.cwd(), out)}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
