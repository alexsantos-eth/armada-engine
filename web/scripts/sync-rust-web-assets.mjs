import { cp, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { constants } from "node:fs";
import process from "node:process";

const webRoot = resolve(import.meta.dirname, "..");
const projectRoot = resolve(webRoot, "..");
const contentSource = resolve(projectRoot, "lib", "content");
const rustWebRoot = resolve(projectRoot, "lib", "web");
const publicRoot = resolve(webRoot, "public", "lib");
const contentDestination = resolve(publicRoot, "content");
const wasmSource = resolve(
  projectRoot,
  "lib",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "iso-core.wasm",
);
const publishedWasm = resolve(rustWebRoot, "iso-core.wasm");
const wasmDestination = resolve(publicRoot, "iso-core.wasm");

await mkdir(rustWebRoot, { recursive: true });
await mkdir(publicRoot, { recursive: true });
await cp(contentSource, resolve(rustWebRoot, "content"), { recursive: true });
await cp(contentSource, contentDestination, { recursive: true });

if (process.argv.includes("--wasm")) {
  await access(wasmSource, constants.R_OK);
  await cp(wasmSource, publishedWasm);
} else {
  await access(publishedWasm, constants.R_OK);
}
await cp(publishedWasm, wasmDestination);
