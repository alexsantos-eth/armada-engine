import { cp, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { constants } from "node:fs";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const contentSource = resolve(root, "lib", "content");
const publicRoot = resolve(root, "public", "lib");
const contentDestination = resolve(publicRoot, "content");
const wasmSource = resolve(
  root,
  "lib",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "iso-core.wasm",
);
const wasmDestination = resolve(publicRoot, "iso-core.wasm");

await mkdir(publicRoot, { recursive: true });
await cp(contentSource, contentDestination, { recursive: true });

if (process.argv.includes("--wasm")) {
  await access(wasmSource, constants.R_OK);
  await cp(wasmSource, wasmDestination);
} else {
  await access(wasmDestination, constants.R_OK);
}
